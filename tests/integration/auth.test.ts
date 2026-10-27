import { beforeEach, describe, expect, it } from 'vitest';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { GET as me } from '@/app/api/auth/me/route';
import { GET as health } from '@/app/api/health/route';
import { GET as listUsers, POST as createUser } from '@/app/api/users/route';
import { PUT as updateUser } from '@/app/api/users/[id]/route';
import { validateSessionToken } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { call, cookieFor, PASSWORD, seedBase, type Base } from './helpers';

let b: Base;
beforeEach(async () => {
  b = await seedBase();
});

describe('authentication', () => {
  it('reports health with database status', async () => {
    const res = await health();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok', database: 'ok' });
  });

  it('signs in with valid credentials and sets a hardened session cookie', async () => {
    const r = await call(login, { method: 'POST', body: { email: 'SCHEDULER@test.local', password: PASSWORD } });
    expect(r.status).toBe(200);
    const cookie = r.res.headers.get('set-cookie')!;
    expect(cookie).toMatch(/bat_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    const token = /bat_session=([^;]+)/.exec(cookie)![1];
    const session = await prisma.session.findFirst();
    expect(session!.id).not.toBe(token); // only a keyed hash is stored
    const who = await call(me, { cookie: `bat_session=${token}` });
    expect(who.json!.data).toMatchObject({ email: 'scheduler@test.local' });
  });

  it('rejects bad credentials without revealing which part was wrong', async () => {
    const a = await call(login, { method: 'POST', body: { email: 'scheduler@test.local', password: 'wrong' } });
    const b2 = await call(login, { method: 'POST', body: { email: 'nobody@test.local', password: 'wrong' } });
    expect(a.status).toBe(401);
    expect(b2.status).toBe(401);
    expect(a.json!.error!.message).toBe(b2.json!.error!.message);
  });

  it('locks the account after repeated failures (login throttling)', async () => {
    for (let i = 0; i < 5; i++) await call(login, { method: 'POST', body: { email: 'scheduler@test.local', password: 'wrong' } });
    const r = await call(login, { method: 'POST', body: { email: 'scheduler@test.local', password: PASSWORD } });
    expect(r.status).toBe(429);
    expect(await prisma.auditLog.count({ where: { action: 'auth.lockout' } })).toBe(1);
  });

  it('denies deactivated users', async () => {
    await prisma.user.update({ where: { id: b.users.viewer.id }, data: { isActive: false } });
    const r = await call(login, { method: 'POST', body: { email: 'viewer@test.local', password: PASSWORD } });
    expect(r.status).toBe(401);
  });

  it('rejects expired sessions and deletes them', async () => {
    const cookie = await cookieFor(b.users.scheduler.id);
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await validateSessionToken(cookie.split('=')[1])).toBeNull();
    expect(await prisma.session.count()).toBe(0);
    const r = await call(me, { cookie });
    expect(r.status).toBe(401);
    expect(r.json!.error!.code).toBe('UNAUTHENTICATED');
  });

  it('logout invalidates the session server-side', async () => {
    const cookie = await cookieFor(b.users.scheduler.id);
    await call(logout, { method: 'POST', cookie });
    expect((await call(me, { cookie })).status).toBe(401);
  });

  it('rejects unauthenticated API calls', async () => {
    expect((await call(listUsers)).status).toBe(401);
  });

  it('blocks cross-site state-changing requests (CSRF)', async () => {
    const cookie = await cookieFor(b.users.admin.id);
    const evil = await call(createUser, { method: 'POST', cookie, origin: 'https://evil.example', body: { email: 'x@y.z', name: 'x', password: 'Aa1aaaaaaaaaaa', roleKeys: ['SCHEDULER'] } });
    expect(evil.status).toBe(403);
    const none = await call(createUser, { method: 'POST', cookie, origin: null, body: {} });
    expect(none.status).toBe(403);
  });
});

describe('user administration', () => {
  it('enforces password policy and role escalation limits', async () => {
    const cookie = await cookieFor(b.users.admin.id);
    const weak = await call(createUser, { method: 'POST', cookie, body: { email: 'new@test.local', name: 'New', password: 'short', roleKeys: ['SCHEDULER'] } });
    expect(weak.status).toBe(400);
    const escalate = await call(createUser, { method: 'POST', cookie, body: { email: 'new@test.local', name: 'New', password: 'LongEnough123', roleKeys: ['SUPER_ADMIN'] } });
    expect(escalate.status).toBe(403);
    const ok = await call(createUser, { method: 'POST', cookie, body: { email: 'new@test.local', name: 'New', password: 'LongEnough123', roleKeys: ['SCHEDULER'] } });
    expect(ok.status).toBe(200);
  });

  it('revokes sessions immediately when a user is deactivated or roles change', async () => {
    const target = await cookieFor(b.users.scheduler.id);
    const admin = await cookieFor(b.users.admin.id);
    expect((await call(me, { cookie: target })).status).toBe(200);
    const r = await call(updateUser, { method: 'PUT', cookie: admin, params: { id: b.users.scheduler.id }, body: { isActive: false } });
    expect(r.status).toBe(200);
    expect((await call(me, { cookie: target })).status).toBe(401);
    expect(await prisma.auditLog.count({ where: { action: 'user.update', entityId: b.users.scheduler.id } })).toBe(1);
  });

  it('prevents non-admins from managing users', async () => {
    const cookie = await cookieFor(b.users.scheduler.id);
    expect((await call(listUsers, { cookie })).status).toBe(403);
  });
});
