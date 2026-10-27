import { prisma } from '@/server/db';
import { AppError } from '@/server/errors';
import { recordAudit } from '@/server/services/audit';
import { getSetting } from '@/server/services/settings';
import { dummyHash, verifyPassword } from './password';
import { createSession } from './session';

/**
 * Credential login with throttling:
 *  - per account: after N failures within the window the account is locked for M minutes;
 *  - per IP: a higher ceiling across all accounts to slow credential stuffing.
 * Error messages never reveal whether the email exists.
 */
export async function login(emailRaw: string, password: string, meta: { ip: string | null; userAgent: string | null }) {
  const email = emailRaw.trim().toLowerCase();
  const maxAttempts = await getSetting('loginMaxAttempts');
  const lockMinutes = await getSetting('loginLockMinutes');
  const since = new Date(Date.now() - lockMinutes * 60_000);

  if (meta.ip) {
    const ipFailures = await prisma.loginAttempt.count({ where: { ip: meta.ip, success: false, createdAt: { gte: since } } });
    if (ipFailures >= maxAttempts * 5) throw new AppError('RATE_LIMITED', 'Too many failed sign-in attempts from this address. Try again later.');
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const fail = async (reason: string) => {
    await prisma.loginAttempt.create({ data: { email, ip: meta.ip, success: false } });
    if (user) {
      const recent = await prisma.loginAttempt.count({ where: { email, success: false, createdAt: { gte: since } } });
      if (recent >= maxAttempts) {
        await prisma.user.update({ where: { id: user.id }, data: { lockedUntil: new Date(Date.now() + lockMinutes * 60_000) } });
        await recordAudit({ actorId: user.id, action: 'auth.lockout', entityType: 'User', entityId: user.id, summary: `Account locked after ${recent} failed attempts`, ip: meta.ip });
      }
    }
    throw new AppError('UNAUTHENTICATED', reason);
  };

  if (!user) {
    await verifyPassword(await dummyHash(), password); // equalise timing
    return fail('Invalid email or password.');
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    throw new AppError('RATE_LIMITED', 'This account is temporarily locked after repeated failed sign-ins. Try again later or contact an administrator.');
  }
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) return fail('Invalid email or password.');
  if (!user.isActive) return fail('Invalid email or password.');

  await prisma.$transaction([
    prisma.loginAttempt.create({ data: { email, ip: meta.ip, success: true } }),
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), lockedUntil: null } }),
  ]);
  const session = await createSession(user.id, meta);
  await recordAudit({ actorId: user.id, action: 'auth.login', entityType: 'User', entityId: user.id, ip: meta.ip });
  return { user, ...session };
}
