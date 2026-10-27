import type { Prisma } from '@/generated/prisma/client';
import type { z } from 'zod';
import { requirePermission, type Actor } from '@/server/auth/actor';
import { prisma } from '@/server/db';
import { AppError, notFound } from '@/server/errors';
import type { contentInputSchema, contentListSchema } from '@/server/validators/catalog';
import { recordAudit } from './audit';

type ContentInput = z.infer<typeof contentInputSchema>;
type ContentList = z.infer<typeof contentListSchema>;

export async function listContent(actor: Actor, f: ContentList) {
  requirePermission(actor, 'content.view');
  const categories = f.category ? (f.category.split(',') as ContentInput['category'][]) : undefined;
  const where: Prisma.ContentItemWhereInput = {
    ...(categories ? { category: { in: categories } } : {}),
    ...(f.status ? { status: f.status } : { status: { not: 'ARCHIVED' } }),
    ...(f.channelId ? { OR: [{ channels: { none: {} } }, { channels: { some: { channelId: f.channelId } } }] } : {}),
    ...(f.q ? { AND: [{ OR: [{ title: { contains: f.q, mode: 'insensitive' } }, { houseNumber: { contains: f.q, mode: 'insensitive' } }] }] } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.contentItem.count({ where }),
    prisma.contentItem.findMany({
      where,
      orderBy: [{ [f.sort]: f.dir }, { id: 'asc' }],
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
      include: { asset: { select: { id: true, originalName: true, status: true } }, channels: { select: { channelId: true } }, advertisement: { select: { campaign: { select: { id: true, name: true } } } } },
    }),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.id,
      houseNumber: r.houseNumber,
      title: r.title,
      category: r.category,
      description: r.description,
      plannedDurationMs: r.plannedDurationMs,
      originalDurationMs: r.originalDurationMs,
      isDurationEditable: r.isDurationEditable,
      status: r.status,
      approvalState: r.approvalState,
      language: r.language,
      rating: r.rating,
      rightsHolder: r.rightsHolder,
      licenseNotes: r.licenseNotes,
      maxAiringsPerDay: r.maxAiringsPerDay,
      availableFrom: r.availableFrom?.toISOString() ?? null,
      availableUntil: r.availableUntil?.toISOString() ?? null,
      allowedStartMinute: r.allowedStartMinute,
      allowedEndMinute: r.allowedEndMinute,
      asset: r.asset,
      assetId: r.assetId,
      channelIds: r.channels.map((c) => c.channelId),
      campaign: r.advertisement?.campaign ?? null,
      updatedAt: r.updatedAt.toISOString(),
    })),
    total,
    page: f.page,
    pageSize: f.pageSize,
  };
}

/** Categories that a CATEGORY_REQUIRES_APPROVAL rule marks as needing review start in PENDING. */
async function initialApprovalState(category: ContentInput['category']) {
  const rules = await prisma.scheduleRule.findMany({ where: { type: 'CATEGORY_REQUIRES_APPROVAL', isActive: true } });
  const needs = rules.some((r) => ((r.params as { categories?: string[] }).categories ?? []).includes(category));
  return needs ? 'PENDING' : 'APPROVED';
}

function contentData(input: ContentInput) {
  return {
    title: input.title,
    category: input.category,
    houseNumber: input.houseNumber ?? null,
    description: input.description ?? null,
    assetId: input.assetId ?? null,
    originalDurationMs: input.originalDurationMs ?? null,
    plannedDurationMs: input.plannedDurationMs,
    isDurationEditable: input.isDurationEditable,
    status: input.status,
    language: input.language ?? null,
    rating: input.rating ?? null,
    rightsHolder: input.rightsHolder ?? null,
    licenseNotes: input.licenseNotes ?? null,
    maxAiringsPerDay: input.maxAiringsPerDay ?? null,
    availableFrom: input.availableFrom,
    availableUntil: input.availableUntil,
    allowedStartMinute: input.allowedStartMinute ?? null,
    allowedEndMinute: input.allowedEndMinute ?? null,
  };
}

async function assertRefs(input: ContentInput) {
  if (input.assetId && !(await prisma.mediaAsset.findUnique({ where: { id: input.assetId } }))) throw new AppError('VALIDATION_ERROR', 'Selected media asset does not exist.');
  if (input.channelIds.length) {
    const n = await prisma.channel.count({ where: { id: { in: input.channelIds } } });
    if (n !== new Set(input.channelIds).size) throw new AppError('VALIDATION_ERROR', 'One or more channels do not exist.');
  }
}

export async function createContent(actor: Actor, input: ContentInput) {
  requirePermission(actor, input.category === 'ADVERTISEMENT' ? 'ads.manage' : 'content.manage');
  await assertRefs(input);
  const approvalState = await initialApprovalState(input.category);
  return prisma.$transaction(async (tx) => {
    const c = await tx.contentItem.create({
      data: { ...contentData(input), approvalState, createdById: actor.id, updatedById: actor.id, channels: { create: input.channelIds.map((channelId) => ({ channelId })) } },
    });
    await recordAudit({ actorId: actor.id, action: 'content.create', entityType: 'ContentItem', entityId: c.id, summary: `${c.category} "${c.title}"`, ip: actor.ip }, tx);
    return c;
  });
}

export async function updateContent(actor: Actor, id: string, input: ContentInput) {
  const existing = await prisma.contentItem.findUnique({ where: { id } });
  if (!existing) throw notFound('Content');
  requirePermission(actor, existing.category === 'ADVERTISEMENT' ? 'ads.manage' : 'content.manage');
  await assertRefs(input);
  return prisma.$transaction(async (tx) => {
    await tx.contentChannel.deleteMany({ where: { contentItemId: id } });
    const c = await tx.contentItem.update({
      where: { id },
      data: { ...contentData(input), updatedById: actor.id, channels: { create: input.channelIds.map((channelId) => ({ channelId })) } },
    });
    await recordAudit(
      { actorId: actor.id, action: 'content.update', entityType: 'ContentItem', entityId: id, summary: `Updated "${c.title}"`, data: { before: { plannedDurationMs: existing.plannedDurationMs, status: existing.status }, after: { plannedDurationMs: c.plannedDurationMs, status: c.status } }, ip: actor.ip },
      tx,
    );
    return c;
  });
}

export async function archiveContent(actor: Actor, id: string) {
  const existing = await prisma.contentItem.findUnique({ where: { id } });
  if (!existing) throw notFound('Content');
  requirePermission(actor, existing.category === 'ADVERTISEMENT' ? 'ads.manage' : 'content.manage');
  await prisma.$transaction(async (tx) => {
    await tx.contentItem.update({ where: { id }, data: { status: 'ARCHIVED', updatedById: actor.id } });
    await recordAudit({ actorId: actor.id, action: 'content.archive', entityType: 'ContentItem', entityId: id, summary: `Archived "${existing.title}"`, ip: actor.ip }, tx);
  });
}

export async function setContentApproval(actor: Actor, id: string, state: 'APPROVED' | 'REJECTED') {
  requirePermission(actor, 'content.approve');
  const existing = await prisma.contentItem.findUnique({ where: { id } });
  if (!existing) throw notFound('Content');
  await prisma.$transaction(async (tx) => {
    await tx.contentItem.update({ where: { id }, data: { approvalState: state, updatedById: actor.id } });
    await recordAudit({ actorId: actor.id, action: `content.${state === 'APPROVED' ? 'approve' : 'reject'}`, entityType: 'ContentItem', entityId: id, summary: `"${existing.title}" ${state.toLowerCase()}`, ip: actor.ip }, tx);
  });
}
