import { AppError } from '@/server/errors';
import { api } from '@/server/http';
import { listMedia, uploadMedia } from '@/server/services/media';

export const GET = api({}, async ({ actor, req }) => {
  const p = req.nextUrl.searchParams;
  return listMedia(actor, Math.max(1, Number(p.get('page') ?? 1) || 1), Math.min(200, Number(p.get('pageSize') ?? 50) || 50), p.get('q') ?? undefined);
});

export const POST = api({ permission: 'media.upload' }, async ({ actor, req }) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) throw new AppError('BAD_REQUEST', 'Send the file as multipart field "file".');
  const dur = form?.get('durationMs');
  const durationMs = dur ? Number(dur) : null;
  if (durationMs != null && (!Number.isInteger(durationMs) || durationMs <= 0)) throw new AppError('VALIDATION_ERROR', 'durationMs must be a positive integer.');
  return uploadMedia(actor, file, durationMs);
});
