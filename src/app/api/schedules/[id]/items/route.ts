import { api, parseJson } from '@/server/http';
import { saveScheduleItems } from '@/server/services/schedules';
import { saveItemsSchema } from '@/server/validators/schedule';

/** Replace the draft's items. Body: { lockVersion, items }. 409 STALE_VERSION / 423 LOCKED on conflict. */
export const PUT = api<{ id: string }>({ permission: 'schedule.edit' }, async ({ actor, req, params }) => saveScheduleItems(actor, params.id, await parseJson(req, saveItemsSchema)));
