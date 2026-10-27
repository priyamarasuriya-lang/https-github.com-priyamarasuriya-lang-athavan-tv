import { api, parseJson } from '@/server/http';
import { upsertAdvertiser } from '@/server/services/catalog';
import { advertiserInputSchema } from '@/server/validators/catalog';

export const PUT = api<{ id: string }>({ permission: 'ads.manage' }, async ({ actor, req, params }) => upsertAdvertiser(actor, params.id, await parseJson(req, advertiserInputSchema)));
