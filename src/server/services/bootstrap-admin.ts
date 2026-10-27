import { hashPassword, passwordPolicyError } from '@/server/auth/password';
import { PERMISSIONS, ROLES } from '@/server/auth/permissions';
import { prisma } from '@/server/db';
import { recordAudit } from './audit';

/**
 * Operator bootstrap (scripts/create-admin.ts, or scripts/bootstrap-admin-env.ts during a deploy), run outside
 * the app with no signed-in actor.
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

export async function bootstrapSuperAdmin(input: { email: string; name?: string; password: string; reset?: boolean; via?: string }) {
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
        summary: `${u.email} as SUPER_ADMIN via ${input.via ?? 'scripts/create-admin.ts'}${existing ? ' (password reset)' : ''}`,
      },
      tx,
    );
    return { id: u.id, email: u.email, created: !existing };
  });
}

/**
 * Deploy-time bootstrap for hosts where nobody can open a terminal: run by the Vercel build
 * (scripts/bootstrap-admin-env.ts) and at server start (src/instrumentation.ts). Creates ADMIN_EMAIL as a
 * Super Administrator with ADMIN_PASSWORD (and optional ADMIN_NAME) when no account with that email exists.
 * An existing account is never changed, so later deploys cannot reset a password the owner has since changed.
 */
export async function bootstrapSuperAdminFromEnv(vars: Record<string, string | undefined>): Promise<string> {
  const email = vars.ADMIN_EMAIL?.trim().toLowerCase();
  const password = vars.ADMIN_PASSWORD;
  if (!email || !password) return 'ADMIN_EMAIL / ADMIN_PASSWORD not set; skipping first-admin bootstrap.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('ADMIN_EMAIL is not a valid email address.');
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) return `${email} already exists; skipping first-admin bootstrap.`;
  const user = await bootstrapSuperAdmin({ email, name: vars.ADMIN_NAME?.trim() || 'Administrator', password, via: 'ADMIN_EMAIL on deploy' });
  return `${user.email} is a Super Administrator and can sign in. Remove ADMIN_PASSWORD from the environment after the first sign-in.`;
}
