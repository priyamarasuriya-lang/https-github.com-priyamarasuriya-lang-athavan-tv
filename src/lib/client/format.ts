/** Display helpers for the browser; always format in the channel's zone, never the viewer's. */

export function fmtTime(iso: string, timeZone: string, seconds = true): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}), hourCycle: 'h23' }).format(new Date(iso));
}

export function fmtDateTime(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}

export function fmtDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function fmtMinute(min: number | null | undefined): string {
  if (min == null) return '';
  const m = min % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function parseHHMM(v: string): number | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(v.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
