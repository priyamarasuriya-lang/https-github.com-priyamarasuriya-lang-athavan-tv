import type { Channel, Prisma } from '@prisma/client';
import { requirePermission, type Actor } from '@/server/auth/actor';
import { prisma, type Tx } from '@/server/db';
import { AppError, notFound } from '@/server/errors';
import { addDaysIso, broadcastDayWindow, dateToIso, isoToDbDate, parseIsoDate } from '@/lib/time/zoned';
import type { ConflictDto, Paged, ScheduleItemView, ScheduleView } from '@/lib/dto';
import { recordAudit } from './audit';
import { inputsToSpecs, instantToFixedTime, loadValidationContext, rowsToSpecs } from '@/server/scheduling/context';
import { validateSchedule } from '@/server/scheduling/validate';
import type { ScheduleItemSpec, TimedItem, ValidationResult } from '@/server/scheduling/types';
import { availableActions, isEditable } from '@/server/workflow/transitions';
import type { ItemInput } from '@/server/validators/schedule';

const scheduleInclude = { channel: true } satisfies Prisma.BroadcastScheduleInclude;
type ScheduleWithChannel = Prisma.BroadcastScheduleGetPayload<{ include: typeof scheduleInclude }>;

export async function getScheduleOrThrow(tx: Tx, id: string): Promise<ScheduleWithChannel> {
  const s = await tx.broadcastSchedule.findUnique({ where: { id }, include: scheduleInclude });
  if (!s) throw notFound('Schedule');
  return s;
}

async function currentVersion(tx: Tx, schedule: { id: string; currentVersionNo: number }) {
  const v = await tx.scheduleVersion.findUnique({ where: { scheduleId_versionNo: { scheduleId: schedule.id, versionNo: schedule.currentVersionNo } } });
  if (!v) throw new AppError('INTERNAL', 'Schedule version is missing.');
  return v;
}

export async function loadSpecs(tx: Tx, versionId: string) {
  const rows = await tx.scheduleItem.findMany({ where: { versionId }, orderBy: [{ parentId: 'asc' }, { position: 'asc' }] });
  return { rows, ...rowsToSpecs(rows) };
}

/** Run the engine against the schedule's stored items (or supplied specs) and optionally persist the run. */
export async function runValidation(
  tx: Tx,
  schedule: ScheduleWithChannel,
  specs: ScheduleItemSpec[],
  trigger: string | null,
): Promise<{ result: ValidationResult; ctx: Awaited<ReturnType<typeof loadValidationContext>> }> {
  const ctx = await loadValidationContext(tx, schedule, specs);
  const result = validateSchedule(ctx);
  if (trigger) {
    await tx.scheduleValidationRun.create({
      data: {
        scheduleId: schedule.id,
        versionNo: schedule.currentVersionNo,
        lockVersion: schedule.lockVersion,
        trigger,
        errorCount: result.errorCount,
        warningCount: result.warningCount,
        results: result.conflicts as unknown as Prisma.InputJsonValue,
      },
    });
  }
  return { result, ctx };
}

async function persistItems(tx: Tx, versionId: string, specs: ScheduleItemSpec[], timeline: ValidationResult['timeline'], notes?: Map<string, string | null>) {
  await tx.scheduleItem.deleteMany({ where: { versionId } });
  const top: Prisma.ScheduleItemCreateManyInput[] = [];
  const children: Prisma.ScheduleItemCreateManyInput[] = [];
  const row = (s: ScheduleItemSpec, t: TimedItem, position: number, parentId: string | null): Prisma.ScheduleItemCreateManyInput => ({
    id: s.key,
    versionId,
    parentId,
    position,
    kind: s.kind,
    contentItemId: s.contentItemId,
    commercialBreakId: s.commercialBreakId,
    label: s.label,
    timingMode: s.timingMode,
    fixedStartAt: s.fixedStartAt,
    plannedDurationMs: s.plannedDurationMs,
    estimatedDurationMs: s.estimatedDurationMs,
    gapAfterMs: s.gapAfterMs,
    isLive: s.isLive,
    notes: notes?.get(s.key) ?? null,
    startAt: t.startAt,
    endAt: t.endAt,
    effectiveDurationMs: t.durationMs,
  });
  specs.forEach((s, i) => {
    const t = timeline.items[i];
    top.push(row(s, t, i, null));
    s.children.forEach((c, j) => children.push(row(c, t.children[j], j, s.key)));
  });
  if (top.length) await tx.scheduleItem.createMany({ data: top });
  if (children.length) await tx.scheduleItem.createMany({ data: children });
}

/**
 * Claim the schedule for a write: bumps lockVersion only if the caller saw the latest version
 * and the schedule is in an allowed status. Distinguishes stale, locked and missing cases.
 */
export async function claimForWrite(tx: Tx, id: string, expectedLockVersion: number, allowed: Array<ScheduleWithChannel['status']>, actorId: string) {
  const res = await tx.broadcastSchedule.updateMany({
    where: { id, lockVersion: expectedLockVersion, status: { in: allowed } },
    data: { lockVersion: { increment: 1 }, updatedById: actorId },
  });
  if (res.count === 1) return getScheduleOrThrow(tx, id);
  const current = await tx.broadcastSchedule.findUnique({ where: { id } });
  if (!current) throw notFound('Schedule');
  if (current.lockVersion !== expectedLockVersion) {
    throw new AppError('STALE_VERSION', 'This schedule was changed by someone else since you opened it. Reload to see the latest version.', {
      currentLockVersion: current.lockVersion,
    });
  }
  throw new AppError('LOCKED', `This schedule is ${current.status.toLowerCase()} and locked against changes.`, { status: current.status });
}

// ───────────────────────────── Queries ─────────────────────────────

export async function listSchedules(
  actor: Actor,
  f: { channelId?: string; status?: ScheduleView['status']; from?: string; to?: string; page: number; pageSize: number },
) {
  requirePermission(actor, 'schedule.view');
  const where: Prisma.BroadcastScheduleWhereInput = {
    ...(f.channelId ? { channelId: f.channelId } : {}),
    ...(f.status ? { status: f.status } : { status: { not: 'ARCHIVED' } }),
    ...(f.from || f.to ? { broadcastDate: { ...(f.from ? { gte: isoToDbDate(f.from) } : {}), ...(f.to ? { lte: isoToDbDate(f.to) } : {}) } } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.broadcastSchedule.count({ where }),
    prisma.broadcastSchedule.findMany({
      where,
      include: { channel: { select: { id: true, name: true, code: true } } },
      orderBy: [{ broadcastDate: 'desc' }, { channelId: 'asc' }],
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
    }),
  ]);
  const ids = rows.map((r) => r.id);
  const lastRuns = ids.length
    ? await prisma.scheduleValidationRun.findMany({ where: { scheduleId: { in: ids } }, orderBy: { createdAt: 'desc' }, distinct: ['scheduleId'], select: { scheduleId: true, errorCount: true, warningCount: true } })
    : [];
  const runBy = new Map(lastRuns.map((r) => [r.scheduleId, r]));
  return {
    items: rows.map((r) => ({
      id: r.id,
      title: r.title,
      channel: r.channel,
      broadcastDate: dateToIso(r.broadcastDate),
      status: r.status,
      versionNo: r.currentVersionNo,
      updatedAt: r.updatedAt.toISOString(),
      errorCount: runBy.get(r.id)?.errorCount ?? null,
      warningCount: runBy.get(r.id)?.warningCount ?? null,
    })),
    total,
    page: f.page,
    pageSize: f.pageSize,
  } satisfies Paged<unknown>;
}

export async function getScheduleView(actor: Actor, id: string, versionNo?: number): Promise<ScheduleView> {
  requirePermission(actor, 'schedule.view');
  const schedule = await getScheduleOrThrow(prisma, id);
  const vNo = versionNo ?? schedule.currentVersionNo;
  const version = await prisma.scheduleVersion.findUnique({ where: { scheduleId_versionNo: { scheduleId: id, versionNo: vNo } } });
  if (!version) throw notFound('Schedule version');
  const { specs, notes } = await loadSpecs(prisma, version.id);
  const { result, ctx } = await runValidation(prisma, schedule, specs, null);
  return buildView(actor, schedule, specs, notes, result, ctx, vNo);
}

async function buildView(
  actor: Actor,
  schedule: ScheduleWithChannel,
  specs: ScheduleItemSpec[],
  notes: Map<string, string | null>,
  result: ValidationResult,
  ctx: Awaited<ReturnType<typeof loadValidationContext>>,
  viewVersionNo: number,
): Promise<ScheduleView> {
  const historical = viewVersionNo !== schedule.currentVersionNo;
  const zone = schedule.channel.timeZone;
  const breakNames = new Map([...ctx.breaks.values()].map((b) => [b.id, b]));
  const toView = (s: ScheduleItemSpec, t: TimedItem): ScheduleItemView => {
    const c = s.contentItemId ? ctx.contentRows.get(s.contentItemId) : undefined;
    const b = s.commercialBreakId ? breakNames.get(s.commercialBreakId) : undefined;
    return {
      id: s.key,
      kind: s.kind,
      contentItemId: s.contentItemId,
      commercialBreakId: s.commercialBreakId,
      label: s.label,
      title: s.kind === 'BREAK' ? (s.label ?? b?.name ?? 'Commercial break') : (c?.title ?? s.label ?? 'Missing content'),
      category: s.kind === 'BREAK' ? 'BREAK' : (c?.category ?? 'PROGRAM'),
      houseNumber: c?.houseNumber ?? null,
      rating: c?.rating ?? null,
      timingMode: s.timingMode,
      fixedTime: s.fixedStartAt ? instantToFixedTime(s.fixedStartAt, zone) : null,
      plannedDurationMs: s.plannedDurationMs,
      estimatedDurationMs: s.estimatedDurationMs,
      gapAfterMs: s.gapAfterMs,
      isLive: s.isLive,
      notes: notes.get(s.key) ?? null,
      isDurationEditable: s.kind === 'BREAK' ? true : (c?.isDurationEditable ?? true),
      defaultDurationMs: s.kind === 'BREAK' ? (b?.defaultDurationMs ?? 0) : (c?.plannedDurationMs ?? 0),
      startAt: t.startAt.toISOString(),
      endAt: t.endAt.toISOString(),
      durationMs: t.durationMs,
      children: s.children.map((ch, j) => toView(ch, t.children[j])),
    };
  };

  const [versions, pending, audit] = await Promise.all([
    prisma.scheduleVersion.findMany({ where: { scheduleId: schedule.id }, orderBy: { versionNo: 'desc' } }),
    prisma.approvalRequest.findFirst({ where: { scheduleId: schedule.id, status: 'PENDING' }, orderBy: { submittedAt: 'desc' } }),
    prisma.auditLog.findMany({ where: { entityType: 'BroadcastSchedule', entityId: schedule.id }, orderBy: { createdAt: 'desc' }, take: 30, include: { actor: { select: { name: true } } } }),
  ]);
  const userIds = [...new Set([...versions.map((v) => v.createdById), pending?.submittedById, schedule.publishedById, schedule.approvedById].filter((x): x is string => !!x))];
  const users = new Map((await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const window = broadcastDayWindow(dateToIso(schedule.broadcastDate), zone, schedule.channel.broadcastDayStartMinute);

  return {
    id: schedule.id,
    title: schedule.title,
    status: schedule.status,
    lockVersion: schedule.lockVersion,
    versionNo: viewVersionNo,
    broadcastDate: dateToIso(schedule.broadcastDate),
    channel: {
      id: schedule.channel.id,
      code: schedule.channel.code,
      name: schedule.channel.name,
      timeZone: zone,
      dayStartMinute: schedule.channel.broadcastDayStartMinute,
      defaultGapMs: schedule.channel.defaultGapMs,
    },
    window: { start: window.start.toISOString(), end: window.end.toISOString(), lengthMs: window.lengthMs },
    endAt: result.timeline.endAt.toISOString(),
    totalAirtimeMs: result.timeline.totalAirtimeMs,
    items: specs.map((s, i) => toView(s, result.timeline.items[i])),
    conflicts: result.conflicts as ConflictDto[],
    errorCount: result.errorCount,
    warningCount: result.warningCount,
    editable: !historical && isEditable(schedule.status) && actor.permissions.has('schedule.edit'),
    actions: historical ? [] : availableActions(schedule.status, actor.permissions),
    canExport: actor.permissions.has('reports.export'),
    pendingRequest: pending
      ? { id: pending.id, submittedBy: users.get(pending.submittedById) ?? 'Unknown', submittedById: pending.submittedById, submittedAt: pending.submittedAt.toISOString(), note: pending.note }
      : null,
    history: audit.map((a) => ({ at: a.createdAt.toISOString(), action: a.action, by: a.actor?.name ?? null, summary: a.summary })),
    versions: versions.map((v) => ({ versionNo: v.versionNo, createdAt: v.createdAt.toISOString(), createdBy: users.get(v.createdById) ?? 'Unknown', note: v.note, frozen: !!v.frozenAt })),
    publishedAt: schedule.publishedAt?.toISOString() ?? null,
    publishedBy: schedule.publishedById ? (users.get(schedule.publishedById) ?? null) : null,
    approvedAt: schedule.approvedAt?.toISOString() ?? null,
    approvedBy: schedule.approvedById ? (users.get(schedule.approvedById) ?? null) : null,
    updatedAt: schedule.updatedAt.toISOString(),
  };
}

// ───────────────────────────── Commands ─────────────────────────────

/** Convert stored specs back into API inputs (used to copy schedules and build templates). */
export function specsToInputs(specs: ScheduleItemSpec[], zone: string): ItemInput[] {
  return specs.map((s) => ({
    kind: s.kind,
    contentItemId: s.contentItemId,
    commercialBreakId: s.commercialBreakId,
    label: s.label,
    timingMode: s.timingMode,
    fixedTime: s.fixedStartAt ? instantToFixedTime(s.fixedStartAt, zone) : null,
    plannedDurationMs: s.plannedDurationMs,
    estimatedDurationMs: s.estimatedDurationMs,
    gapAfterMs: s.gapAfterMs,
    isLive: s.isLive,
    children: specsToInputs(s.children, zone),
  }));
}

async function createWithItems(tx: Tx, actor: Actor, channel: Channel, broadcastDate: string, title: string | null, inputs: ItemInput[], auditSummary: string) {
  parseIsoDate(broadcastDate);
  const schedule = await tx.broadcastSchedule.create({
    data: { channelId: channel.id, broadcastDate: isoToDbDate(broadcastDate), title, createdById: actor.id, updatedById: actor.id },
    include: scheduleInclude,
  });
  const version = await tx.scheduleVersion.create({ data: { scheduleId: schedule.id, versionNo: 1, createdById: actor.id, note: 'Initial version' } });
  const specs = inputsToSpecs(inputs, channel, broadcastDate);
  const { result } = await runValidation(tx, schedule, specs, 'save');
  await persistItems(tx, version.id, specs, result.timeline);
  await recordAudit({ actorId: actor.id, action: 'schedule.create', entityType: 'BroadcastSchedule', entityId: schedule.id, summary: auditSummary, ip: actor.ip }, tx);
  return schedule;
}

export async function createSchedule(
  actor: Actor,
  input: { channelId: string; broadcastDate: string; title?: string; copyFromScheduleId?: string; templateId?: string },
) {
  requirePermission(actor, 'schedule.edit');
  return prisma.$transaction(async (tx) => {
    const channel = await tx.channel.findUnique({ where: { id: input.channelId } });
    if (!channel || !channel.isActive) throw notFound('Channel');
    const existing = await tx.broadcastSchedule.findFirst({ where: { channelId: channel.id, broadcastDate: isoToDbDate(input.broadcastDate), status: { not: 'ARCHIVED' } } });
    if (existing) throw new AppError('CONFLICT', `A schedule already exists for ${channel.name} on ${input.broadcastDate}.`, { scheduleId: existing.id });

    let inputs: ItemInput[] = [];
    let summary = `Created empty schedule for ${input.broadcastDate}`;
    if (input.copyFromScheduleId) {
      const source = await getScheduleOrThrow(tx, input.copyFromScheduleId);
      const v = await currentVersion(tx, source);
      inputs = specsToInputs((await loadSpecs(tx, v.id)).specs, source.channel.timeZone);
      summary = `Copied from ${source.channel.code} ${dateToIso(source.broadcastDate)}`;
    } else if (input.templateId) {
      const tpl = await tx.scheduleTemplate.findUnique({ where: { id: input.templateId } });
      if (!tpl) throw notFound('Template');
      inputs = tpl.items as unknown as ItemInput[];
      summary = `Created from template "${tpl.name}"`;
    }
    return createWithItems(tx, actor, channel, input.broadcastDate, input.title ?? null, inputs, summary);
  });
}

/**
 * Replace the items of a draft schedule. Times are computed here, server-side, by the engine;
 * clients never supply start/end times. Optimistic concurrency via lockVersion.
 */
export async function saveScheduleItems(actor: Actor, id: string, body: { lockVersion: number; items: ItemInput[] }) {
  requirePermission(actor, 'schedule.edit');
  await prisma.$transaction(async (tx) => {
    const schedule = await claimForWrite(tx, id, body.lockVersion, ['DRAFT'], actor.id);
    const version = await currentVersion(tx, schedule);
    if (version.frozenAt) throw new AppError('LOCKED', 'This revision is frozen.');
    const specs = inputsToSpecs(body.items, schedule.channel, dateToIso(schedule.broadcastDate));
    const notes = new Map<string, string | null>();
    const collect = (inputs: ItemInput[], specList: ScheduleItemSpec[]) => inputs.forEach((inp, i) => (notes.set(specList[i].key, inp.notes ?? null), collect(inp.children ?? [], specList[i].children)));
    collect(body.items, specs);
    const { result } = await runValidation(tx, schedule, specs, 'save');
    await persistItems(tx, version.id, specs, result.timeline, notes);
    await recordAudit(
      {
        actorId: actor.id,
        action: 'schedule.items.save',
        entityType: 'BroadcastSchedule',
        entityId: id,
        summary: `Saved ${specs.length} items (${result.errorCount} errors, ${result.warningCount} warnings)`,
        data: { lockVersion: schedule.lockVersion, versionNo: schedule.currentVersionNo },
        ip: actor.ip,
      },
      tx,
    );
  });
  return getScheduleView(actor, id);
}

/**
 * Dry run: compute timing and conflicts for unsaved items without persisting anything.
 * Lets the editor show server-authoritative times while the user is still arranging items.
 */
export async function previewSchedule(actor: Actor, id: string, items: ItemInput[]): Promise<ScheduleView> {
  requirePermission(actor, 'schedule.view');
  const schedule = await getScheduleOrThrow(prisma, id);
  const specs = inputsToSpecs(items, schedule.channel, dateToIso(schedule.broadcastDate), { useClientKeys: true });
  const notes = new Map<string, string | null>();
  const collect = (inputs: ItemInput[], list: ScheduleItemSpec[]) => inputs.forEach((inp, i) => (notes.set(list[i].key, inp.notes ?? null), collect(inp.children ?? [], list[i].children)));
  collect(items, specs);
  const { result, ctx } = await runValidation(prisma, schedule, specs, null);
  return buildView(actor, schedule, specs, notes, result, ctx, schedule.currentVersionNo);
}

export async function validateStoredSchedule(actor: Actor, id: string) {
  requirePermission(actor, 'schedule.view');
  return prisma.$transaction(async (tx) => {
    const schedule = await getScheduleOrThrow(tx, id);
    const v = await currentVersion(tx, schedule);
    const { specs } = await loadSpecs(tx, v.id);
    const { result } = await runValidation(tx, schedule, specs, 'validate');
    return { errorCount: result.errorCount, warningCount: result.warningCount, ok: result.ok, conflicts: result.conflicts };
  });
}

export async function duplicateSchedule(actor: Actor, id: string, targetDate: string, targetChannelId?: string) {
  const source = await getScheduleOrThrow(prisma, id);
  return createSchedule(actor, { channelId: targetChannelId ?? source.channelId, broadcastDate: targetDate, copyFromScheduleId: id });
}

// ───────────────────────────── Templates ─────────────────────────────

export async function saveTemplate(actor: Actor, input: { name: string; description?: string; fromScheduleId: string }) {
  requirePermission(actor, 'schedule.edit');
  const source = await getScheduleOrThrow(prisma, input.fromScheduleId);
  const v = await currentVersion(prisma, source);
  const inputs = specsToInputs((await loadSpecs(prisma, v.id)).specs, source.channel.timeZone);
  const tpl = await prisma.scheduleTemplate.create({
    data: { name: input.name, description: input.description ?? null, channelId: source.channelId, items: inputs as unknown as Prisma.InputJsonValue, createdById: actor.id },
  });
  await recordAudit({ actorId: actor.id, action: 'template.create', entityType: 'ScheduleTemplate', entityId: tpl.id, summary: `Template "${tpl.name}" from ${dateToIso(source.broadcastDate)}`, ip: actor.ip });
  return tpl;
}

export async function listTemplates(actor: Actor) {
  requirePermission(actor, 'schedule.view');
  const rows = await prisma.scheduleTemplate.findMany({ orderBy: { updatedAt: 'desc' }, include: { channel: { select: { name: true } } } });
  return rows.map((t) => ({ id: t.id, name: t.name, description: t.description, channel: t.channel?.name ?? 'Any', itemCount: (t.items as unknown[]).length, updatedAt: t.updatedAt.toISOString() }));
}

/** Recurring pattern: create a schedule from a template on each matching weekday in a date range. */
export async function applyTemplate(actor: Actor, input: { templateId: string; channelId: string; from: string; to: string; weekdays: number[] }) {
  requirePermission(actor, 'schedule.edit');
  if (input.to < input.from) throw new AppError('VALIDATION_ERROR', '"to" must be on or after "from".');
  const created: string[] = [];
  const skipped: Array<{ date: string; reason: string }> = [];
  let d = input.from;
  for (let guard = 0; d <= input.to && guard < 62; guard++, d = addDaysIso(d, 1)) {
    const { year, month, day } = parseIsoDate(d);
    const iso = ((new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7) + 1;
    if (!input.weekdays.includes(iso)) continue;
    try {
      const s = await createSchedule(actor, { channelId: input.channelId, broadcastDate: d, templateId: input.templateId });
      created.push(s.id);
    } catch (e) {
      if (e instanceof AppError && e.code === 'CONFLICT') skipped.push({ date: d, reason: 'A schedule already exists' });
      else throw e;
    }
  }
  if (d <= input.to) skipped.push({ date: d, reason: 'Range limited to 62 days per request' });
  return { created, skipped };
}
