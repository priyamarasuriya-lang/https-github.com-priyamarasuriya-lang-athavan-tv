import { describe, expect, it } from 'vitest';
import { ROLES } from '@/server/auth/permissions';
import { availableActions, decideTransition, isEditable, type TransitionContext } from '@/server/workflow/transitions';

const perms = (role: keyof typeof ROLES) => new Set<string>(ROLES[role].permissions);
const base = (o: Partial<TransitionContext>): TransitionContext => ({
  action: 'submit',
  status: 'DRAFT',
  actorId: 'u1',
  permissions: perms('SCHEDULER'),
  submittedById: null,
  enforceSeparationOfDuties: true,
  validationErrors: 0,
  ...o,
});

describe('decideTransition', () => {
  it('lets a scheduler submit a valid draft', () => {
    expect(decideTransition(base({}))).toEqual({ allowed: true, to: 'SUBMITTED' });
  });

  it('blocks submission when the schedule has blocking conflicts', () => {
    const d = decideTransition(base({ validationErrors: 2 }));
    expect(d).toMatchObject({ allowed: false, code: 'VALIDATION_FAILED' });
  });

  it('forbids a scheduler from approving', () => {
    expect(decideTransition(base({ action: 'approve', status: 'SUBMITTED' }))).toMatchObject({ allowed: false, code: 'FORBIDDEN' });
  });

  it('enforces separation of duties when configured', () => {
    const own = base({ action: 'approve', status: 'SUBMITTED', permissions: perms('SUPER_ADMIN'), submittedById: 'u1' });
    expect(decideTransition(own)).toMatchObject({ allowed: false, code: 'SEPARATION_OF_DUTIES' });
    expect(decideTransition({ ...own, enforceSeparationOfDuties: false })).toEqual({ allowed: true, to: 'APPROVED' });
    expect(decideTransition({ ...own, submittedById: 'u2' })).toEqual({ allowed: true, to: 'APPROVED' });
  });

  it('requires a reason to reject or reopen', () => {
    const rej = base({ action: 'reject', status: 'SUBMITTED', permissions: perms('APPROVER'), submittedById: 'u2' });
    expect(decideTransition(rej)).toMatchObject({ allowed: false, code: 'REASON_REQUIRED' });
    expect(decideTransition({ ...rej, reason: '   ' })).toMatchObject({ allowed: false, code: 'REASON_REQUIRED' });
    expect(decideTransition({ ...rej, reason: 'Wrong movie' })).toEqual({ allowed: true, to: 'DRAFT' });
    const reopen = base({ action: 'reopen', status: 'PUBLISHED', permissions: perms('CHIEF_SCHEDULER') });
    expect(decideTransition(reopen)).toMatchObject({ code: 'REASON_REQUIRED' });
    expect(decideTransition({ ...reopen, reason: 'Breaking news' })).toEqual({ allowed: true, to: 'DRAFT' });
  });

  it('rejects invalid transitions', () => {
    expect(decideTransition(base({ action: 'publish', status: 'DRAFT', permissions: perms('APPROVER') }))).toMatchObject({ code: 'INVALID_TRANSITION' });
    expect(decideTransition(base({ action: 'submit', status: 'APPROVED' }))).toMatchObject({ code: 'INVALID_TRANSITION' });
    expect(decideTransition(base({ action: 'archive', status: 'SUBMITTED', permissions: perms('SUPER_ADMIN') }))).toMatchObject({ code: 'INVALID_TRANSITION' });
  });

  it('treats re-publishing as idempotent', () => {
    expect(decideTransition(base({ action: 'publish', status: 'PUBLISHED', permissions: perms('APPROVER') }))).toEqual({ allowed: true, to: 'PUBLISHED', idempotent: true });
  });

  it('only lets the submitter (or an approver) withdraw', () => {
    const w = base({ action: 'withdraw', status: 'SUBMITTED', submittedById: 'u2' });
    expect(decideTransition(w)).toMatchObject({ code: 'FORBIDDEN' });
    expect(decideTransition({ ...w, submittedById: 'u1' })).toEqual({ allowed: true, to: 'DRAFT' });
  });
});

describe('workflow helpers', () => {
  it('only drafts are editable', () => {
    expect(isEditable('DRAFT')).toBe(true);
    for (const s of ['SUBMITTED', 'APPROVED', 'PUBLISHED', 'ARCHIVED'] as const) expect(isEditable(s)).toBe(false);
  });

  it('lists actions available to a role', () => {
    expect(availableActions('SUBMITTED', perms('APPROVER')).sort()).toEqual(['approve', 'reject']);
    expect(availableActions('DRAFT', perms('REPORTS_VIEWER'))).toEqual([]);
  });
});

describe('role grants', () => {
  it('administrators cannot approve schedules by default (separation of duties)', () => {
    expect(perms('ADMIN').has('schedule.approve')).toBe(false);
    expect(perms('SUPER_ADMIN').has('schedule.approve')).toBe(true);
  });
  it('reports viewer is read-only', () => {
    expect([...perms('REPORTS_VIEWER')].every((p) => p.endsWith('.view') || p === 'reports.export')).toBe(true);
  });
});
