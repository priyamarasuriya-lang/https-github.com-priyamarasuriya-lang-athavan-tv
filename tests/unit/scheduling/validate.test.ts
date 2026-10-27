import { describe, expect, it } from 'vitest';
import { validateSchedule } from '@/server/scheduling/validate';
import type { CampaignUsage, RuleSpec } from '@/server/scheduling/types';
import { at, brk, campaign, CHANNEL, content, ctx, fullDay, item, MIN } from './fixtures';

const codes = (r: ReturnType<typeof validateSchedule>) => r.conflicts.map((c) => c.code);
const fillTo = (minutes: number) => content({ plannedDurationMs: minutes * MIN, title: 'Filler block', category: 'FILLER' });

describe('validateSchedule — sequence', () => {
  it('passes a fully filled day with no conflicts', () => {
    const { contents, items } = fullDay();
    const r = validateSchedule(ctx(items, contents));
    expect(r.conflicts).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.timeline.totalAirtimeMs).toBe(24 * 60 * MIN);
  });

  it('warns on an empty schedule', () => {
    expect(codes(validateSchedule(ctx([], [])))).toEqual(['EMPTY_SCHEDULE']);
  });

  it('detects overlap when a fixed-time item starts before the previous item ends', () => {
    const long = content({ plannedDurationMs: 90 * MIN, title: 'Morning Show' });
    const news = content({ plannedDurationMs: 30 * MIN, title: 'News' });
    const r = validateSchedule(ctx([item(long), item(news, { timingMode: 'FIXED', fixedStartAt: at('07:00') })], [long, news]));
    const overlap = r.conflicts.find((c) => c.code === 'OVERLAP')!;
    expect(overlap.severity).toBe('ERROR');
    expect(overlap.message).toContain('00:30:00');
    expect(overlap.itemKeys).toHaveLength(2);
    expect(overlap.suggestion).toBeTruthy();
    expect(r.ok).toBe(false);
  });

  it('reports conflicting fixed-time events distinctly', () => {
    const a = content({ plannedDurationMs: 60 * MIN });
    const b = content({ plannedDurationMs: 30 * MIN });
    const r = validateSchedule(ctx([item(a, { timingMode: 'FIXED', fixedStartAt: at('08:00') }), item(b, { timingMode: 'FIXED', fixedStartAt: at('08:30') })], [a, b]));
    expect(codes(r)).toContain('FIXED_TIME_CONFLICT');
  });

  it('warns about dead air before a fixed item', () => {
    const a = content({ plannedDurationMs: 30 * MIN });
    const b = content({ plannedDurationMs: 30 * MIN });
    const r = validateSchedule(ctx([item(a), item(b, { timingMode: 'FIXED', fixedStartAt: at('07:00') })], [a, b]));
    const gap = r.conflicts.find((c) => c.code === 'GAP')!;
    expect(gap.severity).toBe('WARNING');
    expect(gap.message).toContain('00:30:00');
  });

  it('flags overrun past the broadcast day end as an error and underrun as a warning', () => {
    const big = content({ plannedDurationMs: 25 * 60 * MIN });
    expect(validateSchedule(ctx([item(big)], [big])).conflicts.find((c) => c.code === 'OVERRUN')?.severity).toBe('ERROR');
    const small = content({ plannedDurationMs: 60 * MIN });
    expect(validateSchedule(ctx([item(small)], [small])).conflicts.find((c) => c.code === 'UNDERRUN')?.severity).toBe('WARNING');
  });

  it('accounts for the 23-hour broadcast day on a DST spring-forward date', () => {
    const channel = { ...CHANNEL, timeZone: 'America/New_York' };
    const day = content({ plannedDurationMs: 24 * 60 * MIN });
    const r = validateSchedule(ctx([item(day)], [day], { channel, broadcastDate: '2026-03-07' }));
    const over = r.conflicts.find((c) => c.code === 'OVERRUN')!;
    expect(over.message).toContain('01:00:00');
  });

  it('rejects invalid durations', () => {
    const c = content();
    const r = validateSchedule(ctx([item(c, { plannedDurationMs: -5 })], [c]));
    expect(codes(r)).toContain('INVALID_DURATION');
  });

  it('rejects resizing content whose duration is fixed', () => {
    const c = content({ isDurationEditable: false, plannedDurationMs: 30 * MIN });
    expect(codes(validateSchedule(ctx([item(c, { plannedDurationMs: 20 * MIN })], [c])))).toContain('DURATION_NOT_EDITABLE');
  });
});

describe('validateSchedule — content', () => {
  const fill = fillTo(24 * 60 - 30);

  it('flags missing content, inactive and unapproved content', () => {
    const inactive = content({ status: 'ARCHIVED' });
    const pending = content({ approvalState: 'PENDING' });
    const r = validateSchedule(ctx([item(null, { contentItemId: 'ghost' }), item(inactive), item(pending), item(fill)], [inactive, pending, fill]));
    expect(codes(r)).toEqual(expect.arrayContaining(['MISSING_CONTENT', 'CONTENT_INACTIVE', 'UNAPPROVED_CONTENT']));
  });

  it('distinguishes missing assets (error) from unlinked assets (warning); live is exempt', () => {
    const missing = content({ assetMissing: true });
    const none = content({ hasAsset: false });
    const live = content({ hasAsset: false, category: 'LIVE' });
    const r = validateSchedule(ctx([item(missing), item(none), item(live), item(fill)], [missing, none, live, fill]));
    expect(r.conflicts.find((c) => c.code === 'MISSING_ASSET')?.severity).toBe('ERROR');
    expect(r.conflicts.filter((c) => c.code === 'NO_ASSET')).toHaveLength(1);
  });

  it('enforces availability windows, channel eligibility and time windows', () => {
    const expired = content({ availableUntil: at('06:10') });
    const otherChannel = content({ channelIds: ['ch2'] });
    const lateOnly = content({ allowedStartMinute: 21 * 60, allowedEndMinute: 5 * 60 });
    const r = validateSchedule(ctx([item(expired), item(otherChannel), item(lateOnly)], [expired, otherChannel, lateOnly]));
    expect(codes(r)).toEqual(expect.arrayContaining(['OUTSIDE_AVAILABILITY', 'CHANNEL_INELIGIBLE', 'OUTSIDE_TIME_WINDOW']));
  });

  it('accepts a late-night item inside a window that wraps midnight', () => {
    const lead = content({ plannedDurationMs: 17 * 60 * MIN });
    const lateOnly = content({ plannedDurationMs: 2 * 60 * MIN, allowedStartMinute: 22 * 60, allowedEndMinute: 5 * 60 });
    const r = validateSchedule(ctx([item(lead), item(lateOnly)], [lead, lateOnly]));
    expect(codes(r)).not.toContain('OUTSIDE_TIME_WINDOW');
  });

  it('enforces maximum airings per day', () => {
    const c = content({ plannedDurationMs: MIN, maxAiringsPerDay: 2 });
    expect(codes(validateSchedule(ctx([item(c), item(c), item(c)], [c])))).toContain('CONTENT_DAILY_LIMIT');
  });
});

describe('validateSchedule — breaks and advertising', () => {
  const camp = campaign();
  const ad = (o = {}) => content({ category: 'ADVERTISEMENT', plannedDurationMs: 30_000, campaign: camp, ...o });

  it('detects over-filled and under-filled breaks and duration range violations', () => {
    const a1 = ad();
    const a2 = ad();
    const def = { id: 'b1', name: 'Std break', defaultDurationMs: 60_000, minDurationMs: 60_000, maxDurationMs: 120_000 };
    const over = validateSchedule(ctx([brk([item(a1), item(a2), item(a1)], { commercialBreakId: 'b1' })], [a1, a2], { breakDefs: [def] }));
    expect(codes(over)).toContain('BREAK_OVERFILL');
    const under = validateSchedule(ctx([brk([item(a1)], { commercialBreakId: 'b1' })], [a1], { breakDefs: [def] }));
    expect(codes(under)).toContain('BREAK_UNDERFILL');
    const range = validateSchedule(ctx([brk([item(a1)], { commercialBreakId: 'b1', plannedDurationMs: 30_000 })], [a1], { breakDefs: [def] }));
    expect(codes(range)).toContain('BREAK_DURATION_RANGE');
  });

  it('warns about ads outside breaks and rejects nested breaks', () => {
    const a1 = ad();
    const r = validateSchedule(ctx([item(a1), brk([brk([])])], [a1]));
    expect(codes(r)).toEqual(expect.arrayContaining(['AD_OUTSIDE_BREAK', 'BREAK_IN_BREAK']));
  });

  it('rejects spots outside campaign dates, channel, hours, or for inactive campaigns', () => {
    const c = campaign({ startDate: '2026-06-02', channelIds: ['ch9'], status: 'PAUSED', allowedStartMinute: 18 * 60, allowedEndMinute: 22 * 60 });
    const a = content({ category: 'ADVERTISEMENT', plannedDurationMs: 30_000, campaign: c });
    const r = validateSchedule(ctx([brk([item(a)])], [a]));
    expect(codes(r)).toEqual(expect.arrayContaining(['CAMPAIGN_DATES', 'CAMPAIGN_CHANNEL', 'CAMPAIGN_INACTIVE', 'CAMPAIGN_TIME_WINDOW']));
  });

  it('enforces daily, weekly and total quotas including other schedules’ usage', () => {
    const c = campaign({ dailyLimit: 3, weeklyLimit: 5, maxAirings: 10 });
    const a = content({ category: 'ADVERTISEMENT', plannedDurationMs: 30_000, campaign: c });
    const usage: CampaignUsage = { totalPlanned: 9, perDay: { '2026-06-01': 2 }, perWeek: { '2026-W23': 4 }, nearbyStarts: [] };
    const r = validateSchedule(ctx([brk([item(a), item(a)])], [a], { campaignUsage: new Map([[c.id, usage]]) }));
    expect(codes(r)).toEqual(expect.arrayContaining(['CAMPAIGN_DAILY_LIMIT', 'CAMPAIGN_WEEKLY_LIMIT', 'CAMPAIGN_TOTAL_LIMIT']));

    const ok = validateSchedule(ctx([brk([item(a)])], [a], { campaignUsage: new Map([[c.id, { totalPlanned: 0, perDay: {}, perWeek: {}, nearbyStarts: [] }]]) }));
    expect(codes(ok).filter((x) => x.startsWith('CAMPAIGN'))).toEqual([]);
  });

  it('enforces minimum spacing between spots of the same campaign', () => {
    const c = campaign({ minSpacingMs: 15 * MIN });
    const a = content({ category: 'ADVERTISEMENT', plannedDurationMs: 30_000, campaign: c });
    const p = content({ plannedDurationMs: 10 * MIN });
    const tooClose = validateSchedule(ctx([brk([item(a)]), item(p), brk([item(a)])], [a, p]));
    expect(codes(tooClose)).toContain('CAMPAIGN_SPACING');
    const p2 = content({ plannedDurationMs: 20 * MIN });
    const spaced = validateSchedule(ctx([brk([item(a)]), item(p2), brk([item(a)])], [a, p2]));
    expect(codes(spaced)).not.toContain('CAMPAIGN_SPACING');
  });
});

describe('validateSchedule — configurable rules', () => {
  const rule = <T extends RuleSpec['type']>(type: T, params: Extract<RuleSpec, { type: T }>['params'], severity: 'ERROR' | 'WARNING' = 'ERROR') =>
    ({ id: `r-${type}`, name: type, severity, type, params }) as RuleSpec;

  it('NO_DUPLICATE_CONTENT within a time span', () => {
    const c = content({ plannedDurationMs: 30 * MIN });
    const other = content({ plannedDurationMs: 60 * MIN });
    const close = validateSchedule(ctx([item(c), item(c)], [c], { rules: [rule('NO_DUPLICATE_CONTENT', { withinMinutes: 120 })] }));
    expect(codes(close)).toContain('RULE_DUPLICATE_CONTENT');
    const far = validateSchedule(ctx([item(c), item(other), item(other), item(c)], [c, other], { rules: [rule('NO_DUPLICATE_CONTENT', { withinMinutes: 120, categories: ['MOVIE'] })] }));
    expect(codes(far)).not.toContain('RULE_DUPLICATE_CONTENT');
  });

  it('RATING_TIME_WINDOW keeps adult-rated movies late', () => {
    const movie = content({ category: 'MOVIE', rating: '18', plannedDurationMs: 120 * MIN });
    const r = validateSchedule(ctx([item(movie)], [movie], { rules: [rule('RATING_TIME_WINDOW', { ratings: ['18'], startMinute: 22 * 60, endMinute: 5 * 60 })] }));
    expect(codes(r)).toContain('RULE_RATING_WINDOW');
  });

  it('CATEGORY_TIME_WINDOW with warning severity does not block', () => {
    const kids = content({ category: 'PROGRAM', plannedDurationMs: 24 * 60 * MIN });
    const r = validateSchedule(ctx([item(kids)], [kids], { rules: [rule('CATEGORY_TIME_WINDOW', { categories: ['PROGRAM'], startMinute: 7 * 60, endMinute: 20 * 60 }, 'WARNING')] }));
    expect(r.conflicts.find((c) => c.code === 'RULE_CATEGORY_WINDOW')?.severity).toBe('WARNING');
    expect(r.ok).toBe(true);
  });

  it('SCHEDULE_END_DEADLINE across midnight', () => {
    const c = content({ plannedDurationMs: 21 * 60 * MIN }); // ends 03:00 next calendar day
    const r = validateSchedule(ctx([item(c)], [c], { rules: [rule('SCHEDULE_END_DEADLINE', { endMinute: 2 * 60 })] }));
    expect(codes(r)).toContain('RULE_END_DEADLINE');
    const ok = validateSchedule(ctx([item(c)], [c], { rules: [rule('SCHEDULE_END_DEADLINE', { endMinute: 4 * 60 })] }));
    expect(codes(ok)).not.toContain('RULE_END_DEADLINE');
  });

  it('MAX_GAP escalates long gaps', () => {
    const a = content({ plannedDurationMs: 30 * MIN });
    const b = content({ plannedDurationMs: 30 * MIN });
    const r = validateSchedule(ctx([item(a), item(b, { timingMode: 'FIXED', fixedStartAt: at('07:00') })], [a, b], { rules: [rule('MAX_GAP', { maxGapMs: 5 * MIN })] }));
    expect(codes(r)).toContain('RULE_MAX_GAP');
  });

  it('sorts errors before warnings', () => {
    const big = content({ plannedDurationMs: 25 * 60 * MIN, hasAsset: false });
    const r = validateSchedule(ctx([item(big)], [big]));
    expect(r.conflicts[0].severity).toBe('ERROR');
    expect(r.conflicts.at(-1)!.severity).toBe('WARNING');
  });
});
