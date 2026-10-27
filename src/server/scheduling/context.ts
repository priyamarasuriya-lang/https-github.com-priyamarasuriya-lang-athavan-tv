import { randomUUID } from 'node:crypto';
import type { Channel, Prisma, ScheduleItem } from '@prisma/client';
import type { Tx } from '@/server/db';
import { AppError } from '@/server/errors';
import { broadcastDayWindow, broadcastTimeToInstant, dateToIso, fmtLocalTime, toLocal } from '@/lib/time/zoned';
import type { ItemInput } from '@/server/validators/schedule';
import type { BreakFacts, CampaignUsage, ContentFacts, RuleSpec, ScheduleItemSpec, ValidationContext } from './types';

/**
 * Bridges persistence and the pure engine: converts API input / DB rows into ScheduleItemSpecs and
 * loads every fact the validator needs in a fixed number of queries (no N+1).
 */

export function inputsToSpecs(inputs: ItemInput[], channel: Channel, broadcastDate: string, opts: { useClientKeys?: boolean } = {}): ScheduleItemSpec[] {
  const convert = (i: ItemInput): ScheduleItemSpec => ({
    key: opts.useClientKeys && i.clientKey ? i.clientKey : randomUUID(),
    kind: i.kind,
    contentItemId: i.kind === 'CONTENT' ? (i.contentItemId ?? null) : null,
    commercialBreakId: i.kind === 'BREAK' ? (i.commercialBreakId ?? null) : null,
    label: i.label ?? null,
    timingMode: i.timingMode,
    fixedStartAt: i.timingMode === 'FIXED' && i.fixedTime ? fixedTimeToInstant(i.fixedTime, channel, broadcastDate) : null,
    plannedDurationMs: i.plannedDurationMs ?? null,
    estimatedDurationMs: i.estimatedDurationMs ?? null,
    gapAfterMs: i.gapAfterMs ?? null,
    isLive: i.isLive ?? false,
    children: (i.children ?? []).map(convert),
  });
  return inputs.map(convert);
}

export function fixedTimeToInstant(hhmmss: string, channel: Channel, broadcastDate: string): Date {
  const [h, m, s = 0] = hhmmss.split(':').map(Number);
  const r = broadcastTimeToInstant(broadcastDate, h * 60 + m, channel.timeZone, channel.broadcastDayStartMinute);
  return new Date(r.instant.getTime() + s * 1000);
}

export function instantToFixedTime(instant: Date, zone: string): string {
  return fmtLocalTime(instant, zone, true);
}

type ItemRow = ScheduleItem;

export function rowsToSpecs(rows: ItemRow[]): { specs: ScheduleItemSpec[]; notes: Map<string, string | null> } {
  const notes = new Map<string, string | null>();
  const byParent = new Map<string | null, ItemRow[]>();
  for (const r of rows) {
    const list = byParent.get(r.parentId) ?? [];
    list.push(r);
    byParent.set(r.parentId, list);
    notes.set(r.id, r.notes);
  }
  const build = (r: ItemRow): ScheduleItemSpec => ({
    key: r.id,
    kind: r.kind,
    contentItemId: r.contentItemId,
    commercialBreakId: r.commercialBreakId,
    label: r.label,
    timingMode: r.timingMode,
    fixedStartAt: r.fixedStartAt,
    plannedDurationMs: r.plannedDurationMs,
    estimatedDurationMs: r.estimatedDurationMs,
    gapAfterMs: r.gapAfterMs,
    isLive: r.isLive,
    children: (byParent.get(r.id) ?? []).sort((a, b) => a.position - b.position).map(build),
  });
  const specs = (byParent.get(null) ?? []).sort((a, b) => a.position - b.position).map(build);
  return { specs, notes };
}

export function collectIds(specs: ScheduleItemSpec[]) {
  const content = new Set<string>();
  const breaks = new Set<string>();
  const walk = (list: ScheduleItemSpec[]) =>
    list.forEach((s) => {
      if (s.contentItemId) content.add(s.contentItemId);
      if (s.commercialBreakId) breaks.add(s.commercialBreakId);
      walk(s.children);
    });
  walk(specs);
  return { contentIds: [...content], breakIds: [...breaks] };
}

const contentInclude = {
  asset: { select: { status: true } },
  channels: { select: { channelId: true } },
  advertisement: { include: { campaign: { include: { channels: { select: { channelId: true } } } } } },
} satisfies Prisma.ContentItemInclude;

type ContentRow = Prisma.ContentItemGetPayload<{ include: typeof contentInclude }>;

export function contentRowToFacts(c: ContentRow): ContentFacts {
  const camp = c.advertisement?.campaign;
  return {
    id: c.id,
    title: c.title,
    category: c.category,
    status: c.status,
    approvalState: c.approvalState,
    plannedDurationMs: c.plannedDurationMs,
    isDurationEditable: c.isDurationEditable,
    hasAsset: !!c.assetId,
    assetMissing: c.asset?.status === 'MISSING',
    rating: c.rating,
    availableFrom: c.availableFrom,
    availableUntil: c.availableUntil,
    allowedStartMinute: c.allowedStartMinute,
    allowedEndMinute: c.allowedEndMinute,
    maxAiringsPerDay: c.maxAiringsPerDay,
    channelIds: c.channels.map((x) => x.channelId),
    campaign: camp
      ? {
          id: camp.id,
          name: camp.name,
          status: camp.status,
          approvalState: camp.approvalState,
          startDate: dateToIso(camp.startDate),
          endDate: dateToIso(camp.endDate),
          channelIds: camp.channels.map((x) => x.channelId),
          maxAirings: camp.maxAirings,
          dailyLimit: camp.dailyLimit,
          weeklyLimit: camp.weeklyLimit,
          minSpacingMs: camp.minSpacingMs,
          allowedStartMinute: camp.allowedStartMinute,
          allowedEndMinute: camp.allowedEndMinute,
        }
      : null,
  };
}

export async function loadValidationContext(
  tx: Tx,
  schedule: { id: string; channel: Channel; broadcastDate: Date },
  specs: ScheduleItemSpec[],
): Promise<ValidationContext & { contentRows: Map<string, ContentRow> }> {
  const { channel } = schedule;
  const broadcastDate = dateToIso(schedule.broadcastDate);
  const { contentIds, breakIds } = collectIds(specs);

  const [contentRows, breakRows, ruleRows] = await Promise.all([
    contentIds.length ? tx.contentItem.findMany({ where: { id: { in: contentIds } }, include: contentInclude }) : Promise.resolve([] as ContentRow[]),
    breakIds.length ? tx.commercialBreak.findMany({ where: { id: { in: breakIds } } }) : Promise.resolve([]),
    tx.scheduleRule.findMany({ where: { isActive: true, OR: [{ channelId: null }, { channelId: channel.id }] } }),
  ]);

  // Breaks must belong to this channel or be global.
  for (const b of breakRows) {
    if (b.channelId && b.channelId !== channel.id) throw new AppError('VALIDATION_ERROR', `Break "${b.name}" belongs to another channel.`);
  }

  const content = new Map<string, ContentFacts>(contentRows.map((c) => [c.id, contentRowToFacts(c)]));
  const breaks = new Map<string, BreakFacts>(breakRows.map((b) => [b.id, { id: b.id, name: b.name, minDurationMs: b.minDurationMs, maxDurationMs: b.maxDurationMs, defaultDurationMs: b.defaultDurationMs }]));
  const rules = ruleRows.map((r) => ({ id: r.id, name: r.name, severity: r.severity, type: r.type, params: r.params }) as unknown as RuleSpec);

  // Campaign usage by other (published) schedules — quotas are global across channels.
  const campaignIds = [...new Set([...content.values()].map((c) => c.campaign?.id).filter((x): x is string => !!x))];
  const campaignUsage = new Map<string, CampaignUsage>();
  if (campaignIds.length) {
    const window = broadcastDayWindow(broadcastDate, channel.timeZone, channel.broadcastDayStartMinute);
    const airings = await tx.adAiring.findMany({
      where: { campaignId: { in: campaignIds }, scheduleId: { not: schedule.id }, status: { in: ['PLANNED', 'AIRED'] } },
      select: { campaignId: true, plannedStartAt: true, channelId: true },
    });
    for (const id of campaignIds) campaignUsage.set(id, { totalPlanned: 0, perDay: {}, perWeek: {}, nearbyStarts: [] });
    const dayMs = 86_400_000;
    for (const a of airings) {
      const u = campaignUsage.get(a.campaignId)!;
      const local = toLocal(a.plannedStartAt, channel.timeZone);
      u.totalPlanned += 1;
      u.perDay[local.isoDate] = (u.perDay[local.isoDate] ?? 0) + 1;
      u.perWeek[local.isoWeek] = (u.perWeek[local.isoWeek] ?? 0) + 1;
      const t = a.plannedStartAt.getTime();
      if (a.channelId === channel.id && t >= window.start.getTime() - dayMs && t <= window.end.getTime() + dayMs) u.nearbyStarts.push(a.plannedStartAt);
    }
  }

  return {
    channel: {
      id: channel.id,
      timeZone: channel.timeZone,
      dayStartMinute: channel.broadcastDayStartMinute,
      defaultGapMs: channel.defaultGapMs,
      underrunToleranceMs: channel.underrunToleranceMs,
    },
    broadcastDate,
    items: specs,
    content,
    breaks,
    rules,
    campaignUsage,
    contentRows: new Map(contentRows.map((c) => [c.id, c])),
  };
}
