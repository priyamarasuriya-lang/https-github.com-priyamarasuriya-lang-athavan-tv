import { hashPassword, passwordPolicyError } from '@/server/auth/password';
import { PERMISSIONS, ROLES } from '@/server/auth/permissions';
import { prisma } from '@/server/db';
import { recordAudit } from './audit';

/**
 * Operator bootstrap (scripts/create-admin.ts), run outside the app with no signed-in actor.
 * Creates a Super Administrator, or with `reset` gives an existing account a new password, re-activates
 * and unlocks it, grants SUPER_ADMIN and signs out its sessions.
 */

/** Upsert every permission and system role; a hosted database starts with none. Returns SUPER_ADMIN. */
export async function ensureSystemRoles() {
  for (const [key, description] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({ where: { key }, update: {}, create: { key, description } });
  }
  const perms = new Map((await prisma.permission.findMany()).map((p) => [p.key, p.id]));
  for (const [key, def] of Object.entries(ROLES)) {
    const role = await prisma.role.upsert({
      where: { key },
      update: {},
      create: { key, name: def.name, description: def.description, isSystem: true },
    });
    await prisma.rolePermission.createMany({
      data: def.permissions.map((p) => ({ roleId: role.id, permissionId: perms.get(p)! })),
      skipDuplicates: true,
    });
  }
  return prisma.role.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' } });
}

export async function bootstrapSuperAdmin(input: { email: string; name?: string; password: string; reset?: boolean }) {
  const email = input.email.trim().toLowerCase();
  const policy = passwordPolicyError(input.password);
  if (policy) throw new Error(policy);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && !input.reset) throw new Error(`${email} already exists. Use --reset to set a new password and make it a Super Administrator.`);
  const name = input.name?.trim();
  if (!existing && !name) throw new Error('A name is required for a new account.');

  const superAdmin = await ensureSystemRoles();
  const passwordHash = await hashPassword(input.password);
  return prisma.$transaction(async (tx) => {
    const u = existing
      ? await tx.user.update({ where: { id: existing.id }, data: { passwordHash, isActive: true, lockedUntil: null } })
      : await tx.user.create({ data: { email, name: name!, passwordHash } });
    await tx.userRole.upsert({
      where: { userId_roleId: { userId: u.id, roleId: superAdmin.id } },
      update: {},
      create: { userId: u.id, roleId: superAdmin.id },
    });
    // Sessions created with the old password stop working after a reset.
    if (existing) await tx.session.deleteMany({ where: { userId: u.id } });
    await recordAudit(
      {
        actorId: null,
        action: existing ? 'user.update' : 'user.create',
        entityType: 'User',
        entityId: u.id,
        summary: `${u.email} as SUPER_ADMIN via scripts/create-admin.ts${existing ? ' (password reset)' : ''}`,
      },
      tx,
    );
    return { id: u.id, email: u.email, created: !existing };
  });
}
