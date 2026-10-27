import { api } from '@/server/http';
import { validateStoredSchedule } from '@/server/services/schedules';

export const POST = api<{ id: string }>({ permission: 'schedule.view' }, async ({ actor, params }) => validateStoredSchedule(actor, params.id));
