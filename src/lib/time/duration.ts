/** Duration helpers. Internally every duration is an integer number of milliseconds. */

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;

/** Format as HH:MM:SS (or HH:MM:SS.mmm when sub-second precision is present). */
export function formatDuration(ms: number): string {
  const sign = ms < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(ms));
  const h = Math.floor(abs / HOUR);
  const m = Math.floor((abs % HOUR) / MINUTE);
  const s = Math.floor((abs % MINUTE) / SECOND);
  const rest = abs % SECOND;
  const base = `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return rest ? `${base}.${String(rest).padStart(3, '0')}` : base;
}

/** Short human form, e.g. "1h 05m", "30s", "2m 15s". */
export function humanDuration(ms: number): string {
  const abs = Math.abs(Math.round(ms / SECOND));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  const sign = ms < 0 ? '-' : '';
  if (h) return `${sign}${h}h ${String(m).padStart(2, '0')}m`;
  if (m) return s ? `${sign}${m}m ${String(s).padStart(2, '0')}s` : `${sign}${m}m`;
  return `${sign}${s}s`;
}

/**
 * Parse "HH:MM:SS", "MM:SS", "SS", optionally with ".mmm", into milliseconds.
 * Returns null for malformed input rather than guessing.
 */
export function parseDuration(input: string): number | null {
  const trimmed = input.trim();
  const m = /^(?:(\d+):)?(?:(\d{1,2}):)?(\d{1,2})(?:\.(\d{1,3}))?$/.exec(trimmed);
  if (!m) return null;
  const parts = trimmed.split('.')[0].split(':').map(Number);
  if (parts.some((p) => !Number.isFinite(p))) return null;
  while (parts.length < 3) parts.unshift(0);
  const [h, mm, ss] = parts;
  if (mm > 59 || ss > 59) return null;
  const frac = m[4] ? Number(m[4].padEnd(3, '0')) : 0;
  return h * HOUR + mm * MINUTE + ss * SECOND + frac;
}
