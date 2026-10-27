import { formatDuration } from '@/lib/time/duration';
import { fmtLocalDateTime } from '@/lib/time/zoned';
import type { Cell, Report, ReportColumn } from './types';

/** Render one cell to its display string; datetimes are ISO strings rendered in the report's zone. */
export function formatCell(value: Cell, col: ReportColumn, zone: string): string {
  if (value == null || value === '') return '';
  switch (col.type) {
    case 'duration':
      return formatDuration(Number(value));
    case 'datetime':
      return fmtLocalDateTime(new Date(String(value)), zone);
    case 'number':
      return String(value);
    default:
      return String(value);
  }
}

/** RFC 4180 CSV; cells starting with = + - @ are prefixed to prevent formula injection in spreadsheets. */
export function csvEscape(s: string): string {
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function* csvLines(report: Report): Generator<string> {
  yield [`${report.station} — ${report.title}`].map(csvEscape).join(',');
  yield [`Period: ${report.period}`, `Channel: ${report.channel}`, `Generated: ${fmtLocalDateTime(report.generatedAt, report.timeZone)} (${report.timeZone})`].map(csvEscape).join(',');
  yield '';
  yield report.columns.map((c) => csvEscape(c.label)).join(',');
  for (const row of report.rows) yield report.columns.map((c) => csvEscape(formatCell(row[c.key], c, report.timeZone))).join(',');
  if (report.totals) {
    yield report.columns.map((c, i) => (i === 0 ? 'Total' : report.totals![c.key] != null ? csvEscape(formatCell(report.totals![c.key], c, report.timeZone)) : '')).join(',');
  }
  for (const n of report.notes ?? []) yield csvEscape(`Note: ${n}`);
}

export function toCsv(report: Report): string {
  // BOM so Excel opens UTF-8 correctly.
  return '﻿' + [...csvLines(report)].join('\r\n') + '\r\n';
}

export function sumColumn(rows: Array<Record<string, Cell>>, key: string): number {
  return rows.reduce((s, r) => s + (typeof r[key] === 'number' ? (r[key] as number) : 0), 0);
}
