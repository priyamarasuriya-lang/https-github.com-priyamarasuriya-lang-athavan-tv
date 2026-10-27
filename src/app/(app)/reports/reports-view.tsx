'use client';

import { Download, Play } from 'lucide-react';
import { useState } from 'react';
import { Alert, Button, Card, EmptyState, Field, Input, Select, Spinner, Table, Td, Th, cx } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/client/api';
import { fmtDateTime } from '@/lib/client/format';
import { CATEGORY_LABELS } from '@/lib/dto';
import { formatDuration } from '@/lib/time/duration';

interface Column {
  key: string;
  label: string;
  type: 'text' | 'number' | 'duration' | 'datetime';
}
interface Report {
  title: string;
  period: string;
  channel: string;
  timeZone: string;
  generatedAt: string;
  columns: Column[];
  rows: Array<Record<string, string | number | null>>;
  totals?: Record<string, number>;
  notes?: string[];
}

const today = () => new Date().toISOString().slice(0, 10);

function cell(v: string | number | null | undefined, c: Column, tz: string) {
  if (v == null || v === '') return '';
  if (c.type === 'duration') return formatDuration(Number(v));
  if (c.type === 'datetime') return new Intl.DateTimeFormat('en-GB', { timeZone: tz, dateStyle: 'short', timeStyle: 'medium', hourCycle: 'h23' }).format(new Date(String(v)));
  return String(v);
}

export function ReportsView({ reports, channels, canExport }: { reports: Array<{ key: string; title: string }>; channels: Array<{ id: string; name: string }>; canExport: boolean }) {
  const [key, setKey] = useState(reports[0].key);
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [channelId, setChannelId] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = (format?: string) => {
    const p = new URLSearchParams({ from, to });
    if (channelId) p.set('channelId', channelId);
    if (category) p.set('category', category);
    if (status) p.set('status', status);
    if (format) p.set('format', format);
    return `/api/reports/${key}?${p}`;
  };
  async function run() {
    setBusy(true);
    setError(null);
    try {
      setReport(await api<Report>(query()));
    } catch (e) {
      setError(errorMessage(e));
      setReport(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
      <nav aria-label="Reports" className="rounded-xl bg-white p-2 ring-1 ring-line">
        <ul className="flex flex-col gap-0.5">
          {reports.map((r) => (
            <li key={r.key}>
              <button type="button" aria-current={key === r.key} onClick={() => (setKey(r.key), setReport(null))} className={cx('w-full rounded-md px-3 py-2 text-left text-sm', key === r.key ? 'bg-navy-900 font-semibold text-white' : 'hover:bg-slate-100')}>
                {r.title}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <Card title={reports.find((r) => r.key === key)?.title}>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Field label="From">{(id) => <Input id={id} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
          <Field label="To">{(id) => <Input id={id} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
          <Field label="Channel" className="w-44">
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
          <Field label="Category" className="w-40">
            {(id) => (
              <Select id={id} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">All</option>
                {Object.entries(CATEGORY_LABELS)
                  .filter(([k]) => k !== 'BREAK')
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <Field label="Schedule status" className="w-40">
            {(id) => (
              <Select id={id} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Not archived</option>
                {['DRAFT', 'SUBMITTED', 'APPROVED', 'PUBLISHED', 'ARCHIVED'].map((s) => (
                  <option key={s} value={s}>
                    {s.toLowerCase()}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Button variant="primary" onClick={run} loading={busy}>
            <Play className="size-4" /> Run report
          </Button>
          {canExport && (
            <div className="flex overflow-hidden rounded-md ring-1 ring-line" role="group" aria-label="Export">
              {['pdf', 'xlsx', 'csv'].map((f) => (
                <a key={f} href={query(f)} className="flex items-center gap-1 bg-white px-2.5 py-2 text-xs font-medium uppercase hover:bg-slate-50">
                  <Download className="size-3.5" aria-hidden /> {f}
                </a>
              ))}
            </div>
          )}
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        {busy && <Spinner label="Running report" />}
        {!report && !busy && !error && <EmptyState title="Choose filters and run the report" />}
        {report && !busy && (
          <>
            <p className="mb-2 text-xs text-muted">
              {report.period} · {report.channel} · {report.rows.length} rows · generated {fmtDateTime(report.generatedAt, report.timeZone)} ({report.timeZone})
            </p>
            {report.rows.length === 0 ? (
              <EmptyState title="No records for these filters" />
            ) : (
              <div className="max-h-[60vh] overflow-auto">
                <Table caption={report.title}>
                  <thead className="sticky top-0 bg-white">
                    <tr>
                      {report.columns.map((c) => (
                        <Th key={c.key} className={c.type !== 'text' ? 'text-right' : ''}>
                          {c.label}
                        </Th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.slice(0, 1000).map((r, i) => (
                      <tr key={i}>
                        {report.columns.map((c) => (
                          <Td key={c.key} className={cx('text-xs', c.type !== 'text' && 'tabular text-right')}>
                            {cell(r[c.key], c, report.timeZone)}
                          </Td>
                        ))}
                      </tr>
                    ))}
                    {report.totals && (
                      <tr className="bg-slate-50 font-semibold">
                        {report.columns.map((c, i) => (
                          <Td key={c.key} className={cx('text-xs', c.type !== 'text' && 'tabular text-right')}>
                            {i === 0 ? 'Total' : cell(report.totals![c.key], c, report.timeZone)}
                          </Td>
                        ))}
                      </tr>
                    )}
                  </tbody>
                </Table>
              </div>
            )}
            {report.rows.length > 1000 && <p className="mt-2 text-xs text-muted">Showing the first 1,000 rows. Exports include all rows.</p>}
            {report.notes?.map((n, i) => (
              <p key={i} className="mt-2 text-xs italic text-muted">
                {n}
              </p>
            ))}
          </>
        )}
      </Card>
    </div>
  );
}
