import { DateTime, IANAZone } from 'luxon';

/**
 * Time-zone helpers for broadcast scheduling.
 *
 * All instants are JS Dates (UTC). Wall-clock times are interpreted in a channel's IANA zone.
 * Daylight-saving transitions are resolved explicitly instead of relying on library defaults:
 *  - nonexistent local times (spring-forward gap) are shifted forward by the gap length
 *    (02:30 on a 02:00→03:00 transition becomes 03:30), or rejected;
 *  - ambiguous local times (fall-back overlap) resolve to the earlier or later instant.
 */

export const MINUTES_PER_DAY = 1440;
export const MS_PER_MINUTE = 60_000;

export type AmbiguityPolicy = 'earlier' | 'later' | 'reject';
export type GapPolicy = 'shiftForward' | 'reject';

export interface ResolvedLocalTime {
  instant: Date;
  kind: 'normal' | 'ambiguous' | 'nonexistent';
}

export class LocalTimeResolutionError extends Error {
  constructor(
    message: string,
    public readonly kind: 'ambiguous' | 'nonexistent',
  ) {
    super(message);
    this.name = 'LocalTimeResolutionError';
  }
}

export function isValidTimeZone(zone: string): boolean {
  return IANAZone.isValidZone(zone);
}

/** Offset of `zone` from UTC, in minutes, at a given instant. */
export function offsetMinutesAt(epochMs: number, zone: string): number {
  return DateTime.fromMillis(epochMs, { zone }).offset;
}

/** Parse "YYYY-MM-DD" into calendar parts, validating it is a real date. */
export function parseIsoDate(iso: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new RangeError(`Invalid ISO date: ${iso}`);
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    throw new RangeError(`Invalid calendar date: ${iso}`);
  }
  return { year, month, day };
}

/** Add whole calendar days to an ISO date string. */
export function addDaysIso(iso: string, days: number): string {
  const { year, month, day } = parseIsoDate(iso);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Convert a Postgres DATE (delivered by Prisma as UTC midnight) to "YYYY-MM-DD". */
export function dateToIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isoToDbDate(iso: string): Date {
  const { year, month, day } = parseIsoDate(iso);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Resolve a wall-clock time (calendar date + minute of day) in `zone` to a UTC instant,
 * handling DST gaps and overlaps per the given policies.
 */
export function resolveLocalTime(
  isoDate: string,
  minuteOfDay: number,
  zone: string,
  opts: { ambiguous?: AmbiguityPolicy; gap?: GapPolicy } = {},
): ResolvedLocalTime {
  if (!Number.isInteger(minuteOfDay) || minuteOfDay < 0 || minuteOfDay >= MINUTES_PER_DAY) {
    throw new RangeError(`minuteOfDay out of range: ${minuteOfDay}`);
  }
  if (!isValidTimeZone(zone)) throw new RangeError(`Unknown time zone: ${zone}`);
  const ambiguous = opts.ambiguous ?? 'earlier';
  const gap = opts.gap ?? 'shiftForward';

  const { year, month, day } = parseIsoDate(isoDate);
  // The wall time expressed as if it were UTC; subtracting the zone offset yields a candidate instant.
  const wallAsUtc = Date.UTC(year, month - 1, day, Math.floor(minuteOfDay / 60), minuteOfDay % 60);

  // Every offset in effect within ±1 day of the wall time — covers any single DST transition.
  const offsets = new Set<number>([
    offsetMinutesAt(wallAsUtc - 86_400_000, zone),
    offsetMinutesAt(wallAsUtc, zone),
    offsetMinutesAt(wallAsUtc + 86_400_000, zone),
  ]);

  const candidates: number[] = [];
  for (const off of offsets) {
    const instant = wallAsUtc - off * MS_PER_MINUTE;
    if (offsetMinutesAt(instant, zone) === off) candidates.push(instant);
  }
  candidates.sort((a, b) => a - b);

  if (candidates.length === 1) return { instant: new Date(candidates[0]), kind: 'normal' };

  if (candidates.length >= 2) {
    if (ambiguous === 'reject') {
      throw new LocalTimeResolutionError(`${isoDate} ${fmtMinute(minuteOfDay)} is ambiguous in ${zone}`, 'ambiguous');
    }
    const pick = ambiguous === 'earlier' ? candidates[0] : candidates[candidates.length - 1];
    return { instant: new Date(pick), kind: 'ambiguous' };
  }

  // No valid candidate: the wall time falls inside a spring-forward gap.
  if (gap === 'reject') {
    throw new LocalTimeResolutionError(`${isoDate} ${fmtMinute(minuteOfDay)} does not exist in ${zone}`, 'nonexistent');
  }
  // Interpret with the offset in effect *before* the transition; the result lands after the gap,
  // i.e. the wall time is pushed forward by the gap length.
  const before = offsetMinutesAt(wallAsUtc - 86_400_000, zone);
  return { instant: new Date(wallAsUtc - before * MS_PER_MINUTE), kind: 'nonexistent' };
}

export interface BroadcastDayWindow {
  start: Date;
  end: Date;
  /** Length of the operational day; 23h or 25h across DST transitions. */
  lengthMs: number;
  startKind: ResolvedLocalTime['kind'];
}

/**
 * The operational broadcast day for `broadcastDate`: from dayStartMinute local on that date
 * until dayStartMinute local on the following date. A day starting at 06:00 therefore includes
 * the early-morning hours of the next calendar date (overnight schedules).
 */
export function broadcastDayWindow(broadcastDate: string, zone: string, dayStartMinute: number): BroadcastDayWindow {
  const s = resolveLocalTime(broadcastDate, dayStartMinute, zone);
  const e = resolveLocalTime(addDaysIso(broadcastDate, 1), dayStartMinute, zone);
  return { start: s.instant, end: e.instant, lengthMs: e.instant.getTime() - s.instant.getTime(), startKind: s.kind };
}

/**
 * Convert a broadcast-day-relative wall time to an instant. Minutes earlier than the day start
 * belong to the *next* calendar date (e.g. 01:30 on a 06:00-start day is the following night).
 */
export function broadcastTimeToInstant(
  broadcastDate: string,
  minuteOfDay: number,
  zone: string,
  dayStartMinute: number,
  opts?: { ambiguous?: AmbiguityPolicy; gap?: GapPolicy },
): ResolvedLocalTime {
  const calendarDate = minuteOfDay < dayStartMinute ? addDaysIso(broadcastDate, 1) : broadcastDate;
  return resolveLocalTime(calendarDate, minuteOfDay, zone, opts);
}

/** Local wall-clock view of an instant in a zone. */
export function toLocal(instant: Date, zone: string): { isoDate: string; minuteOfDay: number; isoWeek: string; dt: DateTime } {
  const dt = DateTime.fromJSDate(instant, { zone });
  return {
    isoDate: dt.toISODate() as string,
    minuteOfDay: dt.hour * 60 + dt.minute,
    isoWeek: `${dt.weekYear}-W${String(dt.weekNumber).padStart(2, '0')}`,
    dt,
  };
}

/**
 * Whether [start, end) fits entirely inside a daily local-time window [startMinute, endMinute).
 * Windows with startMinute > endMinute wrap midnight (e.g. 22:00–05:00). endMinute 1440 = midnight.
 */
export function isWithinDailyWindow(start: Date, end: Date, zone: string, startMinute: number, endMinute: number): boolean {
  if (startMinute === endMinute) return true; // degenerate window = unrestricted
  const local = toLocal(start, zone);
  const wraps = startMinute > endMinute;
  // Choose the window occurrence that could contain `start`.
  let windowDate = local.isoDate;
  if (wraps && local.minuteOfDay < endMinute) windowDate = addDaysIso(local.isoDate, -1);
  const wStart = resolveLocalTime(windowDate, startMinute, zone).instant;
  const endDate = wraps || endMinute === MINUTES_PER_DAY ? addDaysIso(windowDate, 1) : windowDate;
  const wEnd = resolveLocalTime(endDate, endMinute === MINUTES_PER_DAY ? 0 : endMinute, zone).instant;
  return start.getTime() >= wStart.getTime() && end.getTime() <= wEnd.getTime();
}

export function fmtMinute(minuteOfDay: number): string {
  const h = Math.floor(minuteOfDay / 60);
  const m = minuteOfDay % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Format an instant as local HH:mm:ss in a zone (deterministic, independent of host TZ). */
export function fmtLocalTime(instant: Date, zone: string, withSeconds = true): string {
  return DateTime.fromJSDate(instant, { zone }).toFormat(withSeconds ? 'HH:mm:ss' : 'HH:mm');
}

export function fmtLocalDateTime(instant: Date, zone: string): string {
  return DateTime.fromJSDate(instant, { zone }).toFormat('yyyy-MM-dd HH:mm:ss');
}
