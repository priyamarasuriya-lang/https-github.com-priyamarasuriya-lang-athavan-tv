import { api, parseJson } from '@/server/http';
import { upsertBreak } from '@/server/services/catalog';
import { breakInputSchema } from '@/server/validators/catalog';

export const PUT = api<{ id: string }>({ permission: 'ads.manage' }, async ({ actor, req, params }) => upsertBreak(actor, params.id, await parseJson(req, breakInputSchema)));
