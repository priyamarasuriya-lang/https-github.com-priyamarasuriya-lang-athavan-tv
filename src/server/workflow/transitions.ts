import type { Permission } from '@/server/auth/permissions';

/**
 * Schedule approval workflow:
 *
 *   DRAFT ──submit──▶ SUBMITTED ──approve──▶ APPROVED ──publish──▶ PUBLISHED
 *     ▲                  │  │                   │                     │
 *     └──reject/withdraw─┘  │                   └──────reopen─────────┤ (new revision, back to DRAFT)
 *                           │                                         │
 *   any state except SUBMITTED ──archive──▶ ARCHIVED                  │
 *
 * Pure: decides whether a transition is allowed; persistence happens in the workflow service.
 */

export type ScheduleStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';
export type WorkflowAction = 'submit' | 'withdraw' | 'approve' | 'reject' | 'publish' | 'reopen' | 'archive';

interface TransitionDef {
  from: ScheduleStatus[];
  to: ScheduleStatus;
  permission: Permission;
  requiresValidSchedule: boolean;
  requiresReason: boolean;
}

export const TRANSITIONS: Record<WorkflowAction, TransitionDef> = {
  submit: { from: ['DRAFT'], to: 'SUBMITTED', permission: 'schedule.submit', requiresValidSchedule: true, requiresReason: false },
  withdraw: { from: ['SUBMITTED'], to: 'DRAFT', permission: 'schedule.submit', requiresValidSchedule: false, requiresReason: false },
  approve: { from: ['SUBMITTED'], to: 'APPROVED', permission: 'schedule.approve', requiresValidSchedule: true, requiresReason: false },
  reject: { from: ['SUBMITTED'], to: 'DRAFT', permission: 'schedule.approve', requiresValidSchedule: false, requiresReason: true },
  publish: { from: ['APPROVED'], to: 'PUBLISHED', permission: 'schedule.publish', requiresValidSchedule: true, requiresReason: false },
  reopen: { from: ['APPROVED', 'PUBLISHED'], to: 'DRAFT', permission: 'schedule.reopen', requiresValidSchedule: false, requiresReason: true },
  archive: { from: ['DRAFT', 'APPROVED', 'PUBLISHED'], to: 'ARCHIVED', permission: 'schedule.archive', requiresValidSchedule: false, requiresReason: false },
};

export interface TransitionContext {
  action: WorkflowAction;
  status: ScheduleStatus;
  actorId: string;
  permissions: ReadonlySet<string>;
  /** Who submitted the pending approval request (for separation of duties and withdraw). */
  submittedById: string | null;
  enforceSeparationOfDuties: boolean;
  validationErrors: number;
  reason?: string | null;
}

export type TransitionDecision =
  | { allowed: true; to: ScheduleStatus; idempotent?: boolean }
  | { allowed: false; code: 'FORBIDDEN' | 'INVALID_TRANSITION' | 'VALIDATION_FAILED' | 'REASON_REQUIRED' | 'SEPARATION_OF_DUTIES'; message: string };

export function decideTransition(ctx: TransitionContext): TransitionDecision {
  const def = TRANSITIONS[ctx.action];
  if (!ctx.permissions.has(def.permission)) {
    return { allowed: false, code: 'FORBIDDEN', message: `You do not have permission to ${ctx.action} schedules.` };
  }
  // Publishing an already-published schedule is a safe retry, not an error.
  if (ctx.action === 'publish' && ctx.status === 'PUBLISHED') return { allowed: true, to: 'PUBLISHED', idempotent: true };
  if (!def.from.includes(ctx.status)) {
    return { allowed: false, code: 'INVALID_TRANSITION', message: `Cannot ${ctx.action} a schedule that is ${ctx.status.toLowerCase()}.` };
  }
  if (ctx.action === 'withdraw' && ctx.submittedById !== ctx.actorId && !ctx.permissions.has('schedule.approve')) {
    return { allowed: false, code: 'FORBIDDEN', message: 'Only the submitter can withdraw this submission.' };
  }
  if (ctx.action === 'approve' && ctx.enforceSeparationOfDuties && ctx.submittedById === ctx.actorId) {
    return { allowed: false, code: 'SEPARATION_OF_DUTIES', message: 'You cannot approve a schedule you submitted.' };
  }
  if (def.requiresReason && !ctx.reason?.trim()) {
    return { allowed: false, code: 'REASON_REQUIRED', message: `A reason is required to ${ctx.action} a schedule.` };
  }
  if (def.requiresValidSchedule && ctx.validationErrors > 0) {
    return {
      allowed: false,
      code: 'VALIDATION_FAILED',
      message: `The schedule has ${ctx.validationErrors} blocking conflict${ctx.validationErrors === 1 ? '' : 's'}; resolve them before you ${ctx.action}.`,
    };
  }
  return { allowed: true, to: def.to };
}

/** Only drafts are editable; everything else is locked against item changes. */
export function isEditable(status: ScheduleStatus): boolean {
  return status === 'DRAFT';
}

export function availableActions(status: ScheduleStatus, permissions: ReadonlySet<string>): WorkflowAction[] {
  return (Object.keys(TRANSITIONS) as WorkflowAction[]).filter((a) => TRANSITIONS[a].from.includes(status) && permissions.has(TRANSITIONS[a].permission));
}
