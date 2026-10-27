import { z } from 'zod';
import { api, parseJson } from '@/server/http';
import { setCampaignApproval } from '@/server/services/catalog';

const schema = z.object({ state: z.enum(['APPROVED', 'REJECTED']) });

export const POST = api<{ id: string }>({ permission: 'ads.manage' }, async ({ actor, req, params }) => setCampaignApproval(actor, params.id, (await parseJson(req, schema)).state));
