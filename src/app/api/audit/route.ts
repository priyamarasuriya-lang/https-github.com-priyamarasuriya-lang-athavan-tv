import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import { api, parseQuery } from '@/server/http';

const schema = z.object({
  entityType: z.string().max(60).optional(),
  entityId: z.string().max(64).optional(),
  action: z.string().max(60).optional(),
  actorId: z.string().max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const GET = api({ permission: 'audit.view' }, async ({ req }) => {
  const f = parseQuery(req, schema);
  const where: Prisma.AuditLogWhereInput = {
    ...(f.entityType ? { entityType: f.entityType } : {}),
    ...(f.entityId ? { entityId: f.entityId } : {}),
    ...(f.action ? { action: { startsWith: f.action } } : {}),
    ...(f.actorId ? { actorId: f.actorId } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize, include: { actor: { select: { name: true, email: true } } } }),
  ]);
  return { items: rows, total, page: f.page, pageSize: f.pageSize };
});
