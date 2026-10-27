import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppError, forbidden } from '@/server/errors';
import type { Permission } from './permissions';
import { SESSION_COOKIE, validateSessionToken, type SessionUser } from './session';

/** The authenticated principal every service call is made on behalf of. */
export interface Actor {
  id: string;
  name: string;
  email: string;
  roles: string[];
  permissions: ReadonlySet<string>;
  ip: string | null;
}

export function toActor(user: SessionUser, ip: string | null): Actor {
  return { id: user.id, name: user.name, email: user.email, roles: user.roles, permissions: user.permissions, ip };
}

export function requirePermission(actor: Actor, permission: Permission): void {
  if (!actor.permissions.has(permission)) throw forbidden();
}

export function can(actor: Actor | null, permission: Permission): boolean {
  return !!actor?.permissions.has(permission);
}

export function clientIp(h: Headers): string | null {
  const fwd = h.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0].trim() : h.get('x-real-ip')) || null;
}

/** Current user for server components / route handlers (memoised per request). */
export const getActor = cache(async (): Promise<Actor | null> => {
  const jar = await cookies();
  const user = await validateSessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!user) return null;
  return toActor(user, clientIp(await headers()));
});

/** For pages: redirect to login when unauthenticated, render a 403 state when unauthorised. */
export async function requirePageActor(permission?: Permission): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect('/login');
  if (permission && !actor.permissions.has(permission)) throw new AppError('FORBIDDEN', 'You do not have access to this page.');
  return actor;
}
