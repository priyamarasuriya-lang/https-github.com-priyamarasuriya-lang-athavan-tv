import { beforeEach, describe, expect, it } from 'vitest';
import { POST as login } from '@/app/api/auth/login/route';
import { GET as me } from '@/app/api/auth/me/route';
import { PERMISSIONS, ROLES } from '@/server/auth/permissions';
import { prisma } from '@/server/db';
import { bootstrapSuperAdmin, bootstrapSuperAdminFromEnv } from '@/server/services/bootstrap-admin';
import { call, resetDb } from './helpers';

const EMAIL = 'Owner@Example.com';
const FIRST = 'Bootstrap!Pass1';
const SECOND = 'Bootstrap!Pass2';

// Mirrors a fresh hosted database: no users, roles or permissions.
beforeEach(async () => {
  await resetDb();
});

describe('Super Administrator bootstrap (scripts/create-admin.ts)', () => {
  it('creates roles, permissions and a Super Administrator on an empty database who can sign in', async () => {
    const r = await bootstrapSuperAdmin({ email: EMAIL, name: 'Owner', password: FIRST });
    expect(r).toMatchObject({ email: 'owner@example.com', created: true });
    expect(await prisma.permission.count()).toBe(Object.keys(PERMISSIONS).length);
    expect(await prisma.role.count()).toBe(Object.keys(ROLES).length);

    const res = await call(login, { method: 'POST', body: { email: 'owner@example.com', password: FIRST } });
    expect(res.status).toBe(200);
    const cookie = res.res.headers.get('set-cookie')!.split(';')[0];
    const who = await call(me, { cookie });
    expect((who.json?.data as { roles: string[] }).roles).toContain('SUPER_ADMIN');
    expect(await prisma.auditLog.count({ where: { action: 'user.create', entityId: r.id } })).toBe(1);
  });

  it('refuses an existing email unless reset, and reset replaces the password and unlocks', async () => {
    const { id } = await bootstrapSuperAdmin({ email: EMAIL, name: 'Owner', password: FIRST });
    await expect(bootstrapSuperAdmin({ email: EMAIL, password: SECOND })).rejects.toThrow(/already exists/);

    await prisma.user.update({ where: { id }, data: { isActive: false, lockedUntil: new Date(Date.now() + 3_600_000) } });
    await bootstrapSuperAdmin({ email: EMAIL, password: SECOND, reset: true });

    expect((await call(login, { method: 'POST', body: { email: EMAIL, password: FIRST } })).status).toBe(401);
    expect((await call(login, { method: 'POST', body: { email: EMAIL, password: SECOND } })).status).toBe(200);
  });

  it('is safe to run when roles already exist and enforces the password policy', async () => {
    await bootstrapSuperAdmin({ email: 'a@example.com', name: 'A', password: FIRST });
    await bootstrapSuperAdmin({ email: 'b@example.com', name: 'B', password: FIRST });
    expect(await prisma.role.count()).toBe(Object.keys(ROLES).length);
    await expect(bootstrapSuperAdmin({ email: 'c@example.com', name: 'C', password: 'short' })).rejects.toThrow(/at least 12/);
    await expect(bootstrapSuperAdmin({ email: 'd@example.com', password: FIRST })).rejects.toThrow(/name is required/);
  });
});

describe('Super Administrator bootstrap on deploy (ADMIN_EMAIL / ADMIN_PASSWORD)', () => {
  it('skips without both variables, creates the first admin, then never touches accounts again', async () => {
    expect(await bootstrapSuperAdminFromEnv({ ADMIN_EMAIL: EMAIL })).toMatch(/skipping/);
    expect(await prisma.user.count()).toBe(0);

    expect(await bootstrapSuperAdminFromEnv({ ADMIN_EMAIL: EMAIL, ADMIN_PASSWORD: FIRST })).toMatch(/owner@example.com is a Super Administrator/);
    expect((await call(login, { method: 'POST', body: { email: EMAIL, password: FIRST } })).status).toBe(200);

    // A later deploy with a different password changes nothing.
    expect(await bootstrapSuperAdminFromEnv({ ADMIN_EMAIL: EMAIL, ADMIN_PASSWORD: SECOND })).toMatch(/already exists/);
    expect((await call(login, { method: 'POST', body: { email: EMAIL, password: SECOND } })).status).toBe(401);
  });

  it('rejects a weak password without creating anyone', async () => {
    await expect(bootstrapSuperAdminFromEnv({ ADMIN_EMAIL: EMAIL, ADMIN_PASSWORD: 'short' })).rejects.toThrow(/at least 12/);
    expect(await prisma.user.count()).toBe(0);
  });
});
