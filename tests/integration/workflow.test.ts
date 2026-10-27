import { beforeEach, describe, expect, it } from 'vitest';
import { POST as transitionRoute } from '@/app/api/schedules/[id]/transition/[action]/route';
import { PUT as saveItemsRoute } from '@/app/api/schedules/[id]/items/route';
import { prisma } from '@/server/db';
import { createSchedule, getScheduleView, saveScheduleItems } from '@/server/services/schedules';
import { transitionSchedule } from '@/server/services/workflow';
import { actorFor, call, cookieFor, fullDayItems, seedBase, type Base } from './helpers';

let b: Base;
beforeEach(async () => {
  b = await seedBase();
});

async function readySchedule(date = '2026-06-01', ads = 2) {
  const scheduler = await actorFor(b.users.scheduler.id);
  const s = await createSchedule(scheduler, { channelId: b.channel.id, broadcastDate: date });
  const v0 = await getScheduleView(scheduler, s.id);
  const v = await saveScheduleItems(scheduler, s.id, { lockVersion: v0.lockVersion, items: fullDayItems(b, ads) });
  return { scheduler, v };
}

describe('approval workflow', () => {
  it('runs draft → submitted → approved → published with audit, notifications and airings', async () => {
    const { scheduler, v } = await readySchedule();
    const approver = await actorFor(b.users.approver.id);
    const s1 = await transitionSchedule(scheduler, v.id, 'submit', { lockVersion: v.lockVersion, note: 'ready' });
    expect(s1.status).toBe('SUBMITTED');
    expect(await prisma.notification.count({ where: { userId: b.users.approver.id, type: 'approval.requested' } })).toBe(1);

    const s2 = await transitionSchedule(approver, v.id, 'approve', { lockVersion: s1.lockVersion });
    expect(s2.status).toBe('APPROVED');
    expect(s2.approvedBy).toBe('approver');
    expect((await prisma.scheduleVersion.findFirstOrThrow({ where: { scheduleId: v.id } })).frozenAt).not.toBeNull();

    const s3 = await transitionSchedule(approver, v.id, 'publish', { lockVersion: s2.lockVersion });
    expect(s3.status).toBe('PUBLISHED');
    expect(s3.publishedBy).toBe('approver');
    expect(await prisma.adAiring.count({ where: { scheduleId: v.id, status: 'PLANNED' } })).toBe(2);

    const actions = (await prisma.auditLog.findMany({ where: { entityId: v.id }, orderBy: { createdAt: 'asc' } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['schedule.create', 'schedule.items.save', 'schedule.submit', 'schedule.approve', 'schedule.publish']));
  });

  it('publishing again is an idempotent no-op', async () => {
    const { scheduler, v } = await readySchedule();
    const approver = await actorFor(b.users.approver.id);
    let s = await transitionSchedule(scheduler, v.id, 'submit', { lockVersion: v.lockVersion });
    s = await transitionSchedule(approver, v.id, 'approve', { lockVersion: s.lockVersion });
    const pub = await transitionSchedule(approver, v.id, 'publish', { lockVersion: s.lockVersion });
    const again = await transitionSchedule(approver, v.id, 'publish', { lockVersion: s.lockVersion });
    expect(again.status).toBe('PUBLISHED');
    expect(again.lockVersion).toBe(pub.lockVersion);
    expect(await prisma.adAiring.count()).toBe(2);
    expect(await prisma.auditLog.count({ where: { action: 'schedule.publish' } })).toBe(1);
  });

  it('blocks submission while blocking conflicts exist and returns them', async () => {
    const scheduler = await actorFor(b.users.scheduler.id);
    const s = await createSchedule(scheduler, { channelId: b.channel.id, broadcastDate: '2026-06-01' });
    const v0 = await getScheduleView(scheduler, s.id);
    const v = await saveScheduleItems(scheduler, s.id, { lockVersion: v0.lockVersion, items: [...fullDayItems(b), { kind: 'CONTENT', contentItemId: b.content.hour.id, timingMode: 'SEQUENTIAL' }] });
    expect(v.conflicts.some((c) => c.code === 'OVERRUN')).toBe(true);
    const cookie = await cookieFor(b.users.scheduler.id);
    const r = await call(transitionRoute, { method: 'POST', cookie, params: { id: s.id, action: 'submit' }, body: { lockVersion: v.lockVersion } });
    expect(r.status).toBe(422);
    expect(r.json!.error!.code).toBe('SCHEDULE_HAS_CONFLICTS');
    expect((r.json!.error!.details as { conflicts: Array<{ code: string }> }).conflicts.map((c) => c.code)).toContain('OVERRUN');
  });

  it('enforces separation of duties: a submitter cannot approve their own schedule', async () => {
    const chief = await actorFor(b.users.superAdmin.id); // has submit + approve
    const s = await createSchedule(chief, { channelId: b.channel.id, broadcastDate: '2026-06-01' });
    const v0 = await getScheduleView(chief, s.id);
    const v = await saveScheduleItems(chief, s.id, { lockVersion: v0.lockVersion, items: fullDayItems(b) });
    const sub = await transitionSchedule(chief, s.id, 'submit', { lockVersion: v.lockVersion });
    await expect(transitionSchedule(chief, s.id, 'approve', { lockVersion: sub.lockVersion })).rejects.toMatchObject({ code: 'SEPARATION_OF_DUTIES' });
  });

  it('rejection requires a reason and returns the schedule to draft', async () => {
    const { scheduler, v } = await readySchedule();
    const approver = await actorFor(b.users.approver.id);
    const sub = await transitionSchedule(scheduler, v.id, 'submit', { lockVersion: v.lockVersion });
    await expect(transitionSchedule(approver, v.id, 'reject', { lockVersion: sub.lockVersion })).rejects.toMatchObject({ code: 'REASON_REQUIRED' });
    const rej = await transitionSchedule(approver, v.id, 'reject', { lockVersion: sub.lockVersion, reason: 'Wrong news slot' });
    expect(rej.status).toBe('DRAFT');
    const decision = await prisma.approvalDecision.findFirstOrThrow();
    expect(decision).toMatchObject({ decision: 'REJECTED', reason: 'Wrong news slot' });
    expect(await prisma.notification.count({ where: { userId: b.users.scheduler.id, type: 'approval.rejected' } })).toBe(1);
  });

  it('rejects invalid transitions and unauthorised actors over HTTP', async () => {
    const { v } = await readySchedule();
    const schedulerCookie = await cookieFor(b.users.scheduler.id);
    const viewerCookie = await cookieFor(b.users.viewer.id);
    const publishDraft = await call(transitionRoute, { method: 'POST', cookie: await cookieFor(b.users.approver.id), params: { id: v.id, action: 'publish' }, body: { lockVersion: v.lockVersion } });
    expect(publishDraft.status).toBe(409);
    expect(publishDraft.json!.error!.code).toBe('INVALID_TRANSITION');
    const approveAsScheduler = await call(transitionRoute, { method: 'POST', cookie: schedulerCookie, params: { id: v.id, action: 'approve' }, body: { lockVersion: v.lockVersion } });
    expect(approveAsScheduler.status).toBe(403);
    const editAsViewer = await call(saveItemsRoute, { method: 'PUT', cookie: viewerCookie, params: { id: v.id }, body: { lockVersion: v.lockVersion, items: [] } });
    expect(editAsViewer.status).toBe(403);
    const unknown = await call(transitionRoute, { method: 'POST', cookie: schedulerCookie, params: { id: v.id, action: 'delete-everything' }, body: { lockVersion: v.lockVersion } });
    expect(unknown.status).toBe(404);
    const stale = await call(transitionRoute, { method: 'POST', cookie: schedulerCookie, params: { id: v.id, action: 'submit' }, body: { lockVersion: v.lockVersion - 1 } });
    expect(stale.status).toBe(409);
    expect(stale.json!.error!.code).toBe('STALE_VERSION');
  });

  it('reopening a published schedule creates a new revision, keeps the old one frozen and releases airings', async () => {
    const { scheduler, v } = await readySchedule();
    const approver = await actorFor(b.users.approver.id);
    const chief = await actorFor(b.users.chief.id);
    let s = await transitionSchedule(scheduler, v.id, 'submit', { lockVersion: v.lockVersion });
    s = await transitionSchedule(approver, v.id, 'approve', { lockVersion: s.lockVersion });
    s = await transitionSchedule(approver, v.id, 'publish', { lockVersion: s.lockVersion });
    await expect(transitionSchedule(chief, v.id, 'reopen', { lockVersion: s.lockVersion })).rejects.toMatchObject({ code: 'REASON_REQUIRED' });
    const re = await transitionSchedule(chief, v.id, 'reopen', { lockVersion: s.lockVersion, reason: 'Breaking news' });
    expect(re.status).toBe('DRAFT');
    expect(re.versionNo).toBe(2);
    expect(re.items).toHaveLength(v.items.length);
    expect(re.items[0].id).not.toBe(v.items[0].id);
    expect(await prisma.adAiring.count({ where: { scheduleId: v.id } })).toBe(0);
    const old = await getScheduleView(scheduler, v.id, 1);
    expect(old.editable).toBe(false);
    expect(old.items.map((i) => i.startAt)).toEqual(v.items.map((i) => i.startAt));
  });
});

describe('advertising quotas across schedules', () => {
  it('counts airings booked by other published schedules', async () => {
    // Campaign: dailyLimit 3, maxAirings 4. Publish day 1 with 2 spots, then day 2 with 3 spots → total 5 > 4.
    const approver = await actorFor(b.users.approver.id);
    const one = await readySchedule('2026-06-01', 2);
    let s = await transitionSchedule(one.scheduler, one.v.id, 'submit', { lockVersion: one.v.lockVersion });
    s = await transitionSchedule(approver, one.v.id, 'approve', { lockVersion: s.lockVersion });
    await transitionSchedule(approver, one.v.id, 'publish', { lockVersion: s.lockVersion });

    const two = await readySchedule('2026-06-02', 3);
    expect(two.v.conflicts.find((c) => c.code === 'CAMPAIGN_TOTAL_LIMIT')).toMatchObject({ severity: 'ERROR' });
    expect(two.v.conflicts.find((c) => c.code === 'CAMPAIGN_TOTAL_LIMIT')!.message).toContain('5 airings');
    const ok = await readySchedule('2026-06-03', 2);
    expect(ok.v.conflicts.filter((c) => c.code.startsWith('CAMPAIGN'))).toEqual([]);
  });

  it('flags spots after the campaign has been paused', async () => {
    await prisma.advertisingCampaign.update({ where: { id: b.campaign.id }, data: { status: 'PAUSED' } });
    const { v } = await readySchedule();
    expect(v.conflicts.map((c) => c.code)).toContain('CAMPAIGN_INACTIVE');
  });
});
