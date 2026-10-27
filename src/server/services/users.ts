import type { z } from 'zod';
import { requirePermission, type Actor } from '@/server/auth/actor';
import { hashPassword, passwordPolicyError } from '@/server/auth/password';
import { prisma } from '@/server/db';
import { AppError, notFound } from '@/server/errors';
import type { userCreateSchema, userUpdateSchema } from '@/server/validators/catalog';
import { recordAudit } from './audit';

export async function listUsers(actor: Actor) {
  requirePermission(actor, 'users.manage');
  const rows = await prisma.user.findMany({ orderBy: { name: 'asc' }, include: { roles: { include: { role: true } } } });
  return rows.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    isActive: u.isActive,
    lockedUntil: u.lockedUntil?.toISOString() ?? null,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    roles: u.roles.map((r) => ({ key: r.role.key, name: r.role.name })),
  }));
}

export async function listRoles(actor: Actor) {
  requirePermission(actor, 'users.manage');
  return prisma.role.findMany({ orderBy: { name: 'asc' }, include: { permissions: { include: { permission: true } } } });
}

/** Only a Super Administrator may grant or hold the SUPER_ADMIN role. */
function assertCanGrant(actor: Actor, roleKeys: string[]) {
  if (roleKeys.includes('SUPER_ADMIN') && !actor.roles.includes('SUPER_ADMIN')) throw new AppError('FORBIDDEN', 'Only a Super Administrator can grant that role.');
}

async function roleIds(keys: string[]) {
  const roles = await prisma.role.findMany({ where: { key: { in: keys } } });
  if (roles.length !== new Set(keys).size) throw new AppError('VALIDATION_ERROR', 'Unknown role.');
  return roles.map((r) => r.id);
}

export async function createUser(actor: Actor, input: z.infer<typeof userCreateSchema>) {
  requirePermission(actor, 'users.manage');
  assertCanGrant(actor, input.roleKeys);
  const policy = passwordPolicyError(input.password);
  if (policy) throw new AppError('VALIDATION_ERROR', policy);
  const ids = await roleIds(input.roleKeys);
  const passwordHash = await hashPassword(input.password);
  return prisma.$transaction(async (tx) => {
    const u = await tx.user.create({ data: { email: input.email, name: input.name, passwordHash, roles: { create: ids.map((roleId) => ({ roleId })) } } });
    await recordAudit({ actorId: actor.id, action: 'user.create', entityType: 'User', entityId: u.id, summary: `${u.email} as ${input.roleKeys.join(', ')}`, ip: actor.ip }, tx);
    return { id: u.id, email: u.email, name: u.name };
  });
}

export async function updateUser(actor: Actor, id: string, input: z.infer<typeof userUpdateSchema>) {
  requirePermission(actor, 'users.manage');
  const target = await prisma.user.findUnique({ where: { id }, include: { roles: { include: { role: true } } } });
  if (!target) throw notFound('User');
  const targetIsSuper = target.roles.some((r) => r.role.key === 'SUPER_ADMIN');
  if (targetIsSuper && !actor.roles.includes('SUPER_ADMIN')) throw new AppError('FORBIDDEN', 'Only a Super Administrator can change a Super Administrator.');
  if (id === actor.id && input.isActive === false) throw new AppError('BAD_REQUEST', 'You cannot deactivate your own account.');
  if (input.roleKeys) assertCanGrant(actor, input.roleKeys);
  if (input.password) {
    const policy = passwordPolicyError(input.password);
    if (policy) throw new AppError('VALIDATION_ERROR', policy);
  }
  const ids = input.roleKeys ? await roleIds(input.roleKeys) : null;
  const passwordHash = input.password ? await hashPassword(input.password) : undefined;
  await prisma.$transaction(async (tx) => {
    if (ids) {
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({ data: ids.map((roleId) => ({ userId: id, roleId })) });
    }
    await tx.user.update({ where: { id }, data: { name: input.name, isActive: input.isActive, ...(passwordHash ? { passwordHash, lockedUntil: null } : {}) } });
    // Access changes take effect immediately: revoke existing sessions.
    if (ids || input.isActive === false || passwordHash) await tx.session.deleteMany({ where: { userId: id } });
    await recordAudit(
      {
        actorId: actor.id,
        action: 'user.update',
        entityType: 'User',
        entityId: id,
        summary: [input.roleKeys && `roles → ${input.roleKeys.join(', ')}`, input.isActive === false && 'deactivated', input.isActive === true && 'activated', passwordHash && 'password reset'].filter(Boolean).join('; ') || 'updated',
        ip: actor.ip,
      },
      tx,
    );
  });
}

export async function unlockUser(actor: Actor, id: string) {
  requirePermission(actor, 'users.manage');
  await prisma.user.update({ where: { id }, data: { lockedUntil: null } });
  await prisma.loginAttempt.deleteMany({ where: { email: (await prisma.user.findUniqueOrThrow({ where: { id } })).email, success: false } });
  await recordAudit({ actorId: actor.id, action: 'user.unlock', entityType: 'User', entityId: id, ip: actor.ip });
}
