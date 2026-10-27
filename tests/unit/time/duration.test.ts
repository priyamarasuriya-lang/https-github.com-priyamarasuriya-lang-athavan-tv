import { describe, expect, it } from 'vitest';
import { formatDuration, humanDuration, parseDuration } from '@/lib/time/duration';

describe('durations', () => {
  it('formats milliseconds as HH:MM:SS', () => {
    expect(formatDuration(0)).toBe('00:00:00');
    expect(formatDuration(30_000)).toBe('00:00:30');
    expect(formatDuration(3_725_000)).toBe('01:02:05');
    expect(formatDuration(1_500)).toBe('00:00:01.500');
    expect(formatDuration(-60_000)).toBe('-00:01:00');
  });

  it('parses common duration strings', () => {
    expect(parseDuration('01:02:05')).toBe(3_725_000);
    expect(parseDuration('2:30')).toBe(150_000);
    expect(parseDuration('45')).toBe(45_000);
    expect(parseDuration('00:00:10.5')).toBe(10_500);
    expect(parseDuration('1:75')).toBeNull();
    expect(parseDuration('abc')).toBeNull();
  });

  it('round-trips', () => {
    for (const ms of [1000, 59_000, 61_000, 3_600_000, 86_399_000]) expect(parseDuration(formatDuration(ms))).toBe(ms);
  });

  it('produces short human forms', () => {
    expect(humanDuration(30_000)).toBe('30s');
    expect(humanDuration(135_000)).toBe('2m 15s');
    expect(humanDuration(3_900_000)).toBe('1h 05m');
  });
});
