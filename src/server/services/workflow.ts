import type { Prisma } from '@/generated/prisma/client';
import type { Actor } from '@/server/auth/actor';
import { prisma, type Tx } from '@/server/db';
import { AppError } from '@/server/errors';
import { dateToIso } from '@/lib/time/zoned';
import { inputsToSpecs } from '@/server/scheduling/context';
import { decideTransition, TRANSITIONS, type WorkflowAction } from '@/server/workflow/transitions';
import { notifyUsers, recordAudit, usersWithPermission } from './audit';
import { claimForWrite, getScheduleOrThrow, getScheduleView, loadSpecs, runValidation, specsToInputs } from './schedules';
import { getSetting } from './settings';

/**
 * Execute a workflow transition atomically: authorisation, validation, state change, approval records,
 * ad-airing materialisation, notifications and audit all commit together or not at all.
 */
export async function transitionSchedule(actor: Actor, id: string, action: WorkflowAction, body: { lockVersion: number; reason?: string; note?: string }) {
  const enforceSoD = await getSetting('enforceSeparationOfDuties');
  await prisma.$transaction(
    async (tx) => {
      const schedule = await getScheduleOrThrow(tx, id);
      if (schedule.lockVersion !== body.lockVersion && !(action === 'publish' && schedule.status === 'PUBLISHED')) {
        throw new AppError('STALE_VERSION', 'This schedule changed since you loaded it. Reload and try again.', { currentLockVersion: schedule.lockVersion });
      }
      const pending = await tx.approvalRequest.findFirst({ where: { scheduleId: id, status: 'PENDING' }, orderBy: { submittedAt: 'desc' } });
      const version = await tx.scheduleVersion.findUniqueOrThrow({ where: { scheduleId_versionNo: { scheduleId: id, versionNo: schedule.currentVersionNo } } });
      const { specs } = await loadSpecs(tx, version.id);

      const def = TRANSITIONS[action];
      let errorCount = 0;
      let conflicts: unknown[] = [];
      if (def.requiresValidSchedule && !(action === 'publish' && schedule.status === 'PUBLISHED')) {
        const { result } = await runValidation(tx, schedule, specs, action);
        errorCount = result.errorCount;
        conflicts = result.conflicts.filter((c) => c.severity === 'ERROR');
      }

      const decision = decideTransition({
        action,
        status: schedule.status,
        actorId: actor.id,
        permissions: actor.permissions,
        submittedById: pending?.submittedById ?? null,
        enforceSeparationOfDuties: enforceSoD,
        validationErrors: errorCount,
        reason: body.reason,
      });
      if (!decision.allowed) {
        const map = {
          FORBIDDEN: 'FORBIDDEN',
          INVALID_TRANSITION: 'INVALID_TRANSITION',
          VALIDATION_FAILED: 'SCHEDULE_HAS_CONFLICTS',
          REASON_REQUIRED: 'REASON_REQUIRED',
          SEPARATION_OF_DUTIES: 'SEPARATION_OF_DUTIES',
        } as const;
        throw new AppError(map[decision.code], decision.message, decision.code === 'VALIDATION_FAILED' ? { conflicts } : undefined);
      }
      if (decision.idempotent) return; // already published — retry-safe no-op

      await claimForWrite(tx, id, body.lockVersion, def.from, actor.id);
      const now = new Date();
      const label = `${schedule.channel.code} ${dateToIso(schedule.broadcastDate)}`;
      const link = `/schedules/${id}`;
      let summary = `${action} → ${decision.to}`;

      switch (action) {
        case 'submit': {
          await tx.approvalRequest.create({ data: { scheduleId: id, versionNo: schedule.currentVersionNo, submittedById: actor.id, note: body.note ?? null } });
          await tx.broadcastSchedule.update({ where: { id }, data: { status: 'SUBMITTED', submittedAt: now } });
          const approvers = (await usersWithPermission(tx, 'schedule.approve')).filter((u) => u !== actor.id);
          await notifyUsers(tx, approvers, { type: 'approval.requested', title: `Schedule ${label} awaits approval`, body: `Submitted by ${actor.name}`, link });
          summary = `Submitted revision ${schedule.currentVersionNo} for approval`;
          break;
        }
        case 'withdraw': {
          if (pending) await tx.approvalRequest.update({ where: { id: pending.id }, data: { status: 'WITHDRAWN' } });
          await tx.broadcastSchedule.update({ where: { id }, data: { status: 'DRAFT', submittedAt: null } });
          summary = 'Withdrew submission';
          break;
        }
        case 'approve':
        case 'reject': {
          if (!pending) throw new AppError('INVALID_TRANSITION', 'There is no pending approval request.');
          const approved = action === 'approve';
          await tx.approvalRequest.update({ where: { id: pending.id }, data: { status: approved ? 'APPROVED' : 'REJECTED' } });
          await tx.approvalDecision.create({ data: { requestId: pending.id, decidedById: actor.id, decision: approved ? 'APPROVED' : 'REJECTED', reason: body.reason ?? null } });
          await tx.broadcastSchedule.update({
            where: { id },
            data: approved ? { status: 'APPROVED', approvedById: actor.id, approvedAt: now } : { status: 'DRAFT', submittedAt: null },
          });
          if (approved) await tx.scheduleVersion.update({ where: { id: version.id }, data: { frozenAt: now } });
          await notifyUsers(tx, [pending.submittedById], {
            type: approved ? 'approval.approved' : 'approval.rejected',
            title: `Schedule ${label} was ${approved ? 'approved' : 'rejected'}`,
            body: approved ? `Approved by ${actor.name}` : `Rejected by ${actor.name}: ${body.reason}`,
            link,
          });
          summary = approved ? `Approved revision ${schedule.currentVersionNo}` : `Rejected: ${body.reason}`;
          break;
        }
        case 'publish': {
          const count = await materialiseAirings(tx, id, schedule.channelId, specs);
          await tx.broadcastSchedule.update({ where: { id }, data: { status: 'PUBLISHED', publishedById: actor.id, publishedAt: now } });
          summary = `Published revision ${schedule.currentVersionNo} (${count} ad airings planned)`;
          break;
        }
        case 'reopen': {
          const nextNo = schedule.currentVersionNo + 1;
          const newVersion = await tx.scheduleVersion.create({ data: { scheduleId: id, versionNo: nextNo, createdById: actor.id, note: body.reason ?? null } });
          if (!version.frozenAt) await tx.scheduleVersion.update({ where: { id: version.id }, data: { frozenAt: now } });
          await tx.broadcastSchedule.update({
            where: { id },
            data: { status: 'DRAFT', currentVersionNo: nextNo, submittedAt: null, approvedAt: null, approvedById: null, publishedAt: null, publishedById: null },
          });
          // Copy items into the new revision with fresh ids, then recompute timing.
          const copy = inputsToSpecs(specsToInputs(specs, schedule.channel.timeZone), schedule.channel, dateToIso(schedule.broadcastDate));
          const fresh = await getScheduleOrThrow(tx, id);
          const { result } = await runValidation(tx, fresh, copy, 'save');
          await copyItems(tx, newVersion.id, copy, result.timeline);
          await tx.adAiring.deleteMany({ where: { scheduleId: id, status: 'PLANNED' } });
          summary = `Reopened as revision ${nextNo}: ${body.reason}`;
          break;
        }
        case 'archive': {
          await tx.broadcastSchedule.update({ where: { id }, data: { status: 'ARCHIVED', archivedAt: now } });
          await tx.adAiring.updateMany({ where: { scheduleId: id, status: 'PLANNED' }, data: { status: 'CANCELLED' } });
          summary = 'Archived';
          break;
        }
      }

      await recordAudit(
        {
          actorId: actor.id,
          action: `schedule.${action}`,
          entityType: 'BroadcastSchedule',
          entityId: id,
          summary,
          data: { from: schedule.status, to: decision.to, versionNo: schedule.currentVersionNo, reason: body.reason ?? null } as Prisma.InputJsonValue,
          ip: actor.ip,
        },
        tx,
      );
    },
    { isolationLevel: 'Serializable', timeout: 20_000 },
  );
  return getScheduleView(actor, id);
}

/** Replace this schedule's planned airings with one per advertisement spot. Idempotent per schedule. */
async function materialiseAirings(tx: Tx, scheduleId: string, channelId: string, specs: Awaited<ReturnType<typeof loadSpecs>>['specs']) {
  await tx.adAiring.deleteMany({ where: { scheduleId, status: 'PLANNED' } });
  const keys = specs.flatMap((s) => [s, ...s.children]).filter((s) => s.contentItemId).map((s) => s.key);
  if (!keys.length) return 0;
  const items = await tx.scheduleItem.findMany({
    where: { id: { in: keys }, contentItem: { advertisement: { isNot: null } } },
    include: { contentItem: { include: { advertisement: true } } },
  });
  const data = items.map((i) => ({
    campaignId: i.contentItem!.advertisement!.campaignId,
    advertisementId: i.contentItem!.advertisement!.id,
    scheduleId,
    scheduleItemId: i.id,
    channelId,
    plannedStartAt: i.startAt,
    plannedDurationMs: i.effectiveDurationMs,
  }));
  if (data.length) await tx.adAiring.createMany({ data });
  return data.length;
}

async function copyItems(tx: Tx, versionId: string, specs: ReturnType<typeof inputsToSpecs>, timeline: Awaited<ReturnType<typeof runValidation>>['result']['timeline']) {
  const rows: Prisma.ScheduleItemCreateManyInput[] = [];
  specs.forEach((s, i) => {
    const t = timeline.items[i];
    const base = (x: typeof s, tt: typeof t, position: number, parentId: string | null): Prisma.ScheduleItemCreateManyInput => ({
      id: x.key,
      versionId,
      parentId,
      position,
      kind: x.kind,
      contentItemId: x.contentItemId,
      commercialBreakId: x.commercialBreakId,
      label: x.label,
      timingMode: x.timingMode,
      fixedStartAt: x.fixedStartAt,
      plannedDurationMs: x.plannedDurationMs,
      estimatedDurationMs: x.estimatedDurationMs,
      gapAfterMs: x.gapAfterMs,
      isLive: x.isLive,
      startAt: tt.startAt,
      endAt: tt.endAt,
      effectiveDurationMs: tt.durationMs,
    });
    rows.push(base(s, t, i, null));
    s.children.forEach((c, j) => rows.push(base(c, t.children[j], j, s.key)));
  });
  // Parents first so the self-referencing foreign key is satisfied.
  const parents = rows.filter((r) => !r.parentId);
  const kids = rows.filter((r) => r.parentId);
  if (parents.length) await tx.scheduleItem.createMany({ data: parents });
  if (kids.length) await tx.scheduleItem.createMany({ data: kids });
}

export async function approvalQueue(actor: Actor) {
  if (!actor.permissions.has('schedule.view')) throw new AppError('FORBIDDEN', 'Not allowed.');
  const rows = await prisma.approvalRequest.findMany({
    orderBy: { submittedAt: 'desc' },
    take: 100,
    include: { schedule: { include: { channel: { select: { name: true, code: true } } } }, decisions: { orderBy: { createdAt: 'asc' } } },
  });
  const userIds = [...new Set(rows.flatMap((r) => [r.submittedById, ...r.decisions.map((d) => d.decidedById)]))];
  const users = new Map((await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const runs = await prisma.scheduleValidationRun.findMany({
    where: { scheduleId: { in: rows.map((r) => r.scheduleId) } },
    orderBy: { createdAt: 'desc' },
    distinct: ['scheduleId'],
  });
  const runBy = new Map(runs.map((r) => [r.scheduleId, r]));
  return rows.map((r) => ({
    id: r.id,
    scheduleId: r.scheduleId,
    channel: r.schedule.channel.name,
    channelCode: r.schedule.channel.code,
    broadcastDate: dateToIso(r.schedule.broadcastDate),
    versionNo: r.versionNo,
    status: r.status,
    scheduleStatus: r.schedule.status,
    submittedBy: users.get(r.submittedById) ?? 'Unknown',
    submittedAt: r.submittedAt.toISOString(),
    note: r.note,
    validation: runBy.get(r.scheduleId) ? { errors: runBy.get(r.scheduleId)!.errorCount, warnings: runBy.get(r.scheduleId)!.warningCount, at: runBy.get(r.scheduleId)!.createdAt.toISOString() } : null,
    decisions: r.decisions.map((d) => ({ decision: d.decision, by: users.get(d.decidedById) ?? 'Unknown', reason: d.reason, at: d.createdAt.toISOString() })),
  }));
}
