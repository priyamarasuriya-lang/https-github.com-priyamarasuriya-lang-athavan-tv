import { bootstrapSuperAdminFromEnv } from '@/server/services/bootstrap-admin';

export async function bootstrapAdminOnStart() {
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) return;
  try {
    console.log(await bootstrapSuperAdminFromEnv(process.env));
  } catch (err) {
    // A parallel instance may have created the account first; sign-in still works either way.
    console.error(`First-admin bootstrap failed: ${err instanceof Error ? err.message : err}`);
  }
}
