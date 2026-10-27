import { AppError } from '@/server/errors';
import { api, parseJson } from '@/server/http';
import { transitionSchedule } from '@/server/services/workflow';
import { transitionSchema } from '@/server/validators/schedule';
import { TRANSITIONS, type WorkflowAction } from '@/server/workflow/transitions';

/** POST /api/schedules/:id/transition/(submit|withdraw|approve|reject|publish|reopen|archive) */
export const POST = api<{ id: string; action: string }>({ permission: 'schedule.view' }, async ({ actor, req, params }) => {
  if (!(params.action in TRANSITIONS)) throw new AppError('NOT_FOUND', `Unknown workflow action "${params.action}".`);
  return transitionSchedule(actor, params.id, params.action as WorkflowAction, await parseJson(req, transitionSchema));
});
