import { z } from 'zod';
import { api, parseJson } from '@/server/http';
import { previewSchedule } from '@/server/services/schedules';
import { itemInputSchema } from '@/server/validators/schedule';

/** POST { items } → ScheduleView with recalculated times and conflicts. Nothing is saved. */
export const POST = api<{ id: string }>({ permission: 'schedule.view' }, async ({ actor, req, params }) => {
  const { items } = await parseJson(req, z.object({ items: z.array(itemInputSchema).max(600) }));
  return previewSchedule(actor, params.id, items);
});
