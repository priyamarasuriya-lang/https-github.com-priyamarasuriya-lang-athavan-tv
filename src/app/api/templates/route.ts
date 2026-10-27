import { api, parseJson } from '@/server/http';
import { listTemplates, saveTemplate } from '@/server/services/schedules';
import { templateSchema } from '@/server/validators/schedule';

export const GET = api({ permission: 'schedule.view' }, async ({ actor }) => listTemplates(actor));
export const POST = api({ permission: 'schedule.edit' }, async ({ actor, req }) => saveTemplate(actor, await parseJson(req, templateSchema)));
