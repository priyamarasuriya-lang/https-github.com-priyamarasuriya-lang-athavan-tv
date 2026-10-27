import { z } from 'zod';
import { api, parseJson } from '@/server/http';
import { setContentApproval } from '@/server/services/content';

const schema = z.object({ state: z.enum(['APPROVED', 'REJECTED']) });

export const POST = api<{ id: string }>({ permission: 'content.approve' }, async ({ actor, req, params }) => setContentApproval(actor, params.id, (await parseJson(req, schema)).state));
