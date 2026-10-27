'use client';

import { CalendarDays, ChevronLeft, ChevronRight, List, Plus, Repeat } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Dialog, EmptyState, Field, Input, Pagination, Select, Spinner, StatusBadge, Table, Td, Th, cx } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, errorMessage } from '@/lib/client/api';
import { fmtDate, fmtDateTime } from '@/lib/client/format';
import type { Paged, ScheduleStatus, ScheduleView } from '@/lib/dto';

interface Row {
  id: string;
  title: string | null;
  channel: { id: string; name: string; code: string };
  broadcastDate: string;
  status: ScheduleStatus;
  versionNo: number;
  updatedAt: string;
  errorCount: number | null;
  warningCount: number | null;
}
interface Channel {
  id: string;
  name: string;
  code: string;
}
interface Template {
  id: string;
  name: string;
  channel: string;
  itemCount: number;
}

const isoToday = () => new Date().toISOString().slice(0, 10);
const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
const shiftMonth = (iso: string, n: number) => {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
};
const monthEnd = (iso: string) => {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

export function SchedulesBrowser({ channels, canEdit }: { channels: Channel[]; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [month, setMonth] = useState(monthStart(isoToday()));
  const [channelId, setChannelId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<Row> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState<string | null>(null);
  const [recurOpen, setRecurOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const q = new URLSearchParams({ page: String(view === 'calendar' ? 1 : page), pageSize: view === 'calendar' ? '200' : '25' });
    if (channelId) q.set('channelId', channelId);
    if (status) q.set('status', status);
    if (view === 'calendar') {
      q.set('from', month);
      q.set('to', monthEnd(month));
    }
    try {
      setData(await api<Paged<Row>>(`/api/schedules?${q}`));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [view, page, channelId, status, month]);
  useEffect(() => {
    load();
  }, [load]);

  const byDate = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of data?.items ?? []) m.set(r.broadcastDate, [...(m.get(r.broadcastDate) ?? []), r]);
    return m;
  }, [data]);

  const days = useMemo(() => {
    const first = new Date(`${month}T00:00:00Z`);
    const lead = (first.getUTCDay() + 6) % 7;
    const total = Number(monthEnd(month).slice(8));
    const cells: Array<string | null> = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= total; d++) cells.push(`${month.slice(0, 8)}${String(d).padStart(2, '0')}`);
    while (cells.length % 7) cells.push(null);
    return cells;
  }, [month]);

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex rounded-md ring-1 ring-line" role="group" aria-label="View">
          <Button size="sm" variant={view === 'calendar' ? 'primary' : 'ghost'} onClick={() => setView('calendar')} aria-pressed={view === 'calendar'}>
            <CalendarDays className="size-4" /> Month
          </Button>
          <Button size="sm" variant={view === 'list' ? 'primary' : 'ghost'} onClick={() => setView('list')} aria-pressed={view === 'list'}>
            <List className="size-4" /> List
          </Button>
        </div>
        <Field label="Channel" className="w-48">
          {(id) => (
            <Select id={id} value={channelId} onChange={(e) => (setChannelId(e.target.value), setPage(1))}>
              <option value="">All channels</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Status" className="w-40">
          {(id) => (
            <Select id={id} value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))}>
              <option value="">Active (not archived)</option>
              {['DRAFT', 'SUBMITTED', 'APPROVED', 'PUBLISHED', 'ARCHIVED'].map((s) => (
                <option key={s} value={s}>
                  {s.toLowerCase()}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="ml-auto flex gap-2">
          {canEdit && (
            <>
              <Button variant="secondary" onClick={() => setRecurOpen(true)}>
                <Repeat className="size-4" /> Apply template
              </Button>
              <Button variant="primary" onClick={() => setCreateOpen(isoToday())}>
                <Plus className="size-4" /> New schedule
              </Button>
            </>
          )}
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {!data && !error && <Spinner />}

      {data && view === 'calendar' && (
        <>
          <div className="mb-2 flex items-center justify-between">
            <Button size="sm" variant="ghost" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">
              <ChevronLeft className="size-4" />
            </Button>
            <h2 className="text-base font-semibold" aria-live="polite">
              {new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}T00:00:00Z`))}
            </h2>
            <Button size="sm" variant="ghost" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-line ring-1 ring-line">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="bg-slate-50 px-2 py-1 text-center text-[11px] font-semibold uppercase text-muted">
                {d}
              </div>
            ))}
            {days.map((d, i) => (
              <div key={i} className={cx('min-h-24 bg-white p-1.5', !d && 'bg-slate-50', d === isoToday() && 'ring-2 ring-inset ring-teal-500')}>
                {d && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-navy-800">{Number(d.slice(8))}</span>
                      {canEdit && (
                        <button type="button" className="rounded px-1 text-xs text-muted hover:bg-slate-100 hover:text-navy-900" onClick={() => setCreateOpen(d)} aria-label={`Create schedule for ${d}`}>
                          +
                        </button>
                      )}
                    </div>
                    <ul className="mt-1 flex flex-col gap-1">
                      {(byDate.get(d) ?? []).map((r) => (
                        <li key={r.id}>
                          <Link href={`/schedules/${r.id}`} className="flex items-center justify-between gap-1 rounded bg-slate-50 px-1.5 py-0.5 text-[11px] ring-1 ring-line hover:bg-slate-100">
                            <span className="font-semibold">{r.channel.code}</span>
                            <StatusBadge status={r.status} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {data && view === 'list' && (
        <>
          {data.items.length === 0 ? (
            <EmptyState title="No schedules match these filters." />
          ) : (
            <Table caption="Schedules">
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Channel</Th>
                  <Th>Status</Th>
                  <Th>Rev</Th>
                  <Th>Validation</Th>
                  <Th>Updated</Th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <Td>
                      <Link className="font-medium text-navy-900 hover:underline" href={`/schedules/${r.id}`}>
                        {fmtDate(r.broadcastDate)}
                      </Link>
                      {r.title && <div className="text-xs text-muted">{r.title}</div>}
                    </Td>
                    <Td>{r.channel.name}</Td>
                    <Td>
                      <StatusBadge status={r.status} />
                    </Td>
                    <Td className="tabular">{r.versionNo}</Td>
                    <Td className="text-xs">
                      {r.errorCount == null ? '—' : r.errorCount > 0 ? <span className="font-semibold text-red-700">{r.errorCount} errors</span> : <span className="text-teal-700">No errors</span>}
                      {r.warningCount ? <span className="ml-2 text-amber-700">{r.warningCount} warnings</span> : null}
                    </Td>
                    <Td className="text-xs text-muted">{fmtDateTime(r.updatedAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}

      {createOpen && (
        <CreateDialog
          channels={channels}
          initialDate={createOpen}
          defaultChannelId={channelId || channels[0]?.id}
          onClose={() => setCreateOpen(null)}
          onCreated={(id) => {
            toast('Schedule created');
            router.push(`/schedules/${id}`);
          }}
        />
      )}
      {recurOpen && (
        <RecurringDialog
          channels={channels}
          onClose={() => setRecurOpen(false)}
          onDone={(msg) => {
            toast(msg);
            setRecurOpen(false);
            load();
          }}
        />
      )}
    </Card>
  );
}

function CreateDialog({ channels, initialDate, defaultChannelId, onClose, onCreated }: { channels: Channel[]; initialDate: string; defaultChannelId?: string; onClose: () => void; onCreated: (id: string) => void }) {
  const [channelId, setChannelId] = useState(defaultChannelId ?? '');
  const [date, setDate] = useState(initialDate);
  const [mode, setMode] = useState<'empty' | 'copy' | 'template'>('empty');
  const [copyDate, setCopyDate] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Template[]>('/api/templates').then(setTemplates).catch(() => undefined);
  }, []);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      let copyFromScheduleId: string | undefined;
      if (mode === 'copy') {
        const found = await api<Paged<Row>>(`/api/schedules?channelId=${channelId}&from=${copyDate}&to=${copyDate}`);
        copyFromScheduleId = found.items[0]?.id;
        if (!copyFromScheduleId) throw new Error(`No schedule exists on ${copyDate} for this channel.`);
      }
      const view = await api<ScheduleView>('/api/schedules', { body: { channelId, broadcastDate: date, copyFromScheduleId, templateId: mode === 'template' ? templateId : undefined } });
      onCreated(view.id);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'CONFLICT' && (e.details as { scheduleId?: string })?.scheduleId) {
        setError(`${e.message} Open it from the calendar.`);
      } else setError(e instanceof ApiError ? errorMessage(e) : (e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="New schedule"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={submit} disabled={!channelId || !date || (mode === 'copy' && !copyDate) || (mode === 'template' && !templateId)}>
            Create
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Channel">
          {(id) => (
            <Select id={id} value={channelId} onChange={(e) => setChannelId(e.target.value)}>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Broadcast date" hint="The operational broadcast day, which starts at the channel’s configured day-start time.">
          {(id, d) => <Input id={id} aria-describedby={d} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-xs font-semibold uppercase tracking-wide text-navy-700">Start from</legend>
          {(['empty', 'copy', 'template'] as const).map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm">
              <input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} />
              {m === 'empty' ? 'Empty schedule' : m === 'copy' ? 'Copy a previous date' : 'A saved template'}
            </label>
          ))}
        </fieldset>
        {mode === 'copy' && <Field label="Copy from date">{(id) => <Input id={id} type="date" value={copyDate} onChange={(e) => setCopyDate(e.target.value)} />}</Field>}
        {mode === 'template' && (
          <Field label="Template">
            {(id) => (
              <Select id={id} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                <option value="">Select…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.itemCount} items · {t.channel})
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
      </div>
    </Dialog>
  );
}

function RecurringDialog({ channels, onClose, onDone }: { channels: Channel[]; onClose: () => void; onDone: (msg: string) => void }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [channelId, setChannelId] = useState(channels[0]?.id ?? '');
  const [from, setFrom] = useState(isoToday());
  const [to, setTo] = useState(isoToday());
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Template[]>('/api/templates').then(setTemplates).catch(() => undefined);
  }, []);
  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ created: string[]; skipped: Array<{ date: string; reason: string }> }>('/api/templates/apply', { body: { templateId, channelId, from, to, weekdays } });
      onDone(`Created ${r.created.length} schedules${r.skipped.length ? `, skipped ${r.skipped.length} (already scheduled)` : ''}.`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title="Apply template to a date range"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={!templateId || weekdays.length === 0} onClick={submit}>
            Create schedules
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert tone="error">{error}</Alert>}
        {templates.length === 0 && <Alert tone="info">No templates yet. Open a schedule and choose “Save as template”.</Alert>}
        <Field label="Template">
          {(id) => (
            <Select id={id} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">Select…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Channel">
          {(id) => (
            <Select id={id} value={channelId} onChange={(e) => setChannelId(e.target.value)}>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">{(id) => <Input id={id} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
          <Field label="To">{(id) => <Input id={id} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
        </div>
        <fieldset>
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-navy-700">Weekdays</legend>
          <div className="flex flex-wrap gap-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => (
              <label key={d} className="flex items-center gap-1 text-sm">
                <input type="checkbox" checked={weekdays.includes(i + 1)} onChange={(e) => setWeekdays((w) => (e.target.checked ? [...w, i + 1] : w.filter((x) => x !== i + 1)))} />
                {d}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </Dialog>
  );
}
