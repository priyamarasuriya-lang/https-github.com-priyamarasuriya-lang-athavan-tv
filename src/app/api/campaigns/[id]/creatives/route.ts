import { api, parseJson } from '@/server/http';
import { addCreative } from '@/server/services/catalog';
import { creativeInputSchema } from '@/server/validators/catalog';

export const POST = api<{ id: string }>({ permission: 'ads.manage' }, async ({ actor, req, params }) => addCreative(actor, params.id, await parseJson(req, creativeInputSchema)));
