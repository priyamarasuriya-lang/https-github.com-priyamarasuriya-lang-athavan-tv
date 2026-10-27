/**
 * Run by the Vercel build (vercel.json) after migrations: creates the first Super Administrator from
 * ADMIN_EMAIL / ADMIN_PASSWORD (and optional ADMIN_NAME) while none exists. Does nothing otherwise.
 * The password is read from the host's secret store and never printed.
 */
import 'dotenv/config';
import { prisma } from '../src/server/db';
import { bootstrapSuperAdminFromEnv } from '../src/server/services/bootstrap-admin';

bootstrapSuperAdminFromEnv(process.env)
  .then((message) => console.log(message))
  .catch((err: unknown) => {
    console.error(`First-admin bootstrap failed: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
