'use client';

import { Archive, CheckCircle2, Pencil, Plus, Search, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, CategoryChip, Dialog, EmptyState, Field, Input, Pagination, Select, Spinner, StatusBadge, Table, Td, Textarea, Th } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/client/api';
import { fmtDateTime, fmtMinute, parseHHMM } from '@/lib/client/format';
import { CATEGORY_LABELS, type ContentCategory, type Paged } from '@/lib/dto';
import { formatDuration, parseDuration } from '@/lib/time/duration';

export interface ContentRow {
  id: string;
  houseNumber: string | null;
  title: string;
  category: ContentCategory;
  description: string | null;
  plannedDurationMs: number;
  originalDurationMs: number | null;
  isDurationEditable: boolean;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  approvalState: 'PENDING' | 'APPROVED' | 'REJECTED';
  language: string | null;
  rating: string | null;
  rightsHolder: string | null;
  licenseNotes: string | null;
  maxAiringsPerDay: number | null;
  availableFrom: string | null;
  availableUntil: string | null;
  allowedStartMinute: number | null;
  allowedEndMinute: number | null;
  asset: { id: string; originalName: string; status: string } | null;
  assetId: string | null;
  channelIds: string[];
  campaign: { id: string; name: string } | null;
  updatedAt: string;
}

interface Props {
  categories: ContentCategory[];
  channels: Array<{ id: string; name: string }>;
  canManage: boolean;
  canApprove: boolean;
}

export function ContentCatalog({ categories, channels, canManage, canApprove }: Props) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('title');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<ContentRow> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ContentRow | 'new' | null>(null);

  const load = useCallback(async () => {
    const p = new URLSearchParams({ page: String(page), pageSize: '25', sort, dir: sort === 'updatedAt' ? 'desc' : 'asc', category: category || categories.join(',') });
    if (q) p.set('q', q);
    if (status) p.set('status', status);
    try {
      setData(await api<Paged<ContentRow>>(`/api/content?${p}`));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [page, sort, category, categories, q, status]);
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast(msg);
      load();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  return (
    <Card
      actions={
        canManage && (
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Plus className="size-4" /> New item
          </Button>
        )
      }
      title="Catalogue"
    >
      <div className="mb-3 flex flex-wrap gap-3">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-2 top-2.5 size-4 text-slate-400" aria-hidden />
          <Input className="pl-8" placeholder="Search title or house no." aria-label="Search" value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} />
        </div>
        {categories.length > 1 && (
          <Select className="w-44" aria-label="Category" value={category} onChange={(e) => (setCategory(e.target.value), setPage(1))}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        )}
        <Select className="w-40" aria-label="Status" value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))}>
          <option value="">Active & draft</option>
          <option value="ACTIVE">Active</option>
          <option value="DRAFT">Draft</option>
          <option value="ARCHIVED">Archived</option>
        </Select>
        <Select className="w-44" aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="title">Sort: title</option>
          <option value="updatedAt">Sort: recently updated</option>
          <option value="plannedDurationMs">Sort: duration</option>
          <option value="category">Sort: category</option>
        </Select>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {!data && !error && <Spinner />}
      {data && data.items.length === 0 && <EmptyState title="No content found">Adjust the filters{canManage ? ' or add a new item' : ''}.</EmptyState>}
      {data && data.items.length > 0 && (
        <Table caption="Content items">
          <thead>
            <tr>
              <Th>Title</Th>
              <Th>Category</Th>
              <Th>Duration</Th>
              <Th>Rating</Th>
              <Th>Window</Th>
              <Th>Media</Th>
              <Th>Status</Th>
              <Th>Updated</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <Td>
                  <div className="font-medium text-navy-900">{c.title}</div>
                  <div className="text-xs text-muted">
                    {c.houseNumber}
                    {c.campaign && ` · ${c.campaign.name}`}
                  </div>
                </Td>
                <Td>
                  <CategoryChip category={c.category} />
                </Td>
                <Td className="tabular">
                  {formatDuration(c.plannedDurationMs)}
                  {!c.isDurationEditable && <span className="ml-1 text-[10px] uppercase text-muted">fixed</span>}
                </Td>
                <Td>{c.rating ?? '—'}</Td>
                <Td className="tabular text-xs">{c.allowedStartMinute != null ? `${fmtMinute(c.allowedStartMinute)}–${fmtMinute(c.allowedEndMinute)}` : 'Any'}</Td>
                <Td className="text-xs">{c.asset ? <span className={c.asset.status === 'MISSING' ? 'text-red-700' : ''}>{c.asset.status === 'MISSING' ? 'Missing file' : 'Linked'}</span> : <span className="text-muted">None</span>}</Td>
                <Td>
                  <div className="flex flex-col items-start gap-1">
                    <StatusBadge status={c.status} />
                    {c.approvalState !== 'APPROVED' && <StatusBadge status={c.approvalState} />}
                  </div>
                </Td>
                <Td className="text-xs text-muted">{fmtDateTime(c.updatedAt)}</Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-1">
                    {canApprove && c.approvalState !== 'APPROVED' && (
                      <Button size="sm" variant="ghost" onClick={() => act(() => api(`/api/content/${c.id}/approval`, { body: { state: 'APPROVED' } }), 'Content approved')} aria-label={`Approve ${c.title}`}>
                        <CheckCircle2 className="size-4 text-teal-700" />
                      </Button>
                    )}
                    {canApprove && c.approvalState === 'PENDING' && (
                      <Button size="sm" variant="ghost" onClick={() => act(() => api(`/api/content/${c.id}/approval`, { body: { state: 'REJECTED' } }), 'Content rejected')} aria-label={`Reject ${c.title}`}>
                        <XCircle className="size-4 text-coral-600" />
                      </Button>
                    )}
                    {canManage && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(c)} aria-label={`Edit ${c.title}`}>
                          <Pencil className="size-4" />
                        </Button>
                        {c.status !== 'ARCHIVED' && (
                          <Button size="sm" variant="ghost" onClick={() => confirm(`Archive “${c.title}”? It stays in history but can no longer be scheduled.`) && act(() => api(`/api/content/${c.id}`, { method: 'DELETE' }), 'Archived')} aria-label={`Archive ${c.title}`}>
                            <Archive className="size-4" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      {editing && (
        <ContentForm
          item={editing === 'new' ? null : editing}
          categories={categories}
          channels={channels}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast('Content saved');
            load();
          }}
        />
      )}
    </Card>
  );
}

function ContentForm({ item, categories, channels, onClose, onSaved }: { item: ContentRow | null; categories: ContentCategory[]; channels: Array<{ id: string; name: string }>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    title: item?.title ?? '',
    category: item?.category ?? categories[0],
    houseNumber: item?.houseNumber ?? '',
    description: item?.description ?? '',
    duration: item ? formatDuration(item.plannedDurationMs) : '',
    original: item?.originalDurationMs ? formatDuration(item.originalDurationMs) : '',
    isDurationEditable: item?.isDurationEditable ?? true,
    status: item?.status ?? 'ACTIVE',
    language: item?.language ?? '',
    rating: item?.rating ?? '',
    rightsHolder: item?.rightsHolder ?? '',
    licenseNotes: item?.licenseNotes ?? '',
    maxAiringsPerDay: item?.maxAiringsPerDay ? String(item.maxAiringsPerDay) : '',
    availableFrom: item?.availableFrom?.slice(0, 10) ?? '',
    availableUntil: item?.availableUntil?.slice(0, 10) ?? '',
    windowStart: item?.allowedStartMinute != null ? fmtMinute(item.allowedStartMinute) : '',
    windowEnd: item?.allowedEndMinute != null ? fmtMinute(item.allowedEndMinute) : '',
    channelIds: item?.channelIds ?? [],
    assetId: item?.assetId ?? '',
  });
  const [assets, setAssets] = useState<Array<{ id: string; originalName: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  useEffect(() => {
    api<Paged<{ id: string; originalName: string }>>('/api/media?pageSize=200')
      .then((r) => setAssets(r.items))
      .catch(() => undefined);
  }, []);

  async function save() {
    setError(null);
    const plannedDurationMs = parseDuration(f.duration);
    if (!plannedDurationMs) return setError('Planned duration is required (HH:MM:SS) and must be greater than zero.');
    const originalDurationMs = f.original ? parseDuration(f.original) : null;
    if (f.original && !originalDurationMs) return setError('Original duration must be HH:MM:SS.');
    const ws = f.windowStart ? parseHHMM(f.windowStart) : null;
    const we = f.windowEnd ? (f.windowEnd === '24:00' ? 1440 : parseHHMM(f.windowEnd)) : null;
    if ((f.windowStart && ws == null) || (f.windowEnd && we == null)) return setError('Time window must be HH:MM.');
    setBusy(true);
    try {
      const body = {
        title: f.title,
        category: f.category,
        houseNumber: f.houseNumber,
        description: f.description,
        plannedDurationMs,
        originalDurationMs,
        isDurationEditable: f.isDurationEditable,
        status: f.status,
        language: f.language,
        rating: f.rating,
        rightsHolder: f.rightsHolder,
        licenseNotes: f.licenseNotes,
        maxAiringsPerDay: f.maxAiringsPerDay ? Number(f.maxAiringsPerDay) : null,
        availableFrom: f.availableFrom || null,
        availableUntil: f.availableUntil || null,
        allowedStartMinute: ws,
        allowedEndMinute: we,
        channelIds: f.channelIds,
        assetId: f.assetId,
      };
      await api(item ? `/api/content/${item.id}` : '/api/content', { method: item ? 'PUT' : 'POST', body });
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
      title={item ? `Edit “${item.title}”` : 'New content item'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={save} disabled={!f.title.trim()}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        {error && <Alert tone="error" className="md:col-span-2">{error}</Alert>}
        <Field label="Title" className="md:col-span-2">{(id) => <Input id={id} value={f.title} onChange={set('title')} required />}</Field>
        <Field label="Category">
          {(id) => (
            <Select id={id} value={f.category} onChange={set('category')} disabled={!!item}>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="House number">{(id) => <Input id={id} value={f.houseNumber} onChange={set('houseNumber')} />}</Field>
        <Field label="Planned duration" hint="HH:MM:SS — used for scheduling">{(id, d) => <Input id={id} aria-describedby={d} placeholder="00:30:00" value={f.duration} onChange={set('duration')} />}</Field>
        <Field label="Original media duration" hint="Optional; kept separate from the planned duration">{(id, d) => <Input id={id} aria-describedby={d} placeholder="00:29:40" value={f.original} onChange={set('original')} />}</Field>
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input type="checkbox" checked={f.isDurationEditable} onChange={(e) => setF((x) => ({ ...x, isDurationEditable: e.target.checked }))} /> Schedulers may override the duration
        </label>
        <Field label="Status">
          {(id) => (
            <Select id={id} value={f.status} onChange={set('status')}>
              <option value="ACTIVE">Active</option>
              <option value="DRAFT">Draft</option>
              <option value="ARCHIVED">Archived</option>
            </Select>
          )}
        </Field>
        <Field label="Media asset">
          {(id) => (
            <Select id={id} value={f.assetId} onChange={set('assetId')}>
              <option value="">None</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.originalName}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Language">{(id) => <Input id={id} value={f.language} onChange={set('language')} />}</Field>
        <Field label="Rating / classification">{(id) => <Input id={id} placeholder="G, PG, PG13, 18" value={f.rating} onChange={set('rating')} />}</Field>
        <Field label="Allowed from (local)" hint="HH:MM; windows may cross midnight">{(id, d) => <Input id={id} aria-describedby={d} placeholder="22:00" value={f.windowStart} onChange={set('windowStart')} />}</Field>
        <Field label="Allowed until (local)">{(id) => <Input id={id} placeholder="05:00" value={f.windowEnd} onChange={set('windowEnd')} />}</Field>
        <Field label="Rights available from">{(id) => <Input id={id} type="date" value={f.availableFrom} onChange={set('availableFrom')} />}</Field>
        <Field label="Rights available until">{(id) => <Input id={id} type="date" value={f.availableUntil} onChange={set('availableUntil')} />}</Field>
        <Field label="Rights holder">{(id) => <Input id={id} value={f.rightsHolder} onChange={set('rightsHolder')} />}</Field>
        <Field label="Max airings per day">{(id) => <Input id={id} inputMode="numeric" value={f.maxAiringsPerDay} onChange={set('maxAiringsPerDay')} />}</Field>
        <fieldset className="md:col-span-2">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-navy-700">Channel eligibility (none selected = all channels)</legend>
          <div className="flex flex-wrap gap-3">
            {channels.map((c) => (
              <label key={c.id} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={f.channelIds.includes(c.id)} onChange={(e) => setF((x) => ({ ...x, channelIds: e.target.checked ? [...x.channelIds, c.id] : x.channelIds.filter((y) => y !== c.id) }))} />
                {c.name}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Licence notes" className="md:col-span-2">{(id) => <Textarea id={id} value={f.licenseNotes} onChange={set('licenseNotes')} />}</Field>
        <Field label="Description" className="md:col-span-2">{(id) => <Textarea id={id} value={f.description} onChange={set('description')} />}</Field>
      </div>
    </Dialog>
  );
}
