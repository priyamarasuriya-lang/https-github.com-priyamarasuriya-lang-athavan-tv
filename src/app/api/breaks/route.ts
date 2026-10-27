import { api, parseJson } from '@/server/http';
import { listBreaks, upsertBreak } from '@/server/services/catalog';
import { breakInputSchema } from '@/server/validators/catalog';

export const GET = api({}, async ({ actor }) => listBreaks(actor));
export const POST = api({ permission: 'ads.manage' }, async ({ actor, req }) => upsertBreak(actor, null, await parseJson(req, breakInputSchema)));
