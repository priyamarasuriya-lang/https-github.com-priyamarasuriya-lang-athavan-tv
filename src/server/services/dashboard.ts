import type { Actor } from '@/server/auth/actor';
import { requirePermission } from '@/server/auth/actor';
import { prisma } from '@/server/db';
import { addDaysIso, broadcastDayWindow, dateToIso, isoToDbDate, toLocal } from '@/lib/time/zoned';

/** Today's operational broadcast date for a channel (accounts for the configured day start). */
export function currentBroadcastDate(now: Date, zone: string, dayStartMinute: number): string {
  const local = toLocal(now, zone);
  return local.minuteOfDay < dayStartMinute ? addDaysIso(local.isoDate, -1) : local.isoDate;
}

export async function dashboard(actor: Actor) {
  requirePermission(actor, 'schedule.view');
  const now = new Date();
  const channels = await prisma.channel.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });

  const perChannel = await Promise.all(
    channels.map(async (ch) => {
      const date = currentBroadcastDate(now, ch.timeZone, ch.broadcastDayStartMinute);
      const window = broadcastDayWindow(date, ch.timeZone, ch.broadcastDayStartMinute);
      const schedule = await prisma.broadcastSchedule.findFirst({ where: { channelId: ch.id, broadcastDate: isoToDbDate(date), status: { not: 'ARCHIVED' } } });
      if (!schedule) return { channel: { id: ch.id, name: ch.name, code: ch.code, timeZone: ch.timeZone }, date, schedule: null };
      const version = await prisma.scheduleVersion.findUnique({ where: { scheduleId_versionNo: { scheduleId: schedule.id, versionNo: schedule.currentVersionNo } } });
      const items = await prisma.scheduleItem.findMany({
        where: { versionId: version!.id, parentId: null },
        orderBy: { position: 'asc' },
        include: { contentItem: { select: { title: true, category: true } }, commercialBreak: { select: { name: true } } },
      });
      const airtime = items.reduce((s, i) => s + i.effectiveDurationMs, 0);
      const idx = items.findIndex((i) => i.startAt <= now && i.endAt > now);
      const upcoming = items.filter((i) => i.startAt > now).slice(0, 5);
      const name = (i: (typeof items)[number]) => i.contentItem?.title ?? i.label ?? i.commercialBreak?.name ?? 'Commercial break';
      return {
        channel: { id: ch.id, name: ch.name, code: ch.code, timeZone: ch.timeZone },
        date,
        schedule: {
          id: schedule.id,
          status: schedule.status,
          itemCount: items.length,
          airtimeMs: airtime,
          fillPct: Math.min(100, Math.round((airtime / window.lengthMs) * 1000) / 10),
          // Derived from the schedule plan only — there is no live playout feed.
          plannedNow: idx >= 0 ? { title: name(items[idx]), category: items[idx].contentItem?.category ?? 'BREAK', startAt: items[idx].startAt.toISOString(), endAt: items[idx].endAt.toISOString() } : null,
          upcoming: upcoming.map((i) => ({ title: name(i), category: i.contentItem?.category ?? 'BREAK', startAt: i.startAt.toISOString(), durationMs: i.effectiveDurationMs })),
        },
      };
    }),
  );

  const today = channels[0] ? currentBroadcastDate(now, channels[0].timeZone, channels[0].broadcastDayStartMinute) : dateToIso(now);
  const horizon = await prisma.broadcastSchedule.findMany({
    where: { broadcastDate: { gte: isoToDbDate(today), lte: isoToDbDate(addDaysIso(today, 7)) }, status: { not: 'ARCHIVED' } },
    include: { channel: { select: { code: true } } },
  });
  const runs = await prisma.scheduleValidationRun.findMany({ where: { scheduleId: { in: horizon.map((h) => h.id) } }, orderBy: { createdAt: 'desc' }, distinct: ['scheduleId'] });
  const hById = new Map(horizon.map((h) => [h.id, h]));
  const conflicts = runs
    .filter((r) => r.errorCount > 0 || r.warningCount > 0)
    .map((r) => ({ scheduleId: r.scheduleId, label: `${hById.get(r.scheduleId)!.channel.code} ${dateToIso(hById.get(r.scheduleId)!.broadcastDate)}`, errors: r.errorCount, warnings: r.warningCount }))
    .sort((a, b) => b.errors - a.errors)
    .slice(0, 8);

  const [pendingApprovals, recent, activeCampaigns, unread, upcomingMissing] = await Promise.all([
    prisma.approvalRequest.count({ where: { status: 'PENDING' } }),
    prisma.broadcastSchedule.findMany({ orderBy: { updatedAt: 'desc' }, take: 6, include: { channel: { select: { code: true } } } }),
    actor.permissions.has('ads.view')
      ? prisma.advertisingCampaign.findMany({ where: { status: 'ACTIVE', endDate: { gte: isoToDbDate(today) } }, select: { id: true, name: true, maxAirings: true, contractedAirings: true, endDate: true, _count: { select: { airings: { where: { status: { in: ['PLANNED', 'AIRED'] } } } } } } })
      : Promise.resolve([]),
    prisma.notification.count({ where: { userId: actor.id, readAt: null } }),
    prisma.broadcastSchedule.count({ where: { broadcastDate: { gte: isoToDbDate(today), lte: isoToDbDate(addDaysIso(today, 7)) }, status: { in: ['DRAFT', 'SUBMITTED'] } } }),
  ]);

  return {
    generatedAt: now.toISOString(),
    channels: perChannel,
    conflicts,
    pendingApprovals,
    unpublishedNext7Days: upcomingMissing,
    unread,
    recent: recent.map((r) => ({ id: r.id, label: `${r.channel.code} ${dateToIso(r.broadcastDate)}`, status: r.status, updatedAt: r.updatedAt.toISOString() })),
    campaigns: activeCampaigns.map((c) => {
      const cap = c.contractedAirings ?? c.maxAirings;
      return { id: c.id, name: c.name, booked: c._count.airings, cap, pct: cap ? Math.round((c._count.airings / cap) * 100) : null, endDate: dateToIso(c.endDate) };
    }),
  };
}

export async function listNotifications(actor: Actor) {
  return prisma.notification.findMany({ where: { userId: actor.id }, orderBy: { createdAt: 'desc' }, take: 30 });
}

export async function markNotificationsRead(actor: Actor, ids?: string[]) {
  await prisma.notification.updateMany({ where: { userId: actor.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
}
