import { api, parseJson } from '@/server/http';
import { upsertChannel } from '@/server/services/catalog';
import { channelInputSchema } from '@/server/validators/catalog';

export const PUT = api<{ id: string }>({ permission: 'channel.manage' }, async ({ actor, req, params }) => upsertChannel(actor, params.id, await parseJson(req, channelInputSchema)));
