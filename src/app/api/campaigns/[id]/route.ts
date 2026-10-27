import { api, parseJson } from '@/server/http';
import { upsertCampaign } from '@/server/services/catalog';
import { campaignInputSchema } from '@/server/validators/catalog';

export const PUT = api<{ id: string }>({ permission: 'ads.manage' }, async ({ actor, req, params }) => upsertCampaign(actor, params.id, await parseJson(req, campaignInputSchema)));
