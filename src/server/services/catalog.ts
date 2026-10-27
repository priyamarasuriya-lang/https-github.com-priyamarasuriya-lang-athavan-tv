import type { z } from 'zod';
import { requirePermission, type Actor } from '@/server/auth/actor';
import { prisma } from '@/server/db';
import { AppError, notFound } from '@/server/errors';
import { dateToIso, isoToDbDate, isValidTimeZone } from '@/lib/time/zoned';
import type {
  advertiserInputSchema,
  breakInputSchema,
  campaignInputSchema,
  channelInputSchema,
  creativeInputSchema,
  ruleInputSchema,
} from '@/server/validators/catalog';
import { ruleParamSchemas } from '@/server/validators/catalog';
import { recordAudit } from './audit';

/** Channels, advertising (advertisers, campaigns, creatives, breaks) and scheduling rules. */

// ── Channels ──
export async function listChannels(actor: Actor, includeInactive = false) {
  if (!actor.permissions.has('schedule.view') && !actor.permissions.has('content.view') && !actor.permissions.has('ads.view')) requirePermission(actor, 'schedule.view');
  return prisma.channel.findMany({ where: includeInactive ? {} : { isActive: true }, orderBy: { name: 'asc' } });
}

export async function upsertChannel(actor: Actor, id: string | null, input: z.infer<typeof channelInputSchema>) {
  requirePermission(actor, 'channel.manage');
  if (!isValidTimeZone(input.timeZone)) throw new AppError('VALIDATION_ERROR', `Unknown IANA time zone "${input.timeZone}".`);
  const data = { ...input, playoutSystem: input.playoutSystem ?? null };
  return prisma.$transaction(async (tx) => {
    const c = id ? await tx.channel.update({ where: { id }, data }) : await tx.channel.create({ data });
    await recordAudit({ actorId: actor.id, action: id ? 'channel.update' : 'channel.create', entityType: 'Channel', entityId: c.id, summary: `${c.code} ${c.name} (${c.timeZone})`, ip: actor.ip }, tx);
    return c;
  });
}

// ── Advertisers ──
export async function listAdvertisers(actor: Actor) {
  requirePermission(actor, 'ads.view');
  return prisma.advertiser.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { campaigns: true } } } });
}

export async function upsertAdvertiser(actor: Actor, id: string | null, input: z.infer<typeof advertiserInputSchema>) {
  requirePermission(actor, 'ads.manage');
  const data = { name: input.name, contactName: input.contactName ?? null, contactEmail: input.contactEmail ?? null };
  return prisma.$transaction(async (tx) => {
    const a = id ? await tx.advertiser.update({ where: { id }, data }) : await tx.advertiser.create({ data });
    await recordAudit({ actorId: actor.id, action: id ? 'advertiser.update' : 'advertiser.create', entityType: 'Advertiser', entityId: a.id, summary: a.name, ip: actor.ip }, tx);
    return a;
  });
}

// ── Campaigns ──
export async function listCampaigns(actor: Actor, opts: { status?: string } = {}) {
  requirePermission(actor, 'ads.view');
  const rows = await prisma.advertisingCampaign.findMany({
    where: opts.status ? { status: opts.status as never } : {},
    orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
    include: {
      advertiser: { select: { id: true, name: true } },
      channels: { select: { channelId: true } },
      ads: { include: { contentItem: { select: { id: true, title: true, plannedDurationMs: true, houseNumber: true, status: true, assetId: true } } } },
    },
  });
  const counts = await prisma.adAiring.groupBy({ by: ['campaignId', 'status'], where: { campaignId: { in: rows.map((r) => r.id) } }, _count: { _all: true } });
  const delivery = new Map<string, { planned: number; aired: number }>();
  for (const c of counts) {
    const d = delivery.get(c.campaignId) ?? { planned: 0, aired: 0 };
    if (c.status === 'PLANNED') d.planned += c._count._all;
    if (c.status === 'AIRED') d.aired += c._count._all;
    delivery.set(c.campaignId, d);
  }
  return rows.map((r) => {
    const d = delivery.get(r.id) ?? { planned: 0, aired: 0 };
    const contracted = r.contractedAirings ?? r.maxAirings;
    return {
      id: r.id,
      name: r.name,
      advertiser: r.advertiser,
      startDate: dateToIso(r.startDate),
      endDate: dateToIso(r.endDate),
      priority: r.priority,
      maxAirings: r.maxAirings,
      contractedAirings: r.contractedAirings,
      dailyLimit: r.dailyLimit,
      weeklyLimit: r.weeklyLimit,
      minSpacingMs: r.minSpacingMs,
      allowedStartMinute: r.allowedStartMinute,
      allowedEndMinute: r.allowedEndMinute,
      budgetCents: r.budgetCents,
      status: r.status,
      approvalState: r.approvalState,
      channelIds: r.channels.map((c) => c.channelId),
      creatives: r.ads.map((a) => ({ advertisementId: a.id, ...a.contentItem })),
      plannedAirings: d.planned,
      airedAirings: d.aired,
      remainingAirings: contracted != null ? Math.max(0, contracted - d.planned - d.aired) : null,
    };
  });
}

export async function upsertCampaign(actor: Actor, id: string | null, input: z.infer<typeof campaignInputSchema>) {
  requirePermission(actor, 'ads.manage');
  if (!(await prisma.advertiser.findUnique({ where: { id: input.advertiserId } }))) throw new AppError('VALIDATION_ERROR', 'Advertiser does not exist.');
  const { channelIds, ...rest } = input;
  const data = {
    ...rest,
    startDate: isoToDbDate(input.startDate),
    endDate: isoToDbDate(input.endDate),
    maxAirings: rest.maxAirings ?? null,
    contractedAirings: rest.contractedAirings ?? null,
    dailyLimit: rest.dailyLimit ?? null,
    weeklyLimit: rest.weeklyLimit ?? null,
    minSpacingMs: rest.minSpacingMs ?? null,
    allowedStartMinute: rest.allowedStartMinute ?? null,
    allowedEndMinute: rest.allowedEndMinute ?? null,
    budgetCents: rest.budgetCents ?? null,
  };
  return prisma.$transaction(async (tx) => {
    if (id) await tx.campaignChannel.deleteMany({ where: { campaignId: id } });
    const c = id
      ? await tx.advertisingCampaign.update({ where: { id }, data: { ...data, channels: { create: channelIds.map((channelId) => ({ channelId })) } } })
      : await tx.advertisingCampaign.create({ data: { ...data, channels: { create: channelIds.map((channelId) => ({ channelId })) } } });
    await recordAudit({ actorId: actor.id, action: id ? 'campaign.update' : 'campaign.create', entityType: 'AdvertisingCampaign', entityId: c.id, summary: `${c.name} ${input.startDate}–${input.endDate}`, ip: actor.ip }, tx);
    return c;
  });
}

export async function setCampaignApproval(actor: Actor, id: string, approvalState: 'APPROVED' | 'REJECTED') {
  requirePermission(actor, 'ads.manage');
  const c = await prisma.advertisingCampaign.findUnique({ where: { id } });
  if (!c) throw notFound('Campaign');
  await prisma.$transaction(async (tx) => {
    await tx.advertisingCampaign.update({ where: { id }, data: { approvalState } });
    await recordAudit({ actorId: actor.id, action: `campaign.${approvalState.toLowerCase()}`, entityType: 'AdvertisingCampaign', entityId: id, summary: c.name, ip: actor.ip }, tx);
  });
}

/** Add a creative (an ADVERTISEMENT content item) to a campaign. */
export async function addCreative(actor: Actor, campaignId: string, input: z.infer<typeof creativeInputSchema>) {
  requirePermission(actor, 'ads.manage');
  const campaign = await prisma.advertisingCampaign.findUnique({ where: { id: campaignId }, include: { channels: true } });
  if (!campaign) throw notFound('Campaign');
  if (input.assetId && !(await prisma.mediaAsset.findUnique({ where: { id: input.assetId } }))) throw new AppError('VALIDATION_ERROR', 'Media asset does not exist.');
  return prisma.$transaction(async (tx) => {
    const content = await tx.contentItem.create({
      data: {
        title: input.title,
        houseNumber: input.houseNumber ?? null,
        category: 'ADVERTISEMENT',
        plannedDurationMs: input.plannedDurationMs,
        originalDurationMs: input.plannedDurationMs,
        isDurationEditable: false,
        assetId: input.assetId ?? null,
        createdById: actor.id,
        updatedById: actor.id,
        channels: { create: campaign.channels.map((c) => ({ channelId: c.channelId })) },
      },
    });
    const ad = await tx.advertisement.create({ data: { campaignId, contentItemId: content.id } });
    await recordAudit({ actorId: actor.id, action: 'creative.create', entityType: 'Advertisement', entityId: ad.id, summary: `"${content.title}" for ${campaign.name}`, ip: actor.ip }, tx);
    return { ...ad, contentItem: content };
  });
}

// ── Commercial breaks ──
export async function listBreaks(actor: Actor) {
  if (!actor.permissions.has('ads.view')) requirePermission(actor, 'schedule.view');
  return prisma.commercialBreak.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }], include: { channel: { select: { name: true } } } });
}

export async function upsertBreak(actor: Actor, id: string | null, input: z.infer<typeof breakInputSchema>) {
  requirePermission(actor, 'ads.manage');
  const data = { ...input, channelId: input.channelId ?? null };
  return prisma.$transaction(async (tx) => {
    const b = id ? await tx.commercialBreak.update({ where: { id }, data }) : await tx.commercialBreak.create({ data });
    await recordAudit({ actorId: actor.id, action: id ? 'break.update' : 'break.create', entityType: 'CommercialBreak', entityId: b.id, summary: b.name, ip: actor.ip }, tx);
    return b;
  });
}

// ── Rules ──
export async function listRules(actor: Actor) {
  requirePermission(actor, 'schedule.view');
  return prisma.scheduleRule.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }], include: { channel: { select: { name: true } } } });
}

export async function upsertRule(actor: Actor, id: string | null, input: z.infer<typeof ruleInputSchema>) {
  requirePermission(actor, 'channel.manage');
  const params = ruleParamSchemas[input.type].parse(input.params);
  const data = { name: input.name, type: input.type, channelId: input.channelId ?? null, severity: input.severity, isActive: input.isActive, params };
  return prisma.$transaction(async (tx) => {
    const r = id ? await tx.scheduleRule.update({ where: { id }, data }) : await tx.scheduleRule.create({ data });
    await recordAudit({ actorId: actor.id, action: id ? 'rule.update' : 'rule.create', entityType: 'ScheduleRule', entityId: r.id, summary: `${r.type}: ${r.name}`, data: params, ip: actor.ip }, tx);
    return r;
  });
}
