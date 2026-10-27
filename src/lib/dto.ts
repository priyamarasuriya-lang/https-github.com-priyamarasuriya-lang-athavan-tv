/** Data transfer types shared by API responses and client components (no server imports). */

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

export type ScheduleStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';
export type WorkflowAction = 'submit' | 'withdraw' | 'approve' | 'reject' | 'publish' | 'reopen' | 'archive';

export interface ConflictDto {
  code: string;
  severity: 'ERROR' | 'WARNING';
  message: string;
  itemKeys: string[];
  startAt: string | null;
  endAt: string | null;
  suggestion: string;
  ruleId?: string;
}

export interface ScheduleItemView {
  id: string;
  kind: 'CONTENT' | 'BREAK';
  contentItemId: string | null;
  commercialBreakId: string | null;
  label: string | null;
  title: string;
  category: ContentCategory | 'BREAK';
  houseNumber: string | null;
  rating: string | null;
  timingMode: 'SEQUENTIAL' | 'FIXED';
  fixedTime: string | null;
  plannedDurationMs: number | null;
  estimatedDurationMs: number | null;
  gapAfterMs: number | null;
  isLive: boolean;
  notes: string | null;
  isDurationEditable: boolean;
  defaultDurationMs: number;
  startAt: string;
  endAt: string;
  durationMs: number;
  children: ScheduleItemView[];
}

export interface ScheduleView {
  id: string;
  title: string | null;
  status: ScheduleStatus;
  lockVersion: number;
  versionNo: number;
  broadcastDate: string;
  channel: { id: string; code: string; name: string; timeZone: string; dayStartMinute: number; defaultGapMs: number };
  window: { start: string; end: string; lengthMs: number };
  endAt: string;
  totalAirtimeMs: number;
  items: ScheduleItemView[];
  conflicts: ConflictDto[];
  errorCount: number;
  warningCount: number;
  editable: boolean;
  actions: WorkflowAction[];
  canExport: boolean;
  pendingRequest: { id: string; submittedBy: string; submittedById: string; submittedAt: string; note: string | null } | null;
  history: Array<{ at: string; action: string; by: string | null; summary: string | null }>;
  versions: Array<{ versionNo: number; createdAt: string; createdBy: string; note: string | null; frozen: boolean }>;
  publishedAt: string | null;
  publishedBy: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  updatedAt: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const CATEGORY_LABELS: Record<ContentCategory | 'BREAK', string> = {
  PROGRAM: 'Program',
  MOVIE: 'Movie',
  NEWS: 'News',
  LIVE: 'Live',
  SPECIAL_EVENT: 'Special event',
  ADVERTISEMENT: 'Advertisement',
  PROMO: 'Promo',
  FILLER: 'Filler',
  SLIDE: 'Slide',
  STATION_ID: 'Station ID',
  PSA: 'PSA',
  BREAK: 'Commercial break',
};
