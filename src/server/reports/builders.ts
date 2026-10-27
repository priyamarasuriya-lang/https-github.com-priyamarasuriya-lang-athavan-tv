import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { requirePermission, type Actor } from '@/server/auth/actor';
import { prisma } from '@/server/db';
import { AppError } from '@/server/errors';
import { CATEGORY_LABELS } from '@/lib/dto';
import { broadcastDayWindow, dateToIso, isoToDbDate } from '@/lib/time/zoned';
import { getScheduleView } from '@/server/services/schedules';
import { getSetting } from '@/server/services/settings';
import { sumColumn } from './format';
import { MAX_REPORT_ROWS, type Cell, type Report } from './types';

export const REPORT_KEYS = [
  'daily-log',
  'schedules',
  'program-airtime',
  'ad-delivery',
  'campaign-quota',
  'conflicts',
  'revisions',
  'pending-approvals',
  'schedule-audit',
  'planned-vs-actual',
  'content-usage',
] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

export const REPORT_TITLES: Record<ReportKey, string> = {
  'daily-log': 'Daily broadcast log',
  schedules: 'Schedules overview',
  'program-airtime': 'Program airtime',
  'ad-delivery': 'Advertising delivery',
  'campaign-quota': 'Campaign quota & remaining airings',
  conflicts: 'Schedule conflicts',
  revisions: 'Schedule revisions',
  'pending-approvals': 'Pending approvals',
  'schedule-audit': 'Schedule change audit',
  'planned-vs-actual': 'Planned vs actual',
  'content-usage': 'Content usage',
};

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const reportFilterSchema = z.object({
  from: iso,
  to: iso,
  channelId: z.string().optional(),
  category: z.string().regex(/^[A-Z_,]*$/).optional(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'PUBLISHED', 'ARCHIVED']).optional(),
  scheduleId: z.string().optional(),
});
export type ReportFilters = z.infer<typeof reportFilterSchema>;

export async function buildReport(actor: Actor, key: ReportKey, f: ReportFilters): Promise<Report> {
  requirePermission(actor, 'reports.view');
  if (f.to < f.from) throw new AppError('VALIDATION_ERROR', '"to" must be on or after "from".');
  const channel = f.channelId ? await prisma.channel.findUnique({ where: { id: f.channelId } }) : null;
  if (f.channelId && !channel) throw new AppError('NOT_FOUND', 'Channel not found.');
  const zone = channel?.timeZone ?? (await prisma.channel.findFirst({ where: { isActive: true }, orderBy: { name: 'asc' } }))?.timeZone ?? 'UTC';
  const base: Omit<Report, 'columns' | 'rows'> = {
    key,
    title: REPORT_TITLES[key],
    station: await getSetting('stationName'),
    period: f.from === f.to ? f.from : `${f.from} to ${f.to}`,
    channel: channel ? `${channel.name} (${channel.code})` : 'All channels',
    timeZone: zone,
    generatedAt: new Date(),
  };
  const scheduleWhere: Prisma.BroadcastScheduleWhereInput = {
    broadcastDate: { gte: isoToDbDate(f.from), lte: isoToDbDate(f.to) },
    ...(f.channelId ? { channelId: f.channelId } : {}),
    ...(f.status ? { status: f.status } : { status: { not: 'ARCHIVED' } }),
  };
  const categories = f.category ? f.category.split(',').filter(Boolean) : [];

  switch (key) {
    case 'daily-log': {
      const schedules = f.scheduleId
        ? [{ id: f.scheduleId }]
        : await prisma.broadcastSchedule.findMany({ where: scheduleWhere, select: { id: true }, orderBy: [{ broadcastDate: 'asc' }, { channelId: 'asc' }], take: 31 });
      const rows: Array<Record<string, Cell>> = [];
      let tz = zone;
      let channelLabel = base.channel;
      let period = base.period;
      for (const s of schedules) {
        const view = await getScheduleView(actor, s.id);
        tz = view.channel.timeZone;
        if (f.scheduleId) {
          channelLabel = `${view.channel.name} (${view.channel.code})`;
          period = `${view.broadcastDate} — revision ${view.versionNo}, ${view.status.toLowerCase()}`;
        }
        for (const it of view.items) {
          const push = (x: typeof it, inBreak: boolean) => {
            if (categories.length && !categories.includes(x.category)) return;
            rows.push({
              date: view.broadcastDate,
              channel: view.channel.code,
              start: x.startAt,
              end: x.endAt,
              duration: x.durationMs,
              title: inBreak ? `  ↳ ${x.title}` : x.title,
              category: CATEGORY_LABELS[x.category],
              house: x.houseNumber,
              timing: x.timingMode === 'FIXED' ? 'Fixed' : '',
            });
          };
          push(it, false);
          it.children.forEach((c) => push(c, true));
        }
      }
      const topLevel = rows.filter((r) => !String(r.title).startsWith('  ↳'));
      return {
        ...base,
        timeZone: tz,
        channel: channelLabel,
        period,
        columns: [
          { key: 'date', label: 'Broadcast date', type: 'text', width: 1.4 },
          { key: 'channel', label: 'Ch', type: 'text', width: 0.8 },
          { key: 'start', label: 'Start', type: 'datetime', width: 2 },
          { key: 'end', label: 'End', type: 'datetime', width: 2 },
          { key: 'duration', label: 'Duration', type: 'duration', width: 1.3 },
          { key: 'title', label: 'Title', type: 'text', width: 4 },
          { key: 'category', label: 'Category', type: 'text', width: 1.6 },
          { key: 'house', label: 'House no.', type: 'text', width: 1.3 },
          { key: 'timing', label: 'Timing', type: 'text', width: 0.9 },
        ],
        rows,
        totals: { duration: sumColumn(topLevel, 'duration') },
        notes: ['Total duration counts top-level items only; spots inside breaks are included in their break.'],
      };
    }

    case 'schedules': {
      const rows = await prisma.broadcastSchedule.findMany({ where: scheduleWhere, include: { channel: true, versions: true }, orderBy: [{ broadcastDate: 'asc' }, { channelId: 'asc' }], take: MAX_REPORT_ROWS });
      const current = rows.map((s) => s.versions.find((v) => v.versionNo === s.currentVersionNo)!.id);
      const sums = await prisma.scheduleItem.groupBy({ by: ['versionId'], where: { versionId: { in: current }, parentId: null }, _sum: { effectiveDurationMs: true }, _count: { _all: true }, _max: { endAt: true } });
      const by = new Map(sums.map((x) => [x.versionId, x]));
      const out = rows.map((s, i) => {
        const agg = by.get(current[i]);
        const w = broadcastDayWindow(dateToIso(s.broadcastDate), s.channel.timeZone, s.channel.broadcastDayStartMinute);
        const airtime = agg?._sum.effectiveDurationMs ?? 0;
        return {
          date: dateToIso(s.broadcastDate),
          channel: s.channel.code,
          status: s.status,
          revision: s.currentVersionNo,
          items: agg?._count._all ?? 0,
          airtime,
          fill: Math.round((airtime / w.lengthMs) * 1000) / 10,
          end: agg?._max.endAt?.toISOString() ?? null,
        };
      });
      return {
        ...base,
        columns: [
          { key: 'date', label: 'Date', type: 'text' },
          { key: 'channel', label: 'Channel', type: 'text' },
          { key: 'status', label: 'Status', type: 'text' },
          { key: 'revision', label: 'Rev', type: 'number' },
          { key: 'items', label: 'Items', type: 'number' },
          { key: 'airtime', label: 'Airtime', type: 'duration' },
          { key: 'fill', label: 'Fill %', type: 'number' },
          { key: 'end', label: 'Ends', type: 'datetime' },
        ],
        rows: out,
        totals: { items: sumColumn(out, 'items'), airtime: sumColumn(out, 'airtime') },
      };
    }

    case 'program-airtime':
    case 'content-usage': {
      const versions = await currentVersionIds(scheduleWhere);
      const groups = await prisma.scheduleItem.groupBy({
        by: ['contentItemId'],
        where: { versionId: { in: versions }, contentItemId: { not: null }, ...(categories.length ? { contentItem: { category: { in: categories as never[] } } } : key === 'program-airtime' ? { contentItem: { category: { notIn: ['ADVERTISEMENT', 'PROMO', 'FILLER', 'SLIDE', 'STATION_ID', 'PSA'] } } } : {}) },
        _count: { _all: true },
        _sum: { effectiveDurationMs: true },
        _min: { startAt: true },
        _max: { startAt: true },
      });
      const content = new Map((await prisma.contentItem.findMany({ where: { id: { in: groups.map((g) => g.contentItemId!) } }, select: { id: true, title: true, category: true, houseNumber: true } })).map((c) => [c.id, c]));
      const rows = groups
        .map((g) => {
          const c = content.get(g.contentItemId!)!;
          return { title: c.title, house: c.houseNumber, category: CATEGORY_LABELS[c.category], airings: g._count._all, airtime: g._sum.effectiveDurationMs ?? 0, first: g._min.startAt?.toISOString() ?? null, last: g._max.startAt?.toISOString() ?? null };
        })
        .sort((a, b) => b.airtime - a.airtime);
      return {
        ...base,
        columns: [
          { key: 'title', label: 'Title', type: 'text', width: 4 },
          { key: 'house', label: 'House no.', type: 'text' },
          { key: 'category', label: 'Category', type: 'text' },
          { key: 'airings', label: 'Airings', type: 'number' },
          { key: 'airtime', label: 'Airtime', type: 'duration' },
          { key: 'first', label: 'First airing', type: 'datetime', width: 2 },
          { key: 'last', label: 'Last airing', type: 'datetime', width: 2 },
        ],
        rows,
        totals: { airings: sumColumn(rows, 'airings'), airtime: sumColumn(rows, 'airtime') },
        notes: ['Counts scheduled items in the current revision of each non-archived schedule in the period.'],
      };
    }

    case 'ad-delivery':
    case 'campaign-quota': {
      const from = broadcastDayWindow(f.from, zone, 0).start;
      const to = broadcastDayWindow(f.to, zone, 0).end;
      const campaigns = await prisma.advertisingCampaign.findMany({
        where: key === 'ad-delivery' ? { startDate: { lte: isoToDbDate(f.to) }, endDate: { gte: isoToDbDate(f.from) } } : {},
        include: { advertiser: true },
        orderBy: { name: 'asc' },
      });
      const inPeriod = await prisma.adAiring.groupBy({
        by: ['campaignId', 'status'],
        where: { campaignId: { in: campaigns.map((c) => c.id) }, plannedStartAt: { gte: from, lt: to }, ...(f.channelId ? { channelId: f.channelId } : {}) },
        _count: { _all: true },
        _sum: { plannedDurationMs: true },
      });
      const lifetime = await prisma.adAiring.groupBy({ by: ['campaignId', 'status'], where: { campaignId: { in: campaigns.map((c) => c.id) } }, _count: { _all: true } });
      const get = (list: typeof lifetime, id: string, status: string) => list.find((x) => x.campaignId === id && x.status === status)?._count._all ?? 0;
      const rows = campaigns.map((c) => {
        const planned = get(inPeriod as typeof lifetime, c.id, 'PLANNED');
        const aired = get(inPeriod as typeof lifetime, c.id, 'AIRED');
        const allPlanned = get(lifetime, c.id, 'PLANNED');
        const allAired = get(lifetime, c.id, 'AIRED');
        const contracted = c.contractedAirings ?? c.maxAirings;
        const seconds = inPeriod.filter((x) => x.campaignId === c.id && x.status !== 'CANCELLED').reduce((s, x) => s + (x._sum.plannedDurationMs ?? 0), 0);
        return {
          campaign: c.name,
          advertiser: c.advertiser.name,
          dates: `${dateToIso(c.startDate)} – ${dateToIso(c.endDate)}`,
          status: c.status,
          planned,
          aired,
          airtime: seconds,
          contracted: contracted ?? null,
          remaining: contracted != null ? Math.max(0, contracted - allPlanned - allAired) : null,
          pct: contracted ? Math.round(((allPlanned + allAired) / contracted) * 1000) / 10 : null,
        };
      });
      return {
        ...base,
        columns: [
          { key: 'campaign', label: 'Campaign', type: 'text', width: 3 },
          { key: 'advertiser', label: 'Advertiser', type: 'text', width: 2.5 },
          { key: 'dates', label: 'Flight', type: 'text', width: 2.5 },
          { key: 'status', label: 'Status', type: 'text' },
          { key: 'planned', label: 'Planned (period)', type: 'number' },
          { key: 'aired', label: 'Aired (period)', type: 'number' },
          { key: 'airtime', label: 'Airtime', type: 'duration' },
          { key: 'contracted', label: 'Contracted', type: 'number' },
          { key: 'remaining', label: 'Remaining', type: 'number' },
          { key: 'pct', label: 'Booked %', type: 'number' },
        ],
        rows,
        totals: { planned: sumColumn(rows, 'planned'), aired: sumColumn(rows, 'aired'), airtime: sumColumn(rows, 'airtime') },
        notes: ['Planned airings are created when a schedule is published. "Aired" requires as-run data from a playout integration, which is not connected.'],
      };
    }

    case 'conflicts': {
      const schedules = await prisma.broadcastSchedule.findMany({ where: scheduleWhere, include: { channel: true }, take: 400 });
      const runs = await prisma.scheduleValidationRun.findMany({ where: { scheduleId: { in: schedules.map((s) => s.id) } }, orderBy: { createdAt: 'desc' }, distinct: ['scheduleId'] });
      const sById = new Map(schedules.map((s) => [s.id, s]));
      const rows: Array<Record<string, Cell>> = [];
      for (const r of runs) {
        const s = sById.get(r.scheduleId)!;
        for (const c of r.results as Array<{ code: string; severity: string; message: string; startAt: string | null; suggestion: string }>) {
          rows.push({ date: dateToIso(s.broadcastDate), channel: s.channel.code, status: s.status, severity: c.severity, code: c.code, at: c.startAt, message: c.message, suggestion: c.suggestion, checked: r.createdAt.toISOString() });
        }
      }
      return {
        ...base,
        columns: [
          { key: 'date', label: 'Date', type: 'text', width: 1.3 },
          { key: 'channel', label: 'Ch', type: 'text', width: 0.8 },
          { key: 'severity', label: 'Severity', type: 'text', width: 1.1 },
          { key: 'code', label: 'Code', type: 'text', width: 2 },
          { key: 'at', label: 'At', type: 'datetime', width: 1.8 },
          { key: 'message', label: 'Problem', type: 'text', width: 5 },
          { key: 'suggestion', label: 'Suggested resolution', type: 'text', width: 3 },
        ],
        rows,
        totals: { severity: rows.filter((r) => r.severity === 'ERROR').length },
        notes: ['Based on the latest validation run of each schedule. "Total" under Severity counts blocking errors.'],
      };
    }

    case 'revisions': {
      const versions = await prisma.scheduleVersion.findMany({ where: { schedule: scheduleWhere }, include: { schedule: { include: { channel: true } } }, orderBy: [{ createdAt: 'desc' }], take: MAX_REPORT_ROWS });
      const users = await userNames(versions.map((v) => v.createdById));
      const rows = versions.map((v) => ({ date: dateToIso(v.schedule.broadcastDate), channel: v.schedule.channel.code, revision: v.versionNo, created: v.createdAt.toISOString(), by: users.get(v.createdById) ?? '', frozen: v.frozenAt ? 'Yes' : 'No', note: v.note }));
      return {
        ...base,
        columns: [
          { key: 'date', label: 'Date', type: 'text' },
          { key: 'channel', label: 'Channel', type: 'text' },
          { key: 'revision', label: 'Revision', type: 'number' },
          { key: 'created', label: 'Created', type: 'datetime', width: 2 },
          { key: 'by', label: 'By', type: 'text', width: 2 },
          { key: 'frozen', label: 'Frozen', type: 'text' },
          { key: 'note', label: 'Note / reason', type: 'text', width: 4 },
        ],
        rows,
      };
    }

    case 'pending-approvals': {
      const reqs = await prisma.approvalRequest.findMany({ where: { status: 'PENDING', schedule: { ...scheduleWhere, status: 'SUBMITTED' } }, include: { schedule: { include: { channel: true } } }, orderBy: { submittedAt: 'asc' } });
      const users = await userNames(reqs.map((r) => r.submittedById));
      const now = Date.now();
      const rows = reqs.map((r) => ({ date: dateToIso(r.schedule.broadcastDate), channel: r.schedule.channel.code, revision: r.versionNo, submitted: r.submittedAt.toISOString(), by: users.get(r.submittedById) ?? '', waiting: now - r.submittedAt.getTime(), note: r.note }));
      return {
        ...base,
        columns: [
          { key: 'date', label: 'Broadcast date', type: 'text' },
          { key: 'channel', label: 'Channel', type: 'text' },
          { key: 'revision', label: 'Rev', type: 'number' },
          { key: 'submitted', label: 'Submitted', type: 'datetime', width: 2 },
          { key: 'by', label: 'Submitted by', type: 'text', width: 2 },
          { key: 'waiting', label: 'Waiting', type: 'duration' },
          { key: 'note', label: 'Note', type: 'text', width: 3 },
        ],
        rows,
      };
    }

    case 'schedule-audit': {
      const from = broadcastDayWindow(f.from, zone, 0).start;
      const to = broadcastDayWindow(f.to, zone, 0).end;
      const ids = f.channelId ? (await prisma.broadcastSchedule.findMany({ where: { channelId: f.channelId }, select: { id: true } })).map((s) => s.id) : null;
      const logs = await prisma.auditLog.findMany({
        where: { entityType: 'BroadcastSchedule', createdAt: { gte: from, lt: to }, ...(ids ? { entityId: { in: ids } } : {}) },
        include: { actor: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: MAX_REPORT_ROWS,
      });
      const scheds = new Map((await prisma.broadcastSchedule.findMany({ where: { id: { in: [...new Set(logs.map((l) => l.entityId))] } }, include: { channel: true } })).map((s) => [s.id, s]));
      const rows = logs.map((l) => {
        const s = scheds.get(l.entityId);
        return { at: l.createdAt.toISOString(), user: l.actor?.name ?? 'system', action: l.action, schedule: s ? `${s.channel.code} ${dateToIso(s.broadcastDate)}` : l.entityId, summary: l.summary };
      });
      return {
        ...base,
        columns: [
          { key: 'at', label: 'When', type: 'datetime', width: 2 },
          { key: 'user', label: 'User', type: 'text', width: 2 },
          { key: 'action', label: 'Action', type: 'text', width: 2 },
          { key: 'schedule', label: 'Schedule', type: 'text', width: 2 },
          { key: 'summary', label: 'Details', type: 'text', width: 5 },
        ],
        rows,
        truncated: logs.length === MAX_REPORT_ROWS,
      };
    }

    case 'planned-vs-actual': {
      const versions = await currentVersionIds({ ...scheduleWhere, status: 'PUBLISHED' });
      const items = await prisma.scheduleItem.findMany({ where: { versionId: { in: versions }, actualStartAt: { not: null } }, include: { contentItem: { select: { title: true } } }, orderBy: { startAt: 'asc' }, take: MAX_REPORT_ROWS });
      const rows = items.map((i) => ({
        title: i.contentItem?.title ?? i.label ?? 'Break',
        planned: i.startAt.toISOString(),
        actual: i.actualStartAt!.toISOString(),
        plannedDuration: i.effectiveDurationMs,
        actualDuration: i.actualDurationMs,
        drift: i.actualStartAt!.getTime() - i.startAt.getTime(),
      }));
      return {
        ...base,
        columns: [
          { key: 'title', label: 'Title', type: 'text', width: 4 },
          { key: 'planned', label: 'Planned start', type: 'datetime', width: 2 },
          { key: 'actual', label: 'Actual start', type: 'datetime', width: 2 },
          { key: 'plannedDuration', label: 'Planned dur.', type: 'duration' },
          { key: 'actualDuration', label: 'Actual dur.', type: 'duration' },
          { key: 'drift', label: 'Start drift', type: 'duration' },
        ],
        rows,
        notes: rows.length ? [] : ['No as-run (actual) data is available. This report fills in once a playout system integration records actual airings.'],
      };
    }
  }
}

async function currentVersionIds(where: Prisma.BroadcastScheduleWhereInput) {
  const s = await prisma.broadcastSchedule.findMany({ where, select: { id: true, currentVersionNo: true } });
  if (!s.length) return [];
  const v = await prisma.scheduleVersion.findMany({ where: { OR: s.map((x) => ({ scheduleId: x.id, versionNo: x.currentVersionNo })) }, select: { id: true } });
  return v.map((x) => x.id);
}

async function userNames(ids: string[]) {
  return new Map((await prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
}
