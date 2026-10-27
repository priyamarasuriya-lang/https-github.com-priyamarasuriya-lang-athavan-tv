import { createHmac, randomBytes } from 'node:crypto';
import { prisma } from '@/server/db';
import { env } from '@/server/env';
import { getSetting } from '@/server/services/settings';

export const SESSION_COOKIE = 'bat_session';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: Set<string>;
  sessionId: string;
}

function digest(token: string): string {
  return createHmac('sha256', env().SESSION_SECRET).update(token).digest('base64url');
}

export async function createSession(userId: string, meta: { ip?: string | null; userAgent?: string | null }) {
  const token = randomBytes(32).toString('base64url');
  const ttlHours = await getSetting('sessionTtlHours');
  const expiresAt = new Date(Date.now() + ttlHours * 3600_000);
  await prisma.session.create({
    data: { id: digest(token), userId, expiresAt, ip: meta.ip ?? null, userAgent: meta.userAgent?.slice(0, 300) ?? null },
  });
  return { token, expiresAt };
}

/**
 * Validate a session token: it must exist, be unexpired and belong to an active user.
 * Sessions slide: activity in the second half of the TTL extends expiry.
 */
export async function validateSessionToken(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token || token.length > 200) return null;
  const id = digest(token);
  const session = await prisma.session.findUnique({
    where: { id },
    include: { user: { include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } } },
  });
  if (!session) return null;
  const now = Date.now();
  if (session.expiresAt.getTime() <= now || !session.user.isActive) {
    await prisma.session.delete({ where: { id } }).catch(() => undefined);
    return null;
  }
  const ttlMs = (await getSetting('sessionTtlHours')) * 3600_000;
  if (session.expiresAt.getTime() - now < ttlMs / 2) {
    await prisma.session.update({ where: { id }, data: { expiresAt: new Date(now + ttlMs), lastSeenAt: new Date(now) } });
  }
  const permissions = new Set<string>();
  for (const ur of session.user.roles) for (const rp of ur.role.permissions) permissions.add(rp.permission.key);
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    roles: session.user.roles.map((r) => r.role.key),
    permissions,
    sessionId: id,
  };
}

export async function invalidateSession(token: string) {
  await prisma.session.deleteMany({ where: { id: digest(token) } });
}

export async function invalidateUserSessions(userId: string) {
  await prisma.session.deleteMany({ where: { userId } });
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: env().APP_URL.startsWith('https://'),
    sameSite: 'lax' as const,
    path: '/',
    expires: expiresAt,
  };
}
