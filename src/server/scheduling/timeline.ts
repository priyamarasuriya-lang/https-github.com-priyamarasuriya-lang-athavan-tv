import type { BreakFacts, ContentFacts, ScheduleItemSpec, TimedItem, TimelineResult, TimingInput } from './types';

/**
 * Authoritative timing calculation.
 *
 *   end_time            = start_time + effective_duration
 *   next_item_start     = previous_item_end + gap   (SEQUENTIAL items)
 *   fixed item start    = fixedStartAt              (FIXED items; may create a gap or an overlap)
 *
 * Children of a BREAK (advertisements, promos) run back-to-back from the break start with no gaps;
 * the break itself keeps its own duration so a mis-filled break is reported rather than silently resized.
 * The function never throws on bad data: overlaps and gaps are reported through `leadGapMs` and left
 * for the validator to classify.
 */
export function computeTimeline(items: TimingInput[], dayStart: Date, defaultGapMs: number): TimelineResult {
  let cursor = dayStart.getTime();
  let total = 0;
  const timed: TimedItem[] = [];

  items.forEach((item, index) => {
    const expectedStart = cursor;
    const start = item.timingMode === 'FIXED' && item.fixedStartAt ? item.fixedStartAt.getTime() : expectedStart;
    const duration = Math.max(0, item.durationMs);
    const end = start + duration;

    let childCursor = start;
    const children: TimedItem[] = item.children.map((child) => {
      const d = Math.max(0, child.durationMs);
      const t: TimedItem = {
        key: child.key,
        startAt: new Date(childCursor),
        endAt: new Date(childCursor + d),
        durationMs: d,
        leadGapMs: 0,
        children: [],
      };
      childCursor += d;
      return t;
    });

    timed.push({
      key: item.key,
      startAt: new Date(start),
      endAt: new Date(end),
      durationMs: duration,
      leadGapMs: index === 0 && item.timingMode !== 'FIXED' ? 0 : start - expectedStart,
      children,
    });
    total += duration;
    // A fixed item that starts early does not pull later items back before the previous end.
    const gap = item.gapAfterMs ?? defaultGapMs;
    cursor = Math.max(end, cursor) + Math.max(0, gap);
  });

  const last = timed[timed.length - 1];
  return {
    items: timed,
    startAt: timed[0]?.startAt ?? dayStart,
    endAt: last ? new Date(Math.max(...timed.map((t) => t.endAt.getTime()))) : dayStart,
    totalAirtimeMs: total,
  };
}

/**
 * Effective planned duration for an item:
 *  - live content: estimate → explicit override → content default
 *  - other content: explicit override (only honoured where editable; validator flags misuse) → content default
 *  - breaks: explicit override → break definition default → sum of children
 * Original media duration is kept on the content record and never overwritten by these values.
 */
export function resolveDuration(
  spec: ScheduleItemSpec,
  content: Map<string, ContentFacts>,
  breaks: Map<string, BreakFacts>,
): number {
  if (spec.kind === 'BREAK') {
    if (spec.plannedDurationMs != null) return spec.plannedDurationMs;
    const def = spec.commercialBreakId ? breaks.get(spec.commercialBreakId) : undefined;
    if (def) return def.defaultDurationMs;
    return spec.children.reduce((sum, c) => sum + resolveDuration(c, content, breaks), 0);
  }
  const facts = spec.contentItemId ? content.get(spec.contentItemId) : undefined;
  if (spec.isLive && spec.estimatedDurationMs != null) return spec.estimatedDurationMs;
  if (spec.plannedDurationMs != null) return spec.plannedDurationMs;
  return facts?.plannedDurationMs ?? 0;
}

export function toTimingInputs(
  specs: ScheduleItemSpec[],
  content: Map<string, ContentFacts>,
  breaks: Map<string, BreakFacts>,
): TimingInput[] {
  return specs.map((s) => ({
    key: s.key,
    kind: s.kind,
    timingMode: s.timingMode,
    fixedStartAt: s.fixedStartAt,
    durationMs: resolveDuration(s, content, breaks),
    gapAfterMs: s.gapAfterMs,
    children: s.kind === 'BREAK' ? toTimingInputs(s.children, content, breaks) : [],
  }));
}
