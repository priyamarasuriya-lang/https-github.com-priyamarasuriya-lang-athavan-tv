import type { ContentCategory, ScheduleItemView } from '@/lib/dto';

/** Editor-side item. `key` doubles as the preview clientKey (a UUID). */
export interface EditItem {
  key: string;
  kind: 'CONTENT' | 'BREAK';
  contentItemId: string | null;
  commercialBreakId: string | null;
  label: string | null;
  title: string;
  category: ContentCategory | 'BREAK';
  houseNumber: string | null;
  isDurationEditable: boolean;
  defaultDurationMs: number;
  timingMode: 'SEQUENTIAL' | 'FIXED';
  fixedTime: string | null;
  plannedDurationMs: number | null;
  estimatedDurationMs: number | null;
  gapAfterMs: number | null;
  isLive: boolean;
  notes: string | null;
  children: EditItem[];
}

export interface LibraryContent {
  id: string;
  title: string;
  category: ContentCategory;
  plannedDurationMs: number;
  isDurationEditable: boolean;
  houseNumber: string | null;
  status: string;
  approvalState: string;
}

export interface LibraryBreak {
  id: string;
  name: string;
  defaultDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  channelId: string | null;
  isActive: boolean;
}

/** Short spots that go *into* a break when dropped onto one. */
export const SPOT_CATEGORIES: ReadonlyArray<string> = ['ADVERTISEMENT', 'PROMO', 'STATION_ID', 'PSA'];

export const newKey = () => crypto.randomUUID();

export function fromView(v: ScheduleItemView): EditItem {
  return {
    key: v.id,
    kind: v.kind,
    contentItemId: v.contentItemId,
    commercialBreakId: v.commercialBreakId,
    label: v.label,
    title: v.title,
    category: v.category,
    houseNumber: v.houseNumber,
    isDurationEditable: v.isDurationEditable,
    defaultDurationMs: v.defaultDurationMs,
    timingMode: v.timingMode,
    fixedTime: v.fixedTime,
    plannedDurationMs: v.plannedDurationMs,
    estimatedDurationMs: v.estimatedDurationMs,
    gapAfterMs: v.gapAfterMs,
    isLive: v.isLive,
    notes: v.notes,
    children: v.children.map(fromView),
  };
}

export function fromContent(c: LibraryContent): EditItem {
  return {
    key: newKey(),
    kind: 'CONTENT',
    contentItemId: c.id,
    commercialBreakId: null,
    label: null,
    title: c.title,
    category: c.category,
    houseNumber: c.houseNumber,
    isDurationEditable: c.isDurationEditable,
    defaultDurationMs: c.plannedDurationMs,
    timingMode: 'SEQUENTIAL',
    fixedTime: null,
    plannedDurationMs: null,
    estimatedDurationMs: null,
    gapAfterMs: null,
    isLive: c.category === 'LIVE',
    notes: null,
    children: [],
  };
}

export function fromBreak(b: LibraryBreak): EditItem {
  return {
    key: newKey(),
    kind: 'BREAK',
    contentItemId: null,
    commercialBreakId: b.id,
    label: null,
    title: b.name,
    category: 'BREAK',
    houseNumber: null,
    isDurationEditable: true,
    defaultDurationMs: b.defaultDurationMs,
    timingMode: 'SEQUENTIAL',
    fixedTime: null,
    plannedDurationMs: null,
    estimatedDurationMs: null,
    gapAfterMs: null,
    isLive: false,
    notes: null,
    children: [],
  };
}

export function cloneWithNewKeys(e: EditItem): EditItem {
  return { ...e, key: newKey(), children: e.children.map(cloneWithNewKeys) };
}

export function toInput(e: EditItem): Record<string, unknown> {
  return {
    clientKey: e.key,
    kind: e.kind,
    contentItemId: e.contentItemId,
    commercialBreakId: e.commercialBreakId,
    label: e.label,
    timingMode: e.timingMode,
    fixedTime: e.timingMode === 'FIXED' ? e.fixedTime : null,
    plannedDurationMs: e.plannedDurationMs,
    estimatedDurationMs: e.estimatedDurationMs,
    gapAfterMs: e.gapAfterMs,
    isLive: e.isLive,
    notes: e.notes,
    children: e.children.map(toInput),
  };
}

export function move<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}
