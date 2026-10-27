import { api, parseJson } from '@/server/http';
import { listAdvertisers, upsertAdvertiser } from '@/server/services/catalog';
import { advertiserInputSchema } from '@/server/validators/catalog';

export const GET = api({ permission: 'ads.view' }, async ({ actor }) => listAdvertisers(actor));
export const POST = api({ permission: 'ads.manage' }, async ({ actor, req }) => upsertAdvertiser(actor, null, await parseJson(req, advertiserInputSchema)));
