import { api, parseJson } from '@/server/http';
import { archiveContent, updateContent } from '@/server/services/content';
import { contentInputSchema } from '@/server/validators/catalog';

export const PUT = api<{ id: string }>({}, async ({ actor, req, params }) => updateContent(actor, params.id, await parseJson(req, contentInputSchema)));
export const DELETE = api<{ id: string }>({}, async ({ actor, params }) => archiveContent(actor, params.id));
