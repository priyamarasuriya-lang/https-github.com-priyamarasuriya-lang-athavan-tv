'use client';

import { Pencil, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Dialog, Field, Input, Select, StatusBadge, Table, Td, Textarea, Th } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/client/api';
import { fmtMinute, parseHHMM } from '@/lib/client/format';
import { formatDuration } from '@/lib/time/duration';

interface Channel {
  id: string;
  code: string;
  name: string;
  timeZone: string;
  broadcastDayStartMinute: number;
  defaultGapMs: number;
  underrunToleranceMs: number;
  playoutSystem: string | null;
  isActive: boolean;
}
interface Rule {
  id: string;
  name: string;
  type: string;
  channelId: string | null;
  channel: { name: string } | null;
  params: Record<string, unknown>;
  severity: 'ERROR' | 'WARNING';
  isActive: boolean;
}

const RULE_HELP: Record<string, { label: string; example: string }> = {
  NO_DUPLICATE_CONTENT: { label: 'No duplicate content', example: '{"withinMinutes": 360, "categories": ["MOVIE"]}' },
  RATING_TIME_WINDOW: { label: 'Rating time window', example: '{"ratings": ["18"], "startMinute": 1320, "endMinute": 300}' },
  CATEGORY_TIME_WINDOW: { label: 'Category time window', example: '{"categories": ["PROGRAM"], "startMinute": 360, "endMinute": 1200}' },
  CATEGORY_REQUIRES_APPROVAL: { label: 'Category requires approval', example: '{"categories": ["MOVIE"]}' },
  SCHEDULE_END_DEADLINE: { label: 'Schedule end deadline', example: '{"endMinute": 300}' },
  MAX_GAP: { label: 'Maximum gap', example: '{"maxGapMs": 120000}' },
};

export function ChannelsManager({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [editCh, setEditCh] = useState<Channel | 'new' | null>(null);
  const [editRule, setEditRule] = useState<Rule | 'new' | null>(null);
  const load = useCallback(async () => {
    try {
      const [c, r] = await Promise.all([api<Channel[]>('/api/channels?all=1'), api<Rule[]>('/api/rules')]);
      setChannels(c);
      setRules(r);
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }, [toast]);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-5">
      <Card
        title="Channels"
        accent="#2f3e55"
        actions={
          canManage && (
            <Button variant="primary" onClick={() => setEditCh('new')}>
              <Plus className="size-4" /> New channel
            </Button>
          )
        }
      >
        <Table caption="Channels">
          <thead>
            <tr>
              <Th>Channel</Th>
              <Th>Time zone</Th>
              <Th>Broadcast day starts</Th>
              <Th>Default gap</Th>
              <Th>Playout</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {channels.map((c) => (
              <tr key={c.id}>
                <Td>
                  <span className="font-medium">{c.name}</span> <span className="text-xs text-muted">{c.code}</span>
                </Td>
                <Td>{c.timeZone}</Td>
                <Td className="tabular">{fmtMinute(c.broadcastDayStartMinute)}</Td>
                <Td className="tabular">{formatDuration(c.defaultGapMs)}</Td>
                <Td className="text-xs text-muted">{c.playoutSystem ?? 'Not connected'}</Td>
                <Td>
                  <StatusBadge status={c.isActive ? 'ACTIVE' : 'ARCHIVED'} />
                </Td>
                <Td className="text-right">
                  {canManage && (
                    <Button size="sm" variant="ghost" onClick={() => setEditCh(c)} aria-label={`Edit ${c.name}`}>
                      <Pencil className="size-4" />
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="mt-3 text-xs text-muted">No playout automation is integrated. The playout field is a label for a future integration; on-air status and as-run data are not available.</p>
      </Card>

      <Card
        title="Scheduling rules"
        accent="#f2604b"
        actions={
          canManage && (
            <Button onClick={() => setEditRule('new')}>
              <Plus className="size-4" /> New rule
            </Button>
          )
        }
      >
        <Table caption="Scheduling rules">
          <thead>
            <tr>
              <Th>Rule</Th>
              <Th>Type</Th>
              <Th>Scope</Th>
              <Th>Parameters</Th>
              <Th>Severity</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id}>
                <Td className="font-medium">{r.name}</Td>
                <Td className="text-xs">{RULE_HELP[r.type]?.label ?? r.type}</Td>
                <Td className="text-xs">{r.channel?.name ?? 'All channels'}</Td>
                <Td className="font-mono text-[11px]">{JSON.stringify(r.params)}</Td>
                <Td>
                  <span className={r.severity === 'ERROR' ? 'text-xs font-semibold text-red-700' : 'text-xs text-amber-700'}>{r.severity.toLowerCase()}</span>
                </Td>
                <Td>
                  <StatusBadge status={r.isActive ? 'ACTIVE' : 'ARCHIVED'} />
                </Td>
                <Td className="text-right">
                  {canManage && (
                    <Button size="sm" variant="ghost" onClick={() => setEditRule(r)} aria-label={`Edit ${r.name}`}>
                      <Pencil className="size-4" />
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      {editCh && <ChannelForm item={editCh === 'new' ? null : editCh} onClose={() => setEditCh(null)} onSaved={() => (setEditCh(null), toast('Channel saved'), load())} />}
      {editRule && <RuleForm item={editRule === 'new' ? null : editRule} channels={channels} onClose={() => setEditRule(null)} onSaved={() => (setEditRule(null), toast('Rule saved'), load())} />}
    </div>
  );
}

function ChannelForm({ item, onClose, onSaved }: { item: Channel | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    code: item?.code ?? '',
    name: item?.name ?? '',
    timeZone: item?.timeZone ?? 'Asia/Colombo',
    dayStart: fmtMinute(item?.broadcastDayStartMinute ?? 360),
    gap: String((item?.defaultGapMs ?? 0) / 1000),
    tolerance: String((item?.underrunToleranceMs ?? 60000) / 1000),
    playoutSystem: item?.playoutSystem ?? '',
    isActive: item?.isActive ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function save() {
    const ds = parseHHMM(f.dayStart);
    if (ds == null) return setError('Day start must be HH:MM.');
    try {
      await api(item ? `/api/channels/${item.id}` : '/api/channels', {
        method: item ? 'PUT' : 'POST',
        body: { code: f.code, name: f.name, timeZone: f.timeZone, broadcastDayStartMinute: ds, defaultGapMs: Math.round(Number(f.gap) * 1000), underrunToleranceMs: Math.round(Number(f.tolerance) * 1000), playoutSystem: f.playoutSystem, isActive: f.isActive },
      });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={item ? `Edit ${item.name}` : 'New channel'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {error && <Alert tone="error" className="sm:col-span-2">{error}</Alert>}
        <Field label="Code">{(id) => <Input id={id} value={f.code} onChange={set('code')} placeholder="BAT2" />}</Field>
        <Field label="Name">{(id) => <Input id={id} value={f.name} onChange={set('name')} />}</Field>
        <Field label="IANA time zone" hint="e.g. Asia/Colombo, Europe/London">{(id, d) => <Input id={id} aria-describedby={d} value={f.timeZone} onChange={set('timeZone')} />}</Field>
        <Field label="Broadcast day starts (local)" hint="Items before this time belong to the previous broadcast day">{(id, d) => <Input id={id} aria-describedby={d} value={f.dayStart} onChange={set('dayStart')} />}</Field>
        <Field label="Default gap between items (s)">{(id) => <Input id={id} inputMode="decimal" value={f.gap} onChange={set('gap')} />}</Field>
        <Field label="Underrun tolerance (s)">{(id) => <Input id={id} inputMode="decimal" value={f.tolerance} onChange={set('tolerance')} />}</Field>
        <Field label="Playout system label" className="sm:col-span-2">{(id) => <Input id={id} value={f.playoutSystem} onChange={set('playoutSystem')} />}</Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.isActive} onChange={(e) => setF((x) => ({ ...x, isActive: e.target.checked }))} /> Active
        </label>
      </div>
    </Dialog>
  );
}

function RuleForm({ item, channels, onClose, onSaved }: { item: Rule | null; channels: Channel[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(item?.name ?? '');
  const [type, setType] = useState(item?.type ?? 'MAX_GAP');
  const [channelId, setChannelId] = useState(item?.channelId ?? '');
  const [severity, setSeverity] = useState(item?.severity ?? 'ERROR');
  const [isActive, setActive] = useState(item?.isActive ?? true);
  const [params, setParams] = useState(item ? JSON.stringify(item.params, null, 2) : RULE_HELP.MAX_GAP.example);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(params);
    } catch {
      return setError('Parameters must be valid JSON.');
    }
    try {
      await api(item ? `/api/rules/${item.id}` : '/api/rules', { method: item ? 'PUT' : 'POST', body: { name, type, channelId, severity, isActive, params: parsed } });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={item ? 'Edit rule' : 'New rule'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {error && <Alert tone="error" className="sm:col-span-2">{error}</Alert>}
        <Field label="Name" className="sm:col-span-2">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Type">
          {(id) => (
            <Select id={id} value={type} onChange={(e) => (setType(e.target.value), !item && setParams(RULE_HELP[e.target.value].example))}>
              {Object.entries(RULE_HELP).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Scope">
          {(id) => (
            <Select id={id} value={channelId} onChange={(e) => setChannelId(e.target.value)}>
              <option value="">All channels</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Severity">
          {(id) => (
            <Select id={id} value={severity} onChange={(e) => setSeverity(e.target.value as 'ERROR' | 'WARNING')}>
              <option value="ERROR">Error (blocks approval)</option>
              <option value="WARNING">Warning</option>
            </Select>
          )}
        </Field>
        <label className="flex items-center gap-2 self-end text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setActive(e.target.checked)} /> Active
        </label>
        <Field label="Parameters (JSON)" hint={`Minutes are local minutes of day (e.g. 22:00 = 1320). Example: ${RULE_HELP[type]?.example}`} className="sm:col-span-2">
          {(id, d) => <Textarea id={id} aria-describedby={d} className="font-mono text-xs" value={params} onChange={(e) => setParams(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  );
}
