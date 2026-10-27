import { api, parseJson } from '@/server/http';
import { listChannels, upsertChannel } from '@/server/services/catalog';
import { channelInputSchema } from '@/server/validators/catalog';

export const GET = api({}, async ({ actor, req }) => listChannels(actor, req.nextUrl.searchParams.get('all') === '1'));
export const POST = api({ permission: 'channel.manage' }, async ({ actor, req }) => upsertChannel(actor, null, await parseJson(req, channelInputSchema)));
