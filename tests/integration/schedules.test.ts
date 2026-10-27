import { beforeEach, describe, expect, it } from 'vitest';
import { POST as createRoute } from '@/app/api/schedules/route';
import { PUT as saveItemsRoute } from '@/app/api/schedules/[id]/items/route';
import { POST as previewRoute } from '@/app/api/schedules/[id]/preview/route';
import { POST as createContentRoute } from '@/app/api/content/route';
import { prisma } from '@/server/db';
import { AppError } from '@/server/errors';
import { createSchedule, getScheduleView, saveScheduleItems } from '@/server/services/schedules';
import { transitionSchedule } from '@/server/services/workflow';
import type { ScheduleView } from '@/lib/dto';
import { actorFor, call, cookieFor, fullDayItems, MIN, seedBase, type Base } from './helpers';

let b: Base;
const DATE = '2026-06-01';
beforeEach(async () => {
  b = await seedBase();
});

async function newSchedule(date = DATE) {
  const scheduler = await actorFor(b.users.scheduler.id);
  const s = await createSchedule(scheduler, { channelId: b.channel.id, broadcastDate: date });
  return { scheduler, view: await getScheduleView(scheduler, s.id) };
}

describe('schedule persistence and timing', () => {
  it('computes and stores start/end times server-side, crossing midnight', async () => {
    const { scheduler, view } = await newSchedule();
    const v = await saveScheduleItems(scheduler, view.id, { lockVersion: view.lockVersion, items: fullDayItems(b) });
    expect(v.errorCount).toBe(0);
    expect(v.items[0].startAt).toBe('2026-06-01T00:30:00.000Z'); // 06:00 Asia/Colombo
    expect(v.items[1].startAt).toBe('2026-06-01T12:30:00.000Z'); // 18:00
    expect(v.items[2].startAt).toBe('2026-06-01T23:30:00.000Z'); // 05:00 next calendar day
    expect(v.endAt).toBe('2026-06-02T00:30:00.000Z');
    expect(v.totalAirtimeMs).toBe(24 * 60 * MIN);
    const rows = await prisma.scheduleItem.findMany({ where: { parentId: null }, orderBy: { position: 'asc' } });
    expect(rows.map((r) => r.startAt.toISOString())).toEqual(v.items.map((i) => i.startAt));
    expect(rows[3].effectiveDurationMs).toBe(60_000);
    const children = await prisma.scheduleItem.findMany({ where: { parentId: rows[3].id }, orderBy: { position: 'asc' } });
    expect(children.map((c) => c.startAt.toISOString())).toEqual(['2026-06-02T00:27:00.000Z', '2026-06-02T00:27:30.000Z']);
  });

  it('recalculates downstream times after reordering', async () => {
    const { scheduler, view } = await newSchedule();
    const items = [
      { kind: 'CONTENT' as const, contentItemId: b.content.hour.id, timingMode: 'SEQUENTIAL' as const },
      { kind: 'CONTENT' as const, contentItemId: b.content.news.id, timingMode: 'SEQUENTIAL' as const },
    ];
    const v1 = await saveScheduleItems(scheduler, view.id, { lockVersion: view.lockVersion, items });
    expect(v1.items[1].startAt).toBe('2026-06-01T01:30:00.000Z');
    const v2 = await saveScheduleItems(scheduler, view.id, { lockVersion: v1.lockVersion, items: [items[1], items[0]] });
    expect(v2.items[0].title).toBe('News 30');
    expect(v2.items[1].startAt).toBe('2026-06-01T01:00:00.000Z');
  });

  it('honours fixed times and reports overlaps as blocking conflicts', async () => {
    const { scheduler, view } = await newSchedule();
    const v = await saveScheduleItems(scheduler, view.id, {
      lockVersion: view.lockVersion,
      items: [
        { kind: 'CONTENT', contentItemId: b.content.hour.id, timingMode: 'SEQUENTIAL', plannedDurationMs: 90 * MIN },
        { kind: 'CONTENT', contentItemId: b.content.news.id, timingMode: 'FIXED', fixedTime: '07:00' },
      ],
    });
    expect(v.items[1].fixedTime).toBe('07:00:00');
    expect(v.items[1].startAt).toBe('2026-06-01T01:30:00.000Z');
    const overlap = v.conflicts.find((c) => c.code === 'OVERLAP')!;
    expect(overlap.severity).toBe('ERROR');
    expect(overlap.itemKeys).toEqual([v.items[0].id, v.items[1].id]);
    // the run is persisted for the approval queue / conflict report
    expect(await prisma.scheduleValidationRun.count({ where: { scheduleId: view.id, trigger: 'save' } })).toBeGreaterThan(0);
  });

  it('previews without persisting', async () => {
    const { view } = await newSchedule();
    const cookie = await cookieFor(b.users.scheduler.id);
    const r = await call(previewRoute, { method: 'POST', cookie, params: { id: view.id }, body: { items: [{ clientKey: '11111111-1111-4111-8111-111111111111', kind: 'CONTENT', contentItemId: b.content.news.id, timingMode: 'SEQUENTIAL' }] } });
    expect(r.status).toBe(200);
    expect((r.json!.data as ScheduleView).items[0].id).toBe('11111111-1111-4111-8111-111111111111');
    expect(await prisma.scheduleItem.count()).toBe(0);
  });
});

describe('concurrency and locking', () => {
  it('rejects a save based on a stale lockVersion', async () => {
    const { scheduler, view } = await newSchedule();
    await saveScheduleItems(scheduler, view.id, { lockVersion: view.lockVersion, items: [] });
    await expect(saveScheduleItems(scheduler, view.id, { lockVersion: view.lockVersion, items: [] })).rejects.toMatchObject({ code: 'STALE_VERSION' });
  });

  it('lets exactly one of two simultaneous saves win', async () => {
    const { view } = await newSchedule();
    const a = await actorFor(b.users.scheduler.id);
    const c = await actorFor(b.users.scheduler2.id);
    const results = await Promise.allSettled([
      saveScheduleItems(a, view.id, { lockVersion: view.lockVersion, items: [{ kind: 'CONTENT', contentItemId: b.content.hour.id, timingMode: 'SEQUENTIAL' }] }),
      saveScheduleItems(c, view.id, { lockVersion: view.lockVersion, items: [{ kind: 'CONTENT', contentItemId: b.content.news.id, timingMode: 'SEQUENTIAL' }] }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(AppError);
    expect(['STALE_VERSION']).toContain((rejected.reason as AppError).code);
    expect(await prisma.scheduleItem.count()).toBe(1);
  });

  it('locks submitted/approved/published schedules against edits (423)', async () => {
    const { scheduler, view } = await newSchedule();
    const saved = await saveScheduleItems(scheduler, view.id, { lockVersion: view.lockVersion, items: fullDayItems(b) });
    const submitted = await transitionSchedule(scheduler, view.id, 'submit', { lockVersion: saved.lockVersion });
    const cookie = await cookieFor(b.users.scheduler.id);
    const r = await call(saveItemsRoute, { method: 'PUT', cookie, params: { id: view.id }, body: { lockVersion: submitted.lockVersion, items: [] } });
    expect(r.status).toBe(423);
    expect(r.json!.error!.code).toBe('LOCKED');
  });
});

describe('API validation and invariants', () => {
  it('rejects invalid durations and malformed items with 400', async () => {
    const { view } = await newSchedule();
    const cookie = await cookieFor(b.users.scheduler.id);
    const neg = await call(saveItemsRoute, { method: 'PUT', cookie, params: { id: view.id }, body: { lockVersion: view.lockVersion, items: [{ kind: 'CONTENT', contentItemId: b.content.hour.id, timingMode: 'SEQUENTIAL', plannedDurationMs: -1000 }] } });
    expect(neg.status).toBe(400);
    const noTime = await call(saveItemsRoute, { method: 'PUT', cookie, params: { id: view.id }, body: { lockVersion: view.lockVersion, items: [{ kind: 'CONTENT', contentItemId: b.content.hour.id, timingMode: 'FIXED' }] } });
    expect(noTime.status).toBe(400);
    const badJson = await call(saveItemsRoute, { method: 'PUT', cookie, params: { id: view.id }, body: 'nope' });
    expect(badJson.status).toBe(400);
  });

  it('allows one live schedule per channel and date, enforced by the database', async () => {
    await newSchedule();
    const cookie = await cookieFor(b.users.scheduler.id);
    const dup = await call(createRoute, { method: 'POST', cookie, body: { channelId: b.channel.id, broadcastDate: DATE } });
    expect(dup.status).toBe(409);
    // bypassing the service still fails at the partial unique index
    await expect(prisma.broadcastSchedule.create({ data: { channelId: b.channel.id, broadcastDate: new Date(DATE), createdById: b.users.scheduler.id } })).rejects.toMatchObject({ code: 'P2002' });
    await prisma.broadcastSchedule.updateMany({ data: { status: 'ARCHIVED' } });
    const again = await call(createRoute, { method: 'POST', cookie, body: { channelId: b.channel.id, broadcastDate: DATE } });
    expect(again.status).toBe(200);
  });

  it('enforces positive durations with a database check constraint', async () => {
    await expect(prisma.contentItem.create({ data: { title: 'bad', category: 'PROGRAM', plannedDurationMs: 0 } })).rejects.toThrow(/check constraint/i);
    const cookie = await cookieFor(b.users.content.id);
    const r = await call(createContentRoute, { method: 'POST', cookie, body: { title: 'bad', category: 'PROGRAM', plannedDurationMs: -5 } });
    expect(r.status).toBe(400);
  });

  it('copies a schedule to another date, re-resolving fixed times for that date', async () => {
    const { scheduler, view } = await newSchedule();
    await saveScheduleItems(scheduler, view.id, { lockVersion: view.lockVersion, items: [{ kind: 'CONTENT', contentItemId: b.content.news.id, timingMode: 'FIXED', fixedTime: '01:00' }] });
    const copy = await createSchedule(scheduler, { channelId: b.channel.id, broadcastDate: '2026-06-05', copyFromScheduleId: view.id });
    const v = await getScheduleView(scheduler, copy.id);
    expect(v.items[0].fixedTime).toBe('01:00:00');
    expect(v.items[0].startAt).toBe('2026-06-05T19:30:00.000Z'); // 01:00 on 6 June local
  });
});
