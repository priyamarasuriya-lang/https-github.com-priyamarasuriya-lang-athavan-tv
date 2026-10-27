import { api } from '@/server/http';
import { getScheduleView } from '@/server/services/schedules';

export const GET = api<{ id: string }>({ permission: 'schedule.view' }, async ({ actor, req, params }) => {
  const v = req.nextUrl.searchParams.get('version');
  return getScheduleView(actor, params.id, v ? Number(v) : undefined);
});
