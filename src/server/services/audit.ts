import type { Prisma } from '@prisma/client';
import { prisma, type Tx } from '@/server/db';

export interface AuditEntry {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  summary?: string;
  data?: Prisma.InputJsonValue;
  ip?: string | null;
}

/** Append an audit record. Pass the transaction client so the entry commits atomically with the change. */
export async function recordAudit(entry: AuditEntry, tx: Tx = prisma) {
  await tx.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      summary: entry.summary ?? null,
      data: entry.data,
      ip: entry.ip ?? null,
    },
  });
}

export async function notifyUsers(
  tx: Tx,
  userIds: string[],
  n: { type: string; title: string; body?: string; link?: string },
) {
  const unique = [...new Set(userIds)];
  if (!unique.length) return;
  await tx.notification.createMany({ data: unique.map((userId) => ({ userId, type: n.type, title: n.title, body: n.body ?? null, link: n.link ?? null })) });
}

/** Users holding a permission (active accounts only). */
export async function usersWithPermission(tx: Tx, permission: string): Promise<string[]> {
  const rows = await tx.user.findMany({
    where: { isActive: true, roles: { some: { role: { permissions: { some: { permission: { key: permission } } } } } } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}
