'use client';

import { CheckCircle2, Pencil, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Dialog, EmptyState, Field, Input, Select, Spinner, StatusBadge, Table, Td, Th } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/client/api';
import { fmtDate, fmtMinute, parseHHMM } from '@/lib/client/format';
import { formatDuration, parseDuration } from '@/lib/time/duration';

interface Advertiser {
  id: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  _count: { campaigns: number };
}
interface Campaign {
  id: string;
  name: string;
  advertiser: { id: string; name: string };
  startDate: string;
  endDate: string;
  priority: number;
  maxAirings: number | null;
  contractedAirings: number | null;
  dailyLimit: number | null;
  weeklyLimit: number | null;
  minSpacingMs: number | null;
  allowedStartMinute: number | null;
  allowedEndMinute: number | null;
  budgetCents: number | null;
  status: string;
  approvalState: string;
  channelIds: string[];
  creatives: Array<{ advertisementId: string; id: string; title: string; plannedDurationMs: number; houseNumber: string | null }>;
  plannedAirings: number;
  airedAirings: number;
  remainingAirings: number | null;
}

export function AdsManager({ channels, canManage }: { channels: Array<{ id: string; name: string }>; canManage: boolean }) {
  const toast = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [advertisers, setAdvertisers] = useState<Advertiser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editCampaign, setEditCampaign] = useState<Campaign | 'new' | null>(null);
  const [editAdv, setEditAdv] = useState<Advertiser | 'new' | null>(null);
  const [creativeFor, setCreativeFor] = useState<Campaign | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, a] = await Promise.all([api<Campaign[]>('/api/campaigns'), api<Advertiser[]>('/api/advertisers')]);
      setCampaigns(c);
      setAdvertisers(a);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-5">
      {error && <Alert tone="error">{error}</Alert>}
      <Card
        title="Campaigns"
        accent="#fb923c"
        actions={
          canManage && (
            <Button variant="primary" onClick={() => setEditCampaign('new')} disabled={!advertisers.length}>
              <Plus className="size-4" /> New campaign
            </Button>
          )
        }
      >
        {!campaigns ? (
          <Spinner />
        ) : campaigns.length === 0 ? (
          <EmptyState title="No campaigns yet" />
        ) : (
          <Table caption="Campaigns">
            <thead>
              <tr>
                <Th>Campaign</Th>
                <Th>Flight</Th>
                <Th>Limits</Th>
                <Th>Creatives</Th>
                <Th>Delivery</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const cap = c.contractedAirings ?? c.maxAirings;
                const booked = c.plannedAirings + c.airedAirings;
                return (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <Td>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted">
                        {c.advertiser.name} · priority {c.priority}
                      </div>
                    </Td>
                    <Td className="text-xs">
                      {fmtDate(c.startDate)} – {fmtDate(c.endDate)}
                      {c.allowedStartMinute != null && (
                        <div className="text-muted">
                          Hours {fmtMinute(c.allowedStartMinute)}–{fmtMinute(c.allowedEndMinute)}
                        </div>
                      )}
                    </Td>
                    <Td className="text-xs">
                      {c.dailyLimit && <div>{c.dailyLimit}/day</div>}
                      {c.weeklyLimit && <div>{c.weeklyLimit}/week</div>}
                      {c.minSpacingMs != null && c.minSpacingMs > 0 && <div>≥ {formatDuration(c.minSpacingMs)} apart</div>}
                      {c.maxAirings && <div>max {c.maxAirings}</div>}
                    </Td>
                    <Td className="text-xs">
                      <ul>
                        {c.creatives.map((cr) => (
                          <li key={cr.id}>
                            {cr.title} <span className="text-muted">({formatDuration(cr.plannedDurationMs)})</span>
                          </li>
                        ))}
                      </ul>
                      {canManage && (
                        <button type="button" className="mt-1 text-teal-700 hover:underline" onClick={() => setCreativeFor(c)}>
                          + Add creative
                        </button>
                      )}
                    </Td>
                    <Td className="min-w-40 text-xs">
                      <div className="tabular">
                        {booked} booked{cap ? ` / ${cap}` : ''} · {c.airedAirings} aired
                      </div>
                      {cap ? (
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={booked} aria-valuemax={cap} aria-label="Booked against contract">
                          <div className="h-full bg-amber-400" style={{ width: `${Math.min(100, (booked / cap) * 100)}%` }} />
                        </div>
                      ) : null}
                      {c.remainingAirings != null && <div className="mt-0.5 text-muted">{c.remainingAirings} remaining</div>}
                    </Td>
                    <Td>
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge status={c.status} />
                        <StatusBadge status={c.approvalState} />
                      </div>
                    </Td>
                    <Td className="text-right">
                      {canManage && (
                        <div className="flex justify-end gap-1">
                          {c.approvalState !== 'APPROVED' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Approve ${c.name}`}
                              onClick={async () => {
                                try {
                                  await api(`/api/campaigns/${c.id}/approval`, { body: { state: 'APPROVED' } });
                                  toast('Campaign approved');
                                  load();
                                } catch (e) {
                                  toast(errorMessage(e), 'error');
                                }
                              }}
                            >
                              <CheckCircle2 className="size-4 text-teal-700" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setEditCampaign(c)} aria-label={`Edit ${c.name}`}>
                            <Pencil className="size-4" />
                          </Button>
                        </div>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <p className="mt-3 text-xs text-muted">
          Booked airings are created when a schedule is published. “Aired” counts require as-run data from a playout system, which is not connected. Spots are placed manually in the schedule editor; quotas, dates, hours, channels and spacing are enforced by schedule validation.
        </p>
      </Card>

      <Card
        title="Advertisers"
        accent="#e6a935"
        actions={
          canManage && (
            <Button onClick={() => setEditAdv('new')}>
              <Plus className="size-4" /> New advertiser
            </Button>
          )
        }
      >
        <Table caption="Advertisers">
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Contact</Th>
              <Th>Campaigns</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {advertisers.map((a) => (
              <tr key={a.id}>
                <Td className="font-medium">{a.name}</Td>
                <Td className="text-xs">
                  {a.contactName} {a.contactEmail && <span className="text-muted">· {a.contactEmail}</span>}
                </Td>
                <Td>{a._count.campaigns}</Td>
                <Td className="text-right">
                  {canManage && (
                    <Button size="sm" variant="ghost" onClick={() => setEditAdv(a)} aria-label={`Edit ${a.name}`}>
                      <Pencil className="size-4" />
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {editCampaign && <CampaignForm campaign={editCampaign === 'new' ? null : editCampaign} advertisers={advertisers} channels={channels} onClose={() => setEditCampaign(null)} onSaved={() => (setEditCampaign(null), toast('Campaign saved'), load())} />}
      {editAdv && <AdvertiserForm advertiser={editAdv === 'new' ? null : editAdv} onClose={() => setEditAdv(null)} onSaved={() => (setEditAdv(null), toast('Advertiser saved'), load())} />}
      {creativeFor && <CreativeForm campaign={creativeFor} onClose={() => setCreativeFor(null)} onSaved={() => (setCreativeFor(null), toast('Creative added'), load())} />}
    </div>
  );
}

function CampaignForm({ campaign, advertisers, channels, onClose, onSaved }: { campaign: Campaign | null; advertisers: Advertiser[]; channels: Array<{ id: string; name: string }>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: campaign?.name ?? '',
    advertiserId: campaign?.advertiser.id ?? advertisers[0]?.id ?? '',
    startDate: campaign?.startDate ?? '',
    endDate: campaign?.endDate ?? '',
    priority: String(campaign?.priority ?? 5),
    maxAirings: campaign?.maxAirings ? String(campaign.maxAirings) : '',
    contractedAirings: campaign?.contractedAirings ? String(campaign.contractedAirings) : '',
    dailyLimit: campaign?.dailyLimit ? String(campaign.dailyLimit) : '',
    weeklyLimit: campaign?.weeklyLimit ? String(campaign.weeklyLimit) : '',
    minSpacing: campaign?.minSpacingMs ? String(campaign.minSpacingMs / 60_000) : '',
    hoursFrom: campaign?.allowedStartMinute != null ? fmtMinute(campaign.allowedStartMinute) : '',
    hoursTo: campaign?.allowedEndMinute != null ? fmtMinute(campaign.allowedEndMinute) : '',
    budget: campaign?.budgetCents != null ? String(campaign.budgetCents / 100) : '',
    status: campaign?.status ?? 'DRAFT',
    channelIds: campaign?.channelIds ?? [],
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const num = (v: string) => (v.trim() ? Number(v) : null);

  async function save() {
    const hs = f.hoursFrom ? parseHHMM(f.hoursFrom) : null;
    const he = f.hoursTo ? (f.hoursTo === '24:00' ? 1440 : parseHHMM(f.hoursTo)) : null;
    if ((f.hoursFrom && hs == null) || (f.hoursTo && he == null)) return setError('Hours must be HH:MM.');
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: f.name,
        advertiserId: f.advertiserId,
        startDate: f.startDate,
        endDate: f.endDate,
        priority: Number(f.priority),
        maxAirings: num(f.maxAirings),
        contractedAirings: num(f.contractedAirings),
        dailyLimit: num(f.dailyLimit),
        weeklyLimit: num(f.weeklyLimit),
        minSpacingMs: f.minSpacing ? Math.round(Number(f.minSpacing) * 60_000) : null,
        allowedStartMinute: hs,
        allowedEndMinute: he,
        budgetCents: f.budget ? Math.round(Number(f.budget) * 100) : null,
        status: f.status,
        channelIds: f.channelIds,
      };
      await api(campaign ? `/api/campaigns/${campaign.id}` : '/api/campaigns', { method: campaign ? 'PUT' : 'POST', body });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={campaign ? `Edit ${campaign.name}` : 'New campaign'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={save} disabled={!f.name || !f.startDate || !f.endDate}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
        {error && <Alert tone="error" className="md:col-span-3">{error}</Alert>}
        <Field label="Campaign name" className="md:col-span-2">{(id) => <Input id={id} value={f.name} onChange={set('name')} />}</Field>
        <Field label="Advertiser">
          {(id) => (
            <Select id={id} value={f.advertiserId} onChange={set('advertiserId')}>
              {advertisers.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Start date">{(id) => <Input id={id} type="date" value={f.startDate} onChange={set('startDate')} />}</Field>
        <Field label="End date">{(id) => <Input id={id} type="date" value={f.endDate} onChange={set('endDate')} />}</Field>
        <Field label="Status">
          {(id) => (
            <Select id={id} value={f.status} onChange={set('status')}>
              {['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'].map((s) => (
                <option key={s} value={s}>
                  {s.toLowerCase()}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Priority (1 = highest)">{(id) => <Input id={id} inputMode="numeric" value={f.priority} onChange={set('priority')} />}</Field>
        <Field label="Contracted airings">{(id) => <Input id={id} inputMode="numeric" value={f.contractedAirings} onChange={set('contractedAirings')} />}</Field>
        <Field label="Maximum airings">{(id) => <Input id={id} inputMode="numeric" value={f.maxAirings} onChange={set('maxAirings')} />}</Field>
        <Field label="Daily limit">{(id) => <Input id={id} inputMode="numeric" value={f.dailyLimit} onChange={set('dailyLimit')} />}</Field>
        <Field label="Weekly limit">{(id) => <Input id={id} inputMode="numeric" value={f.weeklyLimit} onChange={set('weeklyLimit')} />}</Field>
        <Field label="Min. spacing (minutes)">{(id) => <Input id={id} inputMode="decimal" value={f.minSpacing} onChange={set('minSpacing')} />}</Field>
        <Field label="Allowed from (HH:MM)">{(id) => <Input id={id} value={f.hoursFrom} onChange={set('hoursFrom')} />}</Field>
        <Field label="Allowed until (HH:MM)">{(id) => <Input id={id} value={f.hoursTo} onChange={set('hoursTo')} />}</Field>
        <Field label="Budget">{(id) => <Input id={id} inputMode="decimal" value={f.budget} onChange={set('budget')} />}</Field>
        <fieldset className="md:col-span-3">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-navy-700">Target channels (none = all)</legend>
          <div className="flex flex-wrap gap-3">
            {channels.map((c) => (
              <label key={c.id} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={f.channelIds.includes(c.id)} onChange={(e) => setF((x) => ({ ...x, channelIds: e.target.checked ? [...x.channelIds, c.id] : x.channelIds.filter((y) => y !== c.id) }))} />
                {c.name}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </Dialog>
  );
}

function AdvertiserForm({ advertiser, onClose, onSaved }: { advertiser: Advertiser | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(advertiser?.name ?? '');
  const [contactName, setContactName] = useState(advertiser?.contactName ?? '');
  const [contactEmail, setContactEmail] = useState(advertiser?.contactEmail ?? '');
  const [error, setError] = useState<string | null>(null);
  async function save() {
    try {
      await api(advertiser ? `/api/advertisers/${advertiser.id}` : '/api/advertisers', { method: advertiser ? 'PUT' : 'POST', body: { name, contactName, contactEmail } });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={advertiser ? 'Edit advertiser' : 'New advertiser'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Name">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Contact name">{(id) => <Input id={id} value={contactName} onChange={(e) => setContactName(e.target.value)} />}</Field>
        <Field label="Contact email">{(id) => <Input id={id} type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />}</Field>
      </div>
    </Dialog>
  );
}

function CreativeForm({ campaign, onClose, onSaved }: { campaign: Campaign; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState('');
  const [houseNumber, setHouseNumber] = useState('');
  const [duration, setDuration] = useState('00:00:30');
  const [error, setError] = useState<string | null>(null);
  async function save() {
    const ms = parseDuration(duration);
    if (!ms) return setError('Duration must be HH:MM:SS and greater than zero.');
    try {
      await api(`/api/campaigns/${campaign.id}/creatives`, { body: { title, houseNumber, plannedDurationMs: ms } });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={`New creative for ${campaign.name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!title.trim()}>
            Add creative
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Title">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <Field label="House number">{(id) => <Input id={id} value={houseNumber} onChange={(e) => setHouseNumber(e.target.value)} />}</Field>
        <Field label="Duration" hint="Spot durations are fixed once created.">{(id, d) => <Input id={id} aria-describedby={d} value={duration} onChange={(e) => setDuration(e.target.value)} />}</Field>
      </div>
    </Dialog>
  );
}
