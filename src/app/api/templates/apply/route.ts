import { api, parseJson } from '@/server/http';
import { applyTemplate } from '@/server/services/schedules';
import { applyTemplateSchema } from '@/server/validators/schedule';

export const POST = api({ permission: 'schedule.edit' }, async ({ actor, req }) => applyTemplate(actor, await parseJson(req, applyTemplateSchema)));
