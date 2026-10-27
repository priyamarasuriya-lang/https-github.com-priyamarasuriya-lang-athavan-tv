import { z } from 'zod';

const onVercel = !!process.env.VERCEL;

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().url(),
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
    // On Vercel, default to the project's production domain.
    APP_URL: z
      .string()
      .url()
      .default(onVercel && process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000'),
    // Vercel's filesystem is not persistent, so Blob storage is the default there.
    STORAGE_DRIVER: z.enum(['local', 'vercel-blob']).default(onVercel ? 'vercel-blob' : 'local'),
    STORAGE_LOCAL_DIR: z.string().default('./storage/uploads'),
    BLOB_READ_WRITE_TOKEN: z.string().optional(),
    // Vercel functions accept request bodies up to ~4.5 MB.
    MAX_UPLOAD_MB: z.coerce.number().int().positive().max(2048).default(onVercel ? 4 : 50),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  })
  .refine((e) => e.STORAGE_DRIVER !== 'vercel-blob' || !!e.BLOB_READ_WRITE_TOKEN, {
    path: ['BLOB_READ_WRITE_TOKEN'],
    message: 'is required when STORAGE_DRIVER=vercel-blob (create a Blob store in Vercel and connect it to the project)',
  });

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Validated environment. Throws a readable error at first use if configuration is missing. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration — ${issues}`);
  }
  cached = parsed.data;
  return cached;
}
