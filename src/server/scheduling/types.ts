/**
 * Domain types for the scheduling engine. These are deliberately independent of Prisma so the
 * engine is pure, deterministic and unit-testable. String unions mirror the Prisma enums.
 */

export type ContentCategory =
  | 'PROGRAM'
  | 'MOVIE'
  | 'NEWS'
  | 'LIVE'
  | 'SPECIAL_EVENT'
  | 'ADVERTISEMENT'
  | 'PROMO'
  | 'FILLER'
  | 'SLIDE'
  | 'STATION_ID'
  | 'PSA';

export type ItemKind = 'CONTENT' | 'BREAK';
export type TimingMode = 'SEQUENTIAL' | 'FIXED';
export type Severity = 'ERROR' | 'WARNING';

/** Input to the timing calculation. Durations already resolved (see resolveDuration). */
export interface TimingInput {
  key: string;
  kind: ItemKind;
  timingMode: TimingMode;
  fixedStartAt: Date | null;
  durationMs: number;
  gapAfterMs: number | null;
  children: TimingInput[];
}

export interface TimedItem {
  key: string;
  startAt: Date;
  endAt: Date;
  durationMs: number;
  /** Idle time between the previous item's end (+ configured gap) and this item's start. Negative = overlap. */
  leadGapMs: number;
  children: TimedItem[];
}

export interface TimelineResult {
  items: TimedItem[];
  startAt: Date;
  endAt: Date;
  /** Sum of top-level item durations (breaks count at their full length). */
  totalAirtimeMs: number;
}

export interface ContentFacts {
  id: string;
  title: string;
  category: ContentCategory;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  approvalState: 'PENDING' | 'APPROVED' | 'REJECTED';
  plannedDurationMs: number;
  isDurationEditable: boolean;
  hasAsset: boolean;
  assetMissing: boolean;
  rating: string | null;
  availableFrom: Date | null;
  availableUntil: Date | null;
  allowedStartMinute: number | null;
  allowedEndMinute: number | null;
  maxAiringsPerDay: number | null;
  /** Empty = eligible on every channel. */
  channelIds: string[];
  /** Set when the content is an advertisement creative. */
  campaign: CampaignFacts | null;
}

export interface CampaignFacts {
  id: string;
  name: string;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  approvalState: 'PENDING' | 'APPROVED' | 'REJECTED';
  startDate: string; // YYYY-MM-DD, channel-local calendar dates
  endDate: string;
  channelIds: string[];
  maxAirings: number | null;
  dailyLimit: number | null;
  weeklyLimit: number | null;
  minSpacingMs: number | null;
  allowedStartMinute: number | null;
  allowedEndMinute: number | null;
}

/** Airings of a campaign already committed by *other* published schedules. */
export interface CampaignUsage {
  totalPlanned: number;
  /** keyed by local ISO date */
  perDay: Record<string, number>;
  /** keyed by ISO week "YYYY-Www" */
  perWeek: Record<string, number>;
  /** Planned start instants on the same channel, for spacing checks across schedule boundaries. */
  nearbyStarts: Date[];
}

export interface BreakFacts {
  id: string;
  name: string;
  minDurationMs: number;
  maxDurationMs: number;
  defaultDurationMs: number;
}

/** A schedule item as stored/edited, before timing. */
export interface ScheduleItemSpec {
  key: string;
  kind: ItemKind;
  contentItemId: string | null;
  commercialBreakId: string | null;
  label: string | null;
  timingMode: TimingMode;
  fixedStartAt: Date | null;
  plannedDurationMs: number | null;
  estimatedDurationMs: number | null;
  gapAfterMs: number | null;
  isLive: boolean;
  children: ScheduleItemSpec[];
}

export type RuleSpec =
  | { id: string; name: string; severity: Severity; type: 'NO_DUPLICATE_CONTENT'; params: { withinMinutes?: number; categories?: ContentCategory[] } }
  | { id: string; name: string; severity: Severity; type: 'RATING_TIME_WINDOW'; params: { ratings: string[]; startMinute: number; endMinute: number } }
  | { id: string; name: string; severity: Severity; type: 'CATEGORY_TIME_WINDOW'; params: { categories: ContentCategory[]; startMinute: number; endMinute: number } }
  | { id: string; name: string; severity: Severity; type: 'CATEGORY_REQUIRES_APPROVAL'; params: { categories: ContentCategory[] } }
  | { id: string; name: string; severity: Severity; type: 'SCHEDULE_END_DEADLINE'; params: { endMinute: number } }
  | { id: string; name: string; severity: Severity; type: 'MAX_GAP'; params: { maxGapMs: number } };

export interface ValidationContext {
  channel: { id: string; timeZone: string; dayStartMinute: number; defaultGapMs: number; underrunToleranceMs: number };
  broadcastDate: string;
  items: ScheduleItemSpec[];
  content: Map<string, ContentFacts>;
  breaks: Map<string, BreakFacts>;
  rules: RuleSpec[];
  campaignUsage: Map<string, CampaignUsage>;
}

export type ConflictCode =
  | 'INVALID_DURATION'
  | 'DURATION_NOT_EDITABLE'
  | 'MISSING_CONTENT'
  | 'OVERLAP'
  | 'FIXED_TIME_CONFLICT'
  | 'GAP'
  | 'OVERRUN'
  | 'UNDERRUN'
  | 'MISSING_ASSET'
  | 'NO_ASSET'
  | 'CONTENT_INACTIVE'
  | 'UNAPPROVED_CONTENT'
  | 'OUTSIDE_AVAILABILITY'
  | 'CHANNEL_INELIGIBLE'
  | 'OUTSIDE_TIME_WINDOW'
  | 'CONTENT_DAILY_LIMIT'
  | 'AD_OUTSIDE_BREAK'
  | 'BREAK_IN_BREAK'
  | 'CAMPAIGN_INACTIVE'
  | 'CAMPAIGN_DATES'
  | 'CAMPAIGN_CHANNEL'
  | 'CAMPAIGN_TIME_WINDOW'
  | 'CAMPAIGN_DAILY_LIMIT'
  | 'CAMPAIGN_WEEKLY_LIMIT'
  | 'CAMPAIGN_TOTAL_LIMIT'
  | 'CAMPAIGN_SPACING'
  | 'BREAK_OVERFILL'
  | 'BREAK_UNDERFILL'
  | 'BREAK_DURATION_RANGE'
  | 'EMPTY_SCHEDULE'
  | 'RULE_DUPLICATE_CONTENT'
  | 'RULE_RATING_WINDOW'
  | 'RULE_CATEGORY_WINDOW'
  | 'RULE_REQUIRES_APPROVAL'
  | 'RULE_END_DEADLINE'
  | 'RULE_MAX_GAP';

export interface Conflict {
  code: ConflictCode;
  severity: Severity;
  message: string;
  itemKeys: string[];
  startAt: string | null;
  endAt: string | null;
  suggestion: string;
  ruleId?: string;
}

export interface ValidationResult {
  timeline: TimelineResult;
  conflicts: Conflict[];
  errorCount: number;
  warningCount: number;
  /** True when there are no blocking errors. */
  ok: boolean;
}
