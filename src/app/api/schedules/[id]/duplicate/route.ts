import { z } from 'zod';
import { api, parseJson } from '@/server/http';
import { duplicateSchedule, getScheduleView } from '@/server/services/schedules';

const schema = z.object({ broadcastDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), channelId: z.string().optional() });

export const POST = api<{ id: string }>({ permission: 'schedule.edit' }, async ({ actor, req, params }) => {
  const body = await parseJson(req, schema);
  const s = await duplicateSchedule(actor, params.id, body.broadcastDate, body.channelId);
  return getScheduleView(actor, s.id);
});
