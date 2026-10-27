import { api, parseJson } from '@/server/http';
import { upsertRule } from '@/server/services/catalog';
import { ruleInputSchema } from '@/server/validators/catalog';

export const PUT = api<{ id: string }>({ permission: 'channel.manage' }, async ({ actor, req, params }) => upsertRule(actor, params.id, await parseJson(req, ruleInputSchema)));
