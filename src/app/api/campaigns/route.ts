import { api, parseJson } from '@/server/http';
import { listCampaigns, upsertCampaign } from '@/server/services/catalog';
import { campaignInputSchema } from '@/server/validators/catalog';

export const GET = api({ permission: 'ads.view' }, async ({ actor, req }) => listCampaigns(actor, { status: req.nextUrl.searchParams.get('status') ?? undefined }));
export const POST = api({ permission: 'ads.manage' }, async ({ actor, req }) => upsertCampaign(actor, null, await parseJson(req, campaignInputSchema)));
