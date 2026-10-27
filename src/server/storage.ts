import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { env } from '@/server/env';

/**
 * Storage abstraction for media assets. Only metadata and an opaque storage key reach the database,
 * so the scheduling engine never depends on where bytes live. "local" writes to a directory outside
 * the web root with random file names; an S3-compatible driver would implement the same interface.
 */
export interface StorageDriver {
  put(bytes: Uint8Array, ext: string): Promise<{ key: string; sha256: string }>;
  exists(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;
}

class LocalStorage implements StorageDriver {
  constructor(private readonly root: string) {}
  private resolve(key: string) {
    if (!/^[a-f0-9-]{36}\.[a-z0-9]{1,8}$/.test(key)) throw new Error('Invalid storage key');
    return path.join(this.root, key);
  }
  async put(bytes: Uint8Array, ext: string) {
    await mkdir(this.root, { recursive: true });
    const key = `${randomUUID()}.${ext}`;
    await writeFile(this.resolve(key), bytes, { flag: 'wx' });
    return { key, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
  async exists(key: string) {
    try {
      return (await stat(this.resolve(key))).isFile();
    } catch {
      return false;
    }
  }
  async remove(key: string) {
    await unlink(this.resolve(key)).catch(() => undefined);
  }
}

/**
 * Vercel Blob (for serverless hosting, where the local disk is not persistent). Blobs are stored with
 * private access under random names, so media is never publicly reachable by URL.
 * Server uploads on Vercel are limited by the platform's ~4.5 MB request body size.
 */
class VercelBlobStorage implements StorageDriver {
  private static readonly PREFIX = 'media/';
  private resolve(key: string) {
    if (!/^[a-f0-9-]{36}\.[a-z0-9]{1,8}$/.test(key)) throw new Error('Invalid storage key');
    return `${VercelBlobStorage.PREFIX}${key}`;
  }
  async put(bytes: Uint8Array, ext: string) {
    const { put } = await import('@vercel/blob');
    const key = `${randomUUID()}.${ext}`;
    await put(this.resolve(key), Buffer.from(bytes), { access: 'private', addRandomSuffix: false, allowOverwrite: false });
    return { key, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
  async exists(key: string) {
    const { head, BlobNotFoundError } = await import('@vercel/blob');
    try {
      await head(this.resolve(key));
      return true;
    } catch (e) {
      if (e instanceof BlobNotFoundError) return false;
      throw e;
    }
  }
  async remove(key: string) {
    const { del } = await import('@vercel/blob');
    await del(this.resolve(key)).catch(() => undefined);
  }
}

let driver: StorageDriver | null = null;
export function storage(): StorageDriver {
  if (driver) return driver;
  driver = env().STORAGE_DRIVER === 'vercel-blob' ? new VercelBlobStorage() : new LocalStorage(path.resolve(env().STORAGE_LOCAL_DIR));
  return driver;
}

/**
 * Allow-list of media types. The file's leading bytes must match its declared type, so a renamed
 * executable or script cannot be stored as "video".
 */
export const ALLOWED_MEDIA: Record<string, { ext: string; magic: (b: Uint8Array) => boolean }> = {
  'video/mp4': { ext: 'mp4', magic: (b) => ascii(b, 4, 4) === 'ftyp' },
  'video/quicktime': { ext: 'mov', magic: (b) => ascii(b, 4, 4) === 'ftyp' || ascii(b, 4, 4) === 'moov' },
  'application/mxf': { ext: 'mxf', magic: (b) => b[0] === 0x06 && b[1] === 0x0e && b[2] === 0x2b && b[3] === 0x34 },
  'image/png': { ext: 'png', magic: (b) => b[0] === 0x89 && ascii(b, 1, 3) === 'PNG' },
  'image/jpeg': { ext: 'jpg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'audio/mpeg': { ext: 'mp3', magic: (b) => ascii(b, 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
  'audio/wav': { ext: 'wav', magic: (b) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WAVE' },
};

function ascii(b: Uint8Array, offset: number, len: number) {
  return String.fromCharCode(...b.slice(offset, offset + len));
}
