import { requirePermission, type Actor } from '@/server/auth/actor';
import { prisma } from '@/server/db';
import { env } from '@/server/env';
import { AppError } from '@/server/errors';
import { ALLOWED_MEDIA, storage } from '@/server/storage';
import { recordAudit } from './audit';

export async function uploadMedia(actor: Actor, file: File, durationMs: number | null) {
  requirePermission(actor, 'media.upload');
  const maxBytes = env().MAX_UPLOAD_MB * 1024 * 1024;
  if (file.size === 0) throw new AppError('VALIDATION_ERROR', 'The file is empty.');
  if (file.size > maxBytes) throw new AppError('PAYLOAD_TOO_LARGE', `Files may be at most ${env().MAX_UPLOAD_MB} MB.`);
  const type = ALLOWED_MEDIA[file.type];
  if (!type) throw new AppError('UNSUPPORTED_MEDIA_TYPE', `File type "${file.type || 'unknown'}" is not allowed. Allowed: ${Object.keys(ALLOWED_MEDIA).join(', ')}.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!type.magic(bytes)) throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'The file contents do not match its declared type.');

  const { key, sha256 } = await storage().put(bytes, type.ext);
  try {
    return await prisma.$transaction(async (tx) => {
      const asset = await tx.mediaAsset.create({
        data: { originalName: file.name.slice(0, 255), storageKey: key, mimeType: file.type, sizeBytes: file.size, checksumSha256: sha256, durationMs, uploadedById: actor.id },
      });
      await recordAudit({ actorId: actor.id, action: 'media.upload', entityType: 'MediaAsset', entityId: asset.id, summary: `${asset.originalName} (${file.type}, ${file.size} bytes)`, ip: actor.ip }, tx);
      return asset;
    });
  } catch (e) {
    await storage().remove(key); // do not leave orphaned bytes when the metadata write fails
    throw e;
  }
}

export async function listMedia(actor: Actor, page = 1, pageSize = 50, q?: string) {
  if (!actor.permissions.has('content.view')) requirePermission(actor, 'ads.view');
  const where = q ? { originalName: { contains: q, mode: 'insensitive' as const } } : {};
  const [total, rows] = await Promise.all([
    prisma.mediaAsset.count({ where }),
    prisma.mediaAsset.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, include: { _count: { select: { contentItems: true } } } }),
  ]);
  return { items: rows, total, page, pageSize };
}

/** Re-check that every AVAILABLE asset's bytes still exist; mark missing ones (surfaced as MISSING_ASSET conflicts). */
export async function verifyMediaStorage(actor: Actor) {
  requirePermission(actor, 'media.upload');
  const rows = await prisma.mediaAsset.findMany({ select: { id: true, storageKey: true, status: true } });
  let missing = 0;
  for (const r of rows) {
    const ok = await storage().exists(r.storageKey);
    const status = ok ? 'AVAILABLE' : 'MISSING';
    if (!ok) missing++;
    if (status !== r.status) await prisma.mediaAsset.update({ where: { id: r.id }, data: { status } });
  }
  await recordAudit({ actorId: actor.id, action: 'media.verify', entityType: 'MediaAsset', entityId: '*', summary: `${rows.length} checked, ${missing} missing`, ip: actor.ip });
  return { checked: rows.length, missing };
}
