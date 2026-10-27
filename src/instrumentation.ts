/**
 * Runs once when a server instance starts. Creates the ADMIN_EMAIL Super Administrator if it is configured
 * and missing, so `npm run dev` / `npm start` with ADMIN_EMAIL and ADMIN_PASSWORD in .env also works
 * (the Vercel build does the same in scripts/bootstrap-admin-env.ts).
 */
export async function register() {
  // Literal check so the Edge bundle drops the Node-only import below.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { bootstrapAdminOnStart } = await import('./instrumentation-node');
    await bootstrapAdminOnStart();
  }
}
