import { describe, expect, it } from 'vitest';
import { computeTimeline, resolveDuration, toTimingInputs } from '@/server/scheduling/timeline';
import type { TimingInput } from '@/server/scheduling/types';
import { at, brk, content, item, MIN } from './fixtures';

const base = (key: string, durationMs: number, extra: Partial<TimingInput> = {}): TimingInput => ({
  key,
  kind: 'CONTENT',
  timingMode: 'SEQUENTIAL',
  fixedStartAt: null,
  durationMs,
  gapAfterMs: null,
  children: [],
  ...extra,
});

describe('computeTimeline', () => {
  const dayStart = at('06:00');

  it('chains sequential items: end = start + duration, next start = previous end', () => {
    const r = computeTimeline([base('a', 30 * MIN), base('b', 60 * MIN), base('c', 15 * MIN)], dayStart, 0);
    expect(r.items.map((i) => i.startAt.toISOString())).toEqual([at('06:00'), at('06:30'), at('07:30')].map((d) => d.toISOString()));
    expect(r.items[2].endAt.toISOString()).toBe(at('07:45').toISOString());
    expect(r.totalAirtimeMs).toBe(105 * MIN);
    expect(r.endAt.toISOString()).toBe(at('07:45').toISOString());
  });

  it('applies default and per-item gaps', () => {
    const r = computeTimeline([base('a', 10 * MIN, { gapAfterMs: 2 * MIN }), base('b', 10 * MIN), base('c', 10 * MIN)], dayStart, 1000);
    expect(r.items[1].startAt.getTime()).toBe(at('06:12').getTime());
    expect(r.items[2].startAt.getTime()).toBe(at('06:22').getTime() + 1000);
  });

  it('honours fixed-time items and reports the lead gap/overlap', () => {
    const r = computeTimeline(
      [base('a', 30 * MIN), base('news', 30 * MIN, { timingMode: 'FIXED', fixedStartAt: at('07:00') }), base('c', 10 * MIN)],
      dayStart,
      0,
    );
    expect(r.items[1].startAt.getTime()).toBe(at('07:00').getTime());
    expect(r.items[1].leadGapMs).toBe(30 * MIN);
    expect(r.items[2].startAt.getTime()).toBe(at('07:30').getTime());

    const o = computeTimeline([base('a', 90 * MIN), base('news', 30 * MIN, { timingMode: 'FIXED', fixedStartAt: at('07:00') }), base('c', 10 * MIN)], dayStart, 0);
    expect(o.items[1].leadGapMs).toBe(-30 * MIN);
    // the item after an early fixed item continues from the later of the two ends
    expect(o.items[2].startAt.getTime()).toBe(at('07:30').getTime());
  });

  it('times break children back-to-back from the break start', () => {
    const r = computeTimeline(
      [base('p', 30 * MIN), base('brk', 3 * MIN, { kind: 'BREAK', children: [base('ad1', 30_000), base('ad2', 60_000)] }), base('q', 30 * MIN)],
      dayStart,
      0,
    );
    const b = r.items[1];
    expect(b.children[0].startAt.getTime()).toBe(at('06:30').getTime());
    expect(b.children[1].startAt.getTime()).toBe(at('06:30').getTime() + 30_000);
    expect(r.items[2].startAt.getTime()).toBe(at('06:33').getTime());
  });

  it('crosses midnight within one broadcast day', () => {
    const r = computeTimeline([base('a', 18 * 60 * MIN), base('late movie', 120 * MIN)], dayStart, 0);
    expect(r.items[1].startAt.getTime()).toBe(at('00:00').getTime());
    expect(r.items[1].endAt.getTime()).toBe(at('02:00').getTime());
  });

  it('recalculates after reordering, insertion and removal', () => {
    const a = base('a', 10 * MIN);
    const b = base('b', 20 * MIN);
    const c = base('c', 30 * MIN);
    const original = computeTimeline([a, b, c], dayStart, 0);
    const reordered = computeTimeline([c, a, b], dayStart, 0);
    expect(original.items.find((i) => i.key === 'c')!.startAt.getTime()).toBe(at('06:30').getTime());
    expect(reordered.items.find((i) => i.key === 'c')!.startAt.getTime()).toBe(at('06:00').getTime());
    expect(reordered.items.find((i) => i.key === 'b')!.startAt.getTime()).toBe(at('06:40').getTime());
    const removed = computeTimeline([a, c], dayStart, 0);
    expect(removed.items[1].startAt.getTime()).toBe(at('06:10').getTime());
    const inserted = computeTimeline([a, base('x', 5 * MIN), b], dayStart, 0);
    expect(inserted.items[2].startAt.getTime()).toBe(at('06:15').getTime());
  });

  it('is deterministic and handles an empty schedule', () => {
    const r = computeTimeline([], dayStart, 0);
    expect(r.items).toEqual([]);
    expect(r.totalAirtimeMs).toBe(0);
    expect(r.endAt.getTime()).toBe(dayStart.getTime());
  });
});

describe('resolveDuration', () => {
  it('uses override, then content default; live estimate wins for live items', () => {
    const c = content({ plannedDurationMs: 30 * MIN });
    const map = new Map([[c.id, c]]);
    expect(resolveDuration(item(c), map, new Map())).toBe(30 * MIN);
    expect(resolveDuration(item(c, { plannedDurationMs: 25 * MIN }), map, new Map())).toBe(25 * MIN);
    expect(resolveDuration(item(c, { isLive: true, plannedDurationMs: 25 * MIN, estimatedDurationMs: 40 * MIN }), map, new Map())).toBe(40 * MIN);
  });

  it('resolves break length from override, definition, then children', () => {
    const ad = content({ category: 'ADVERTISEMENT', plannedDurationMs: 30_000 });
    const map = new Map([[ad.id, ad]]);
    const defs = new Map([['b1', { id: 'b1', name: 'Std', defaultDurationMs: 180_000, minDurationMs: 60_000, maxDurationMs: 240_000 }]]);
    expect(resolveDuration(brk([item(ad), item(ad)]), map, new Map())).toBe(60_000);
    expect(resolveDuration(brk([item(ad)], { commercialBreakId: 'b1' }), map, defs)).toBe(180_000);
    expect(resolveDuration(brk([item(ad)], { commercialBreakId: 'b1', plannedDurationMs: 120_000 }), map, defs)).toBe(120_000);
    expect(toTimingInputs([brk([item(ad)])], map, new Map())[0].children).toHaveLength(1);
  });
});
