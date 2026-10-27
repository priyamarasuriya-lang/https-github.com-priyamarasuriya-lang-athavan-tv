import { z } from 'zod';
import { api, parseJson } from '@/server/http';
import { listNotifications, markNotificationsRead } from '@/server/services/dashboard';

export const GET = api({}, async ({ actor }) => listNotifications(actor));
export const POST = api({}, async ({ actor, req }) => {
  const { ids } = await parseJson(req, z.object({ ids: z.array(z.string()).max(100).optional() }));
  await markNotificationsRead(actor, ids);
  return { ok: true };
});
