import { formatDuration } from '@/lib/time/duration';
import {
  broadcastDayWindow,
  broadcastTimeToInstant,
  fmtLocalTime,
  fmtMinute,
  isWithinDailyWindow,
  toLocal,
} from '@/lib/time/zoned';
import { computeTimeline, toTimingInputs } from './timeline';
import type {
  CampaignFacts,
  Conflict,
  ConflictCode,
  ContentFacts,
  RuleSpec,
  ScheduleItemSpec,
  Severity,
  TimedItem,
  ValidationContext,
  ValidationResult,
} from './types';

/**
 * Validate a schedule: compute its timeline, then evaluate every built-in check and configured rule.
 * Pure and deterministic — all facts (content, campaigns, usage by other schedules, rules) are passed in.
 * ERROR conflicts block submission/approval/publication; WARNING conflicts are advisory.
 */
export function validateSchedule(ctx: ValidationContext): ValidationResult {
  const { channel } = ctx;
  const zone = channel.timeZone;
  const window = broadcastDayWindow(ctx.broadcastDate, zone, channel.dayStartMinute);
  const timeline = computeTimeline(toTimingInputs(ctx.items, ctx.content, ctx.breaks), window.start, channel.defaultGapMs);
  const conflicts: Conflict[] = [];

  const add = (
    code: ConflictCode,
    severity: Severity,
    message: string,
    items: Array<{ key: string; startAt?: Date; endAt?: Date }>,
    suggestion: string,
    ruleId?: string,
  ) => {
    const starts = items.map((i) => i.startAt?.getTime()).filter((v): v is number => v != null);
    const ends = items.map((i) => i.endAt?.getTime()).filter((v): v is number => v != null);
    conflicts.push({
      code,
      severity,
      message,
      itemKeys: items.map((i) => i.key),
      startAt: starts.length ? new Date(Math.min(...starts)).toISOString() : null,
      endAt: ends.length ? new Date(Math.max(...ends)).toISOString() : null,
      suggestion,
      ...(ruleId ? { ruleId } : {}),
    });
  };
  const t = (d: Date) => fmtLocalTime(d, zone);

  // Flatten specs/timed items so per-item checks see break children too.
  const timedByKey = new Map<string, TimedItem>();
  const walk = (items: TimedItem[]) => items.forEach((i) => (timedByKey.set(i.key, i), walk(i.children)));
  walk(timeline.items);
  const flat: Array<{ spec: ScheduleItemSpec; parent: ScheduleItemSpec | null }> = [];
  for (const s of ctx.items) {
    flat.push({ spec: s, parent: null });
    for (const c of s.children) flat.push({ spec: c, parent: s });
  }
  const label = (s: ScheduleItemSpec) =>
    s.kind === 'BREAK'
      ? (s.label ?? (s.commercialBreakId ? ctx.breaks.get(s.commercialBreakId)?.name : undefined) ?? 'Commercial break')
      : (s.contentItemId ? ctx.content.get(s.contentItemId)?.title : undefined) ?? s.label ?? 'Untitled item';

  if (ctx.items.length === 0) {
    add('EMPTY_SCHEDULE', 'WARNING', 'The schedule has no items.', [], 'Add content from the library.');
  }

  // ── Sequence checks: overlaps, gaps, overrun/underrun ──
  let prevEnd = window.start.getTime();
  let prevSpec: ScheduleItemSpec | null = null;
  ctx.items.forEach((spec, i) => {
    const ti = timeline.items[i];
    const start = ti.startAt.getTime();
    const configuredGap = i === 0 ? 0 : (prevSpec?.gapAfterMs ?? channel.defaultGapMs);
    if (i > 0 && start < prevEnd) {
      const bothFixed = spec.timingMode === 'FIXED' && prevSpec?.timingMode === 'FIXED';
      const prev = timeline.items[i - 1];
      add(
        bothFixed ? 'FIXED_TIME_CONFLICT' : 'OVERLAP',
        'ERROR',
        `"${label(spec)}" (${t(ti.startAt)}) overlaps "${label(prevSpec!)}" by ${formatDuration(prevEnd - start)}.`,
        [prev, ti],
        bothFixed
          ? 'Move one of the fixed-time events or shorten the earlier one.'
          : 'Shorten or remove earlier items, or move the fixed-time item later.',
      );
    } else {
      const idle = start - (prevEnd + configuredGap);
      if (idle > 0) {
        add(
          'GAP',
          'WARNING',
          `${formatDuration(idle)} of unscheduled airtime before "${label(spec)}" at ${t(ti.startAt)}.`,
          [ti],
          'Insert a filler, promo or slide to cover the gap.',
        );
        for (const r of ctx.rules) {
          if (r.type === 'MAX_GAP' && idle > r.params.maxGapMs) {
            add('RULE_MAX_GAP', r.severity, `Gap of ${formatDuration(idle)} exceeds rule "${r.name}" (max ${formatDuration(r.params.maxGapMs)}).`, [ti], 'Fill the gap.', r.id);
          }
        }
      }
    }
    prevEnd = Math.max(prevEnd, ti.endAt.getTime());
    prevSpec = spec;
  });

  if (ctx.items.length > 0) {
    const end = timeline.endAt.getTime();
    if (end > window.end.getTime()) {
      const over = timeline.items.filter((x) => x.endAt.getTime() > window.end.getTime());
      add(
        'OVERRUN',
        'ERROR',
        `Schedule runs ${formatDuration(end - window.end.getTime())} past the end of the broadcast day (${t(window.end)}).`,
        over,
        'Remove or shorten items at the end of the day.',
      );
    } else if (window.end.getTime() - end > channel.underrunToleranceMs) {
      add(
        'UNDERRUN',
        'WARNING',
        `Schedule ends at ${t(timeline.endAt)}, leaving ${formatDuration(window.end.getTime() - end)} unfilled before the day ends.`,
        [],
        'Add content or fillers to reach the end of the broadcast day.',
      );
    }
  }

  // ── Per-item checks ──
  const contentAirings = new Map<string, TimedItem[]>();
  const campaignAirings = new Map<string, { campaign: CampaignFacts; items: TimedItem[] }>();

  for (const { spec, parent } of flat) {
    const ti = timedByKey.get(spec.key)!;
    const name = label(spec);

    if (spec.kind === 'BREAK') {
      if (parent) add('BREAK_IN_BREAK', 'ERROR', `Break "${name}" is nested inside another break.`, [ti], 'Move it to the top level.');
      checkDuration(spec, ti, name);
      const def = spec.commercialBreakId ? ctx.breaks.get(spec.commercialBreakId) : undefined;
      if (def && (ti.durationMs < def.minDurationMs || ti.durationMs > def.maxDurationMs)) {
        add(
          'BREAK_DURATION_RANGE',
          'ERROR',
          `Break "${name}" is ${formatDuration(ti.durationMs)}; allowed ${formatDuration(def.minDurationMs)}–${formatDuration(def.maxDurationMs)}.`,
          [ti],
          'Adjust the break length to its configured range.',
        );
      }
      const filled = ti.children.reduce((s, c) => s + c.durationMs, 0);
      if (filled > ti.durationMs) {
        add('BREAK_OVERFILL', 'ERROR', `Break "${name}" is over-filled by ${formatDuration(filled - ti.durationMs)}.`, [ti, ...ti.children], 'Remove a spot or lengthen the break.');
      } else if (filled < ti.durationMs) {
        add('BREAK_UNDERFILL', 'WARNING', `Break "${name}" has ${formatDuration(ti.durationMs - filled)} unsold/unfilled.`, [ti], 'Place more advertisements or promos, or shorten the break.');
      }
      continue;
    }

    const facts = spec.contentItemId ? ctx.content.get(spec.contentItemId) : undefined;
    if (!facts) {
      add('MISSING_CONTENT', 'ERROR', `Item "${name}" references content that no longer exists.`, [ti], 'Replace it with valid content.');
      continue;
    }
    checkDuration(spec, ti, name, facts);

    if (facts.status !== 'ACTIVE') add('CONTENT_INACTIVE', 'ERROR', `"${name}" is ${facts.status.toLowerCase()} and cannot be broadcast.`, [ti], 'Activate the content or replace it.');
    if (facts.approvalState !== 'APPROVED') {
      add('UNAPPROVED_CONTENT', 'ERROR', `"${name}" is not approved for broadcast (${facts.approvalState.toLowerCase()}).`, [ti], 'Have a content manager approve it, or replace it.');
    }
    if (facts.category !== 'LIVE' && !spec.isLive) {
      if (facts.assetMissing) add('MISSING_ASSET', 'ERROR', `Media asset for "${name}" is marked missing.`, [ti], 'Re-upload or relink the media asset.');
      else if (!facts.hasAsset) add('NO_ASSET', 'WARNING', `"${name}" has no media asset linked.`, [ti], 'Link a media asset before air.');
    }
    if ((facts.availableFrom && ti.startAt < facts.availableFrom) || (facts.availableUntil && ti.endAt > facts.availableUntil)) {
      add('OUTSIDE_AVAILABILITY', 'ERROR', `"${name}" airs outside its licensed availability window.`, [ti], 'Schedule it within its rights window or replace it.');
    }
    if (facts.channelIds.length > 0 && !facts.channelIds.includes(channel.id)) {
      add('CHANNEL_INELIGIBLE', 'ERROR', `"${name}" is not cleared for this channel.`, [ti], 'Replace it, or update the content’s channel eligibility.');
    }
    if (facts.allowedStartMinute != null && facts.allowedEndMinute != null && !isWithinDailyWindow(ti.startAt, ti.endAt, zone, facts.allowedStartMinute, facts.allowedEndMinute)) {
      add('OUTSIDE_TIME_WINDOW', 'ERROR', `"${name}" may only air between ${fmtMinute(facts.allowedStartMinute)} and ${fmtMinute(facts.allowedEndMinute % 1440)}.`, [ti], 'Move it into its permitted time window.');
    }
    if (facts.category === 'ADVERTISEMENT' && !parent) {
      add('AD_OUTSIDE_BREAK', 'WARNING', `Advertisement "${name}" is scheduled outside a commercial break.`, [ti], 'Move it into a commercial break.');
    }

    const list = contentAirings.get(facts.id) ?? [];
    list.push(ti);
    contentAirings.set(facts.id, list);
    if (facts.campaign) {
      const entry = campaignAirings.get(facts.campaign.id) ?? { campaign: facts.campaign, items: [] };
      entry.items.push(ti);
      campaignAirings.set(facts.campaign.id, entry);
    }
  }

  for (const [contentId, airings] of contentAirings) {
    const facts = ctx.content.get(contentId)!;
    if (facts.maxAiringsPerDay != null && airings.length > facts.maxAiringsPerDay) {
      add('CONTENT_DAILY_LIMIT', 'ERROR', `"${facts.title}" airs ${airings.length}× (max ${facts.maxAiringsPerDay} per day).`, airings, 'Remove extra airings.');
    }
  }

  // ── Campaign checks ──
  for (const { campaign, items } of campaignAirings.values()) {
    const usage = ctx.campaignUsage.get(campaign.id) ?? { totalPlanned: 0, perDay: {}, perWeek: {}, nearbyStarts: [] };
    if (campaign.status !== 'ACTIVE' || campaign.approvalState !== 'APPROVED') {
      add('CAMPAIGN_INACTIVE', 'ERROR', `Campaign "${campaign.name}" is ${campaign.status.toLowerCase()} / ${campaign.approvalState.toLowerCase()}.`, items, 'Activate and approve the campaign, or remove its spots.');
    }
    if (campaign.channelIds.length > 0 && !campaign.channelIds.includes(channel.id)) {
      add('CAMPAIGN_CHANNEL', 'ERROR', `Campaign "${campaign.name}" does not target this channel.`, items, 'Remove the spots or add the channel to the campaign.');
    }
    const perDay: Record<string, TimedItem[]> = {};
    const perWeek: Record<string, TimedItem[]> = {};
    for (const it of items) {
      const local = toLocal(it.startAt, zone);
      if (local.isoDate < campaign.startDate || local.isoDate > campaign.endDate) {
        add('CAMPAIGN_DATES', 'ERROR', `Spot for "${campaign.name}" at ${t(it.startAt)} is outside campaign dates ${campaign.startDate} – ${campaign.endDate}.`, [it], 'Remove the spot or extend the campaign.');
      }
      if (campaign.allowedStartMinute != null && campaign.allowedEndMinute != null && !isWithinDailyWindow(it.startAt, it.endAt, zone, campaign.allowedStartMinute, campaign.allowedEndMinute)) {
        add('CAMPAIGN_TIME_WINDOW', 'ERROR', `Spot for "${campaign.name}" at ${t(it.startAt)} is outside its permitted hours ${fmtMinute(campaign.allowedStartMinute)}–${fmtMinute(campaign.allowedEndMinute % 1440)}.`, [it], 'Move it to a break inside the permitted hours.');
      }
      (perDay[local.isoDate] ??= []).push(it);
      (perWeek[local.isoWeek] ??= []).push(it);
    }
    if (campaign.dailyLimit != null) {
      for (const [day, list] of Object.entries(perDay)) {
        const total = list.length + (usage.perDay[day] ?? 0);
        if (total > campaign.dailyLimit) add('CAMPAIGN_DAILY_LIMIT', 'ERROR', `Campaign "${campaign.name}" would air ${total}× on ${day} (daily limit ${campaign.dailyLimit}).`, list, 'Remove spots from this day.');
      }
    }
    if (campaign.weeklyLimit != null) {
      for (const [week, list] of Object.entries(perWeek)) {
        const total = list.length + (usage.perWeek[week] ?? 0);
        if (total > campaign.weeklyLimit) add('CAMPAIGN_WEEKLY_LIMIT', 'ERROR', `Campaign "${campaign.name}" would air ${total}× in ${week} (weekly limit ${campaign.weeklyLimit}).`, list, 'Remove spots or move them to another week.');
      }
    }
    if (campaign.maxAirings != null) {
      const total = items.length + usage.totalPlanned;
      if (total > campaign.maxAirings) add('CAMPAIGN_TOTAL_LIMIT', 'ERROR', `Campaign "${campaign.name}" would reach ${total} airings (contracted maximum ${campaign.maxAirings}).`, items, 'Remove spots; the campaign is fully delivered.');
    }
    if (campaign.minSpacingMs != null && campaign.minSpacingMs > 0) {
      const starts = [...items.map((i) => ({ at: i.startAt.getTime(), item: i as TimedItem | null })), ...usage.nearbyStarts.map((d) => ({ at: d.getTime(), item: null }))].sort((a, b) => a.at - b.at);
      for (let k = 1; k < starts.length; k++) {
        const a = starts[k - 1];
        const b = starts[k];
        if (b.at - a.at < campaign.minSpacingMs && (a.item || b.item)) {
          add(
            'CAMPAIGN_SPACING',
            'ERROR',
            `Spots for "${campaign.name}" are ${formatDuration(b.at - a.at)} apart (minimum ${formatDuration(campaign.minSpacingMs)}).`,
            [a.item, b.item].filter((x): x is TimedItem => !!x),
            'Move one of the spots to a later break.',
          );
        }
      }
    }
  }

  // ── Configurable rules ──
  for (const rule of ctx.rules) evaluateRule(rule);

  conflicts.sort((a, b) => (a.severity === b.severity ? (a.startAt ?? '').localeCompare(b.startAt ?? '') : a.severity === 'ERROR' ? -1 : 1));
  const errorCount = conflicts.filter((c) => c.severity === 'ERROR').length;
  return { timeline, conflicts, errorCount, warningCount: conflicts.length - errorCount, ok: errorCount === 0 };

  // ── helpers (hoisted) ──
  function checkDuration(spec: ScheduleItemSpec, ti: TimedItem, name: string, facts?: ContentFacts) {
    const raw = [spec.plannedDurationMs, spec.estimatedDurationMs].filter((v): v is number => v != null);
    if (raw.some((v) => !Number.isInteger(v) || v <= 0) || ti.durationMs <= 0) {
      add('INVALID_DURATION', 'ERROR', `"${name}" has an invalid duration (${formatDuration(ti.durationMs)}).`, [ti], 'Enter a positive duration.');
    }
    if (facts && !facts.isDurationEditable && spec.plannedDurationMs != null && spec.plannedDurationMs !== facts.plannedDurationMs) {
      add('DURATION_NOT_EDITABLE', 'ERROR', `"${name}" has a fixed duration of ${formatDuration(facts.plannedDurationMs)} and cannot be resized.`, [ti], 'Reset the duration override.');
    }
  }

  function evaluateRule(rule: RuleSpec) {
    switch (rule.type) {
      case 'NO_DUPLICATE_CONTENT': {
        for (const [contentId, airings] of contentAirings) {
          const facts = ctx.content.get(contentId)!;
          if (rule.params.categories?.length && !rule.params.categories.includes(facts.category)) continue;
          const sorted = [...airings].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
          for (let k = 1; k < sorted.length; k++) {
            const within = rule.params.withinMinutes;
            if (within == null || sorted[k].startAt.getTime() - sorted[k - 1].startAt.getTime() < within * 60_000) {
              add('RULE_DUPLICATE_CONTENT', rule.severity, `"${facts.title}" is repeated${within != null ? ` within ${within} minutes` : ''} (rule "${rule.name}").`, [sorted[k - 1], sorted[k]], 'Replace one of the repeats.', rule.id);
            }
          }
        }
        break;
      }
      case 'RATING_TIME_WINDOW':
      case 'CATEGORY_TIME_WINDOW': {
        for (const { spec } of flat) {
          const facts = spec.contentItemId ? ctx.content.get(spec.contentItemId) : undefined;
          if (!facts) continue;
          const applies = rule.type === 'RATING_TIME_WINDOW' ? facts.rating != null && rule.params.ratings.includes(facts.rating) : rule.params.categories.includes(facts.category);
          if (!applies) continue;
          const ti = timedByKey.get(spec.key)!;
          if (!isWithinDailyWindow(ti.startAt, ti.endAt, zone, rule.params.startMinute, rule.params.endMinute)) {
            add(
              rule.type === 'RATING_TIME_WINDOW' ? 'RULE_RATING_WINDOW' : 'RULE_CATEGORY_WINDOW',
              rule.severity,
              `"${facts.title}" (${rule.type === 'RATING_TIME_WINDOW' ? `rated ${facts.rating}` : facts.category.toLowerCase()}) must air between ${fmtMinute(rule.params.startMinute)} and ${fmtMinute(rule.params.endMinute % 1440)} (rule "${rule.name}").`,
              [ti],
              'Move it into the permitted window.',
              rule.id,
            );
          }
        }
        break;
      }
      case 'CATEGORY_REQUIRES_APPROVAL': {
        // Unapproved content is always an ERROR (see per-item checks). This rule additionally flags
        // content in the listed categories that is approved but has no media asset to review.
        for (const { spec } of flat) {
          const facts = spec.contentItemId ? ctx.content.get(spec.contentItemId) : undefined;
          if (facts && rule.params.categories.includes(facts.category) && facts.approvalState === 'APPROVED' && !facts.hasAsset && facts.category !== 'LIVE') {
            add('RULE_REQUIRES_APPROVAL', rule.severity, `"${facts.title}" requires reviewed media (rule "${rule.name}") but has no asset.`, [timedByKey.get(spec.key)!], 'Link the reviewed media asset.', rule.id);
          }
        }
        break;
      }
      case 'SCHEDULE_END_DEADLINE': {
        if (!ctx.items.length) break;
        const deadline = broadcastTimeToInstant(ctx.broadcastDate, rule.params.endMinute % 1440, zone, channel.dayStartMinute).instant;
        if (timeline.endAt > deadline) {
          const late = timeline.items.filter((x) => x.endAt > deadline);
          add('RULE_END_DEADLINE', rule.severity, `Schedule must finish by ${fmtMinute(rule.params.endMinute % 1440)} but ends at ${t(timeline.endAt)} (rule "${rule.name}").`, late, 'Shorten or remove late items.', rule.id);
        }
        break;
      }
      case 'MAX_GAP':
        break; // evaluated inline with the sequence checks
    }
  }
}
