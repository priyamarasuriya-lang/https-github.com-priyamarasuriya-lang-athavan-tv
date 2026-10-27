import { api, parseJson } from '@/server/http';
import { listRules, upsertRule } from '@/server/services/catalog';
import { ruleInputSchema } from '@/server/validators/catalog';

export const GET = api({ permission: 'schedule.view' }, async ({ actor }) => listRules(actor));
export const POST = api({ permission: 'channel.manage' }, async ({ actor, req }) => upsertRule(actor, null, await parseJson(req, ruleInputSchema)));
