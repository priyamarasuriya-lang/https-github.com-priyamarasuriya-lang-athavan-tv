import { broadcastTimeToInstant } from '@/lib/time/zoned';
import type { BreakFacts, CampaignFacts, ContentFacts, ScheduleItemSpec, ValidationContext } from '@/server/scheduling/types';

export const ZONE = 'Asia/Colombo';
export const DATE = '2026-06-01';
export const CHANNEL = { id: 'ch1', timeZone: ZONE, dayStartMinute: 360, defaultGapMs: 0, underrunToleranceMs: 60_000 };
export const MIN = 60_000;

let seq = 0;

export function content(overrides: Partial<ContentFacts> = {}): ContentFacts {
  seq += 1;
  return {
    id: overrides.id ?? `c${seq}`,
    title: overrides.title ?? `Content ${seq}`,
    category: 'PROGRAM',
    status: 'ACTIVE',
    approvalState: 'APPROVED',
    plannedDurationMs: 30 * MIN,
    isDurationEditable: true,
    hasAsset: true,
    assetMissing: false,
    rating: null,
    availableFrom: null,
    availableUntil: null,
    allowedStartMinute: null,
    allowedEndMinute: null,
    maxAiringsPerDay: null,
    channelIds: [],
    campaign: null,
    ...overrides,
  };
}

export function campaign(overrides: Partial<CampaignFacts> = {}): CampaignFacts {
  return {
    id: 'camp1',
    name: 'Summer Soda',
    status: 'ACTIVE',
    approvalState: 'APPROVED',
    startDate: '2026-05-01',
    endDate: '2026-06-30',
    channelIds: [],
    maxAirings: null,
    dailyLimit: null,
    weeklyLimit: null,
    minSpacingMs: null,
    allowedStartMinute: null,
    allowedEndMinute: null,
    ...overrides,
  };
}

export function item(c: ContentFacts | null, overrides: Partial<ScheduleItemSpec> = {}): ScheduleItemSpec {
  seq += 1;
  return {
    key: overrides.key ?? `i${seq}`,
    kind: 'CONTENT',
    contentItemId: c?.id ?? null,
    commercialBreakId: null,
    label: null,
    timingMode: 'SEQUENTIAL',
    fixedStartAt: null,
    plannedDurationMs: null,
    estimatedDurationMs: null,
    gapAfterMs: null,
    isLive: false,
    children: [],
    ...overrides,
  };
}

export function brk(children: ScheduleItemSpec[], overrides: Partial<ScheduleItemSpec> = {}): ScheduleItemSpec {
  return item(null, { kind: 'BREAK', label: 'Break', children, ...overrides });
}

/** Instant for a broadcast-day local time "HH:MM". */
export function at(hhmm: string, date = DATE): Date {
  const [h, m] = hhmm.split(':').map(Number);
  return broadcastTimeToInstant(date, h * 60 + m, ZONE, CHANNEL.dayStartMinute).instant;
}

export function ctx(
  items: ScheduleItemSpec[],
  contents: ContentFacts[],
  extra: Partial<Omit<ValidationContext, 'items' | 'content'>> & { breakDefs?: BreakFacts[] } = {},
): ValidationContext {
  return {
    channel: extra.channel ?? CHANNEL,
    broadcastDate: extra.broadcastDate ?? DATE,
    items,
    content: new Map(contents.map((c) => [c.id, c])),
    breaks: new Map((extra.breakDefs ?? []).map((b) => [b.id, b])),
    rules: extra.rules ?? [],
    campaignUsage: extra.campaignUsage ?? new Map(),
  };
}

/** Fill a day completely with N items of equal length, so no UNDERRUN noise. */
export function fullDay(count = 48): { contents: ContentFacts[]; items: ScheduleItemSpec[] } {
  const contents = Array.from({ length: count }, () => content({ plannedDurationMs: (24 * 60 * MIN) / count }));
  return { contents, items: contents.map((c) => item(c)) };
}
