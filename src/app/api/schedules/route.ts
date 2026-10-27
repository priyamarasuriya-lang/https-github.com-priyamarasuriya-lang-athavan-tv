import { api, parseJson, parseQuery } from '@/server/http';
import { createSchedule, getScheduleView, listSchedules } from '@/server/services/schedules';
import { createScheduleSchema, listSchedulesSchema } from '@/server/validators/schedule';

export const GET = api({ permission: 'schedule.view' }, async ({ actor, req }) => listSchedules(actor, parseQuery(req, listSchedulesSchema)));

export const POST = api({ permission: 'schedule.edit' }, async ({ actor, req }) => {
  const s = await createSchedule(actor, await parseJson(req, createScheduleSchema));
  return getScheduleView(actor, s.id);
});
