import { NextRequest } from 'next/server';
import type { Actor } from '@/server/auth/actor';
import { hashPassword } from '@/server/auth/password';
import { PERMISSIONS, ROLES } from '@/server/auth/permissions';
import { createSession } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { clearSettingsCache } from '@/server/services/settings';
import type { ItemInput } from '@/server/validators/schedule';

export const ORIGIN = 'http://localhost:3000';
export const PASSWORD = 'Integration!Test1';
export const MIN = 60_000;

/** Wipe every table except the migration history. */
export async function resetDb() {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  clearSettingsCache();
}

export async function seedBase() {
  await resetDb();
  for (const [key, description] of Object.entries(PERMISSIONS)) await prisma.permission.create({ data: { key, description } });
  const perms = new Map((await prisma.permission.findMany()).map((p) => [p.key, p.id]));
  for (const [key, def] of Object.entries(ROLES)) {
    await prisma.role.create({ data: { key, name: def.name, isSystem: true, permissions: { create: def.permissions.map((p) => ({ permissionId: perms.get(p)! })) } } });
  }
  const roles = new Map((await prisma.role.findMany()).map((r) => [r.key, r.id]));
  const hash = await hashPassword(PASSWORD);
  const mk = (email: string, role: string) => prisma.user.create({ data: { email, name: email.split('@')[0], passwordHash: hash, roles: { create: [{ roleId: roles.get(role)! }] } } });
  const users = {
    scheduler: await mk('scheduler@test.local', 'SCHEDULER'),
    scheduler2: await mk('scheduler2@test.local', 'SCHEDULER'),
    approver: await mk('approver@test.local', 'APPROVER'),
    chief: await mk('chief@test.local', 'CHIEF_SCHEDULER'),
    viewer: await mk('viewer@test.local', 'REPORTS_VIEWER'),
    content: await mk('content@test.local', 'CONTENT_MANAGER'),
    admin: await mk('admin@test.local', 'ADMIN'),
    superAdmin: await mk('super@test.local', 'SUPER_ADMIN'),
  };
  const channel = await prisma.channel.create({ data: { code: 'TST', name: 'Test Channel', timeZone: 'Asia/Colombo', broadcastDayStartMinute: 360 } });
  const asset = await prisma.mediaAsset.create({ data: { originalName: 'x.mp4', storageKey: '00000000-0000-0000-0000-000000000000.mp4', mimeType: 'video/mp4', sizeBytes: 1, checksumSha256: 'x' } });
  const c = (title: string, ms: number, extra: Record<string, unknown> = {}) =>
    prisma.contentItem.create({ data: { title, category: 'PROGRAM', plannedDurationMs: ms, assetId: asset.id, ...extra } });
  const content = {
    show: await c('Twelve Hour Show', 12 * 60 * MIN),
    show2: await c('Eleven Hour Show', 11 * 60 * MIN),
    hour: await c('One Hour', 60 * MIN),
    filler: await c('Filler 57', 57 * MIN, { category: 'FILLER' }),
    news: await c('News 30', 30 * MIN, { category: 'NEWS' }),
  };
  const advertiser = await prisma.advertiser.create({ data: { name: 'Acme' } });
  const campaign = await prisma.advertisingCampaign.create({
    data: { name: 'Acme Launch', advertiserId: advertiser.id, startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31'), status: 'ACTIVE', approvalState: 'APPROVED', dailyLimit: 3, maxAirings: 4 },
  });
  const adContent = await c('Acme 30s', 30_000, { category: 'ADVERTISEMENT', isDurationEditable: false });
  await prisma.advertisement.create({ data: { campaignId: campaign.id, contentItemId: adContent.id } });
  const brk = await prisma.commercialBreak.create({ data: { name: 'Std', defaultDurationMs: 60_000, minDurationMs: 30_000, maxDurationMs: 120_000 } });
  return { users, channel, content, campaign, adContent, brk };
}
export type Base = Awaited<ReturnType<typeof seedBase>>;

export async function actorFor(userId: string): Promise<Actor> {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } });
  return { id: u.id, name: u.name, email: u.email, roles: u.roles.map((r) => r.role.key), permissions: new Set(u.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.key))), ip: '127.0.0.1' };
}

/**
 * A day with no blocking errors: 12h + 11h + 57m filler + a 1-minute break holding `ads` 30-second spots
 * + a filler that tops the day up to exactly 24h.
 */
export function fullDayItems(b: Base, ads = 2): ItemInput[] {
  return [
    { kind: 'CONTENT', contentItemId: b.content.show.id, timingMode: 'SEQUENTIAL' },
    { kind: 'CONTENT', contentItemId: b.content.show2.id, timingMode: 'SEQUENTIAL' },
    { kind: 'CONTENT', contentItemId: b.content.filler.id, timingMode: 'SEQUENTIAL' },
    {
      kind: 'BREAK',
      commercialBreakId: b.brk.id,
      timingMode: 'SEQUENTIAL',
      plannedDurationMs: 60_000,
      children: Array.from({ length: ads }, () => ({ kind: 'CONTENT' as const, contentItemId: b.adContent.id, timingMode: 'SEQUENTIAL' as const })),
    },
    { kind: 'CONTENT', contentItemId: b.content.filler.id, timingMode: 'SEQUENTIAL', plannedDurationMs: 2 * MIN },
  ];
}

export async function cookieFor(userId: string) {
  const { token } = await createSession(userId, { ip: '127.0.0.1', userAgent: 'vitest' });
  return `bat_session=${token}`;
}

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

export async function call(handler: unknown, opts: { method?: string; path?: string; cookie?: string; body?: unknown; params?: Record<string, string>; origin?: string | null } = {}) {
  const headers = new Headers({ 'content-type': 'application/json', 'user-agent': 'vitest' });
  if (opts.cookie) headers.set('cookie', opts.cookie);
  if (opts.origin !== null) headers.set('origin', opts.origin ?? ORIGIN);
  const req = new NextRequest(`${ORIGIN}${opts.path ?? '/api/test'}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const res = await (handler as Handler)(req, { params: Promise.resolve(opts.params ?? {}) });
  const isJson = res.headers.get('content-type')?.includes('json');
  return { status: res.status, json: isJson ? ((await res.json()) as { data?: unknown; error?: { code: string; message: string; details?: unknown } }) : null, res };
}
