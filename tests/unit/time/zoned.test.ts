import { describe, expect, it } from 'vitest';
import {
  addDaysIso,
  broadcastDayWindow,
  broadcastTimeToInstant,
  isWithinDailyWindow,
  LocalTimeResolutionError,
  parseIsoDate,
  resolveLocalTime,
  toLocal,
} from '@/lib/time/zoned';

describe('resolveLocalTime', () => {
  it('converts a normal local time to UTC (Asia/Colombo, +05:30, no DST)', () => {
    const r = resolveLocalTime('2026-03-10', 6 * 60, 'Asia/Colombo');
    expect(r.kind).toBe('normal');
    expect(r.instant.toISOString()).toBe('2026-03-10T00:30:00.000Z');
  });

  it('shifts a nonexistent spring-forward time forward by the gap (America/New_York)', () => {
    // 2026-03-08 02:00 EST → 03:00 EDT; 02:30 does not exist.
    const r = resolveLocalTime('2026-03-08', 2 * 60 + 30, 'America/New_York');
    expect(r.kind).toBe('nonexistent');
    expect(toLocal(r.instant, 'America/New_York').minuteOfDay).toBe(3 * 60 + 30);
    expect(r.instant.toISOString()).toBe('2026-03-08T07:30:00.000Z');
  });

  it('rejects a nonexistent time when asked to', () => {
    expect(() => resolveLocalTime('2026-03-08', 150, 'America/New_York', { gap: 'reject' })).toThrow(LocalTimeResolutionError);
  });

  it('resolves an ambiguous fall-back time to the earlier or later instant', () => {
    // 2026-11-01 02:00 EDT → 01:00 EST; 01:30 occurs twice.
    const earlier = resolveLocalTime('2026-11-01', 90, 'America/New_York');
    const later = resolveLocalTime('2026-11-01', 90, 'America/New_York', { ambiguous: 'later' });
    expect(earlier.kind).toBe('ambiguous');
    expect(earlier.instant.toISOString()).toBe('2026-11-01T05:30:00.000Z');
    expect(later.instant.toISOString()).toBe('2026-11-01T06:30:00.000Z');
    expect(() => resolveLocalTime('2026-11-01', 90, 'America/New_York', { ambiguous: 'reject' })).toThrow(LocalTimeResolutionError);
  });

  it('handles Europe/London transitions', () => {
    // 2026-03-29 01:00 GMT → 02:00 BST
    expect(resolveLocalTime('2026-03-29', 90, 'Europe/London').kind).toBe('nonexistent');
    // 2026-10-25 02:00 BST → 01:00 GMT
    expect(resolveLocalTime('2026-10-25', 90, 'Europe/London').kind).toBe('ambiguous');
  });

  it('validates inputs', () => {
    expect(() => resolveLocalTime('2026-02-30', 0, 'UTC')).toThrow(RangeError);
    expect(() => resolveLocalTime('2026-01-01', 1440, 'UTC')).toThrow(RangeError);
    expect(() => resolveLocalTime('2026-01-01', 0, 'Mars/Olympus')).toThrow(RangeError);
  });
});

describe('broadcastDayWindow', () => {
  it('spans 24h on a normal day and crosses midnight', () => {
    const w = broadcastDayWindow('2026-06-01', 'Asia/Colombo', 360);
    expect(w.start.toISOString()).toBe('2026-06-01T00:30:00.000Z');
    expect(w.end.toISOString()).toBe('2026-06-02T00:30:00.000Z');
    expect(w.lengthMs).toBe(24 * 3600_000);
  });

  it('is 23h on spring-forward and 25h on fall-back days', () => {
    expect(broadcastDayWindow('2026-03-07', 'America/New_York', 360).lengthMs).toBe(23 * 3600_000);
    expect(broadcastDayWindow('2026-10-31', 'America/New_York', 360).lengthMs).toBe(25 * 3600_000);
  });

  it('handles a day boundary that itself falls in a DST gap', () => {
    // Day starting at 02:30 on the spring-forward date starts at 03:30 EDT.
    const w = broadcastDayWindow('2026-03-08', 'America/New_York', 150);
    expect(w.startKind).toBe('nonexistent');
    expect(toLocal(w.start, 'America/New_York').minuteOfDay).toBe(210);
  });
});

describe('broadcastTimeToInstant', () => {
  it('maps after-midnight times to the next calendar date', () => {
    const r = broadcastTimeToInstant('2026-06-01', 90, 'Asia/Colombo', 360); // 01:30 → 2 June
    expect(toLocal(r.instant, 'Asia/Colombo').isoDate).toBe('2026-06-02');
    const r2 = broadcastTimeToInstant('2026-06-01', 20 * 60, 'Asia/Colombo', 360);
    expect(toLocal(r2.instant, 'Asia/Colombo').isoDate).toBe('2026-06-01');
  });
});

describe('isWithinDailyWindow', () => {
  const z = 'Asia/Colombo';
  const at = (date: string, minute: number) => resolveLocalTime(date, minute, z).instant;

  it('accepts items inside a simple window and rejects those that spill out', () => {
    expect(isWithinDailyWindow(at('2026-06-01', 20 * 60), at('2026-06-01', 21 * 60), z, 19 * 60, 23 * 60)).toBe(true);
    expect(isWithinDailyWindow(at('2026-06-01', 22 * 60 + 30), at('2026-06-01', 23 * 60 + 30), z, 19 * 60, 23 * 60)).toBe(false);
    expect(isWithinDailyWindow(at('2026-06-01', 18 * 60), at('2026-06-01', 19 * 60 + 30), z, 19 * 60, 23 * 60)).toBe(false);
  });

  it('supports windows that wrap midnight', () => {
    // 22:00–05:00
    expect(isWithinDailyWindow(at('2026-06-01', 23 * 60), at('2026-06-02', 60), z, 22 * 60, 5 * 60)).toBe(true);
    expect(isWithinDailyWindow(at('2026-06-02', 2 * 60), at('2026-06-02', 3 * 60), z, 22 * 60, 5 * 60)).toBe(true);
    expect(isWithinDailyWindow(at('2026-06-02', 4 * 60 + 30), at('2026-06-02', 5 * 60 + 30), z, 22 * 60, 5 * 60)).toBe(false);
    expect(isWithinDailyWindow(at('2026-06-01', 12 * 60), at('2026-06-01', 13 * 60), z, 22 * 60, 5 * 60)).toBe(false);
  });

  it('treats endMinute 1440 as midnight', () => {
    expect(isWithinDailyWindow(at('2026-06-01', 23 * 60), at('2026-06-02', 0), z, 20 * 60, 1440)).toBe(true);
  });
});

describe('date helpers', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysIso('2028-02-28', 1)).toBe('2028-02-29');
    expect(parseIsoDate('2026-10-27')).toEqual({ year: 2026, month: 10, day: 27 });
  });
});
