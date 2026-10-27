import { api, parseJson, parseQuery } from '@/server/http';
import { createContent, listContent } from '@/server/services/content';
import { contentInputSchema, contentListSchema } from '@/server/validators/catalog';

export const GET = api({ permission: 'content.view' }, async ({ actor, req }) => listContent(actor, parseQuery(req, contentListSchema)));
export const POST = api({}, async ({ actor, req }) => createContent(actor, await parseJson(req, contentInputSchema)));
