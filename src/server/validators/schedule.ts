import { z } from 'zod';

const DAY_MS = 24 * 3600_000;
const duration = z.number().int('Duration must be whole milliseconds').positive('Duration must be greater than zero').max(DAY_MS, 'Duration cannot exceed 24 hours');

export interface ItemInput {
  /** Client-side identity, echoed back by preview so the editor can map results. Ignored on save. */
  clientKey?: string;
  kind: 'CONTENT' | 'BREAK';
  contentItemId?: string | null;
  commercialBreakId?: string | null;
  label?: string | null;
  timingMode: 'SEQUENTIAL' | 'FIXED';
  /** Broadcast-day local wall time "HH:mm" or "HH:mm:ss"; times before the day start mean the next calendar date. */
  fixedTime?: string | null;
  plannedDurationMs?: number | null;
  estimatedDurationMs?: number | null;
  gapAfterMs?: number | null;
  isLive?: boolean;
  notes?: string | null;
  children?: ItemInput[];
}

export const itemInputSchema: z.ZodType<ItemInput, z.ZodTypeDef, unknown> = z.lazy(() =>
  z
    .object({
      clientKey: z.string().uuid().optional(),
      kind: z.enum(['CONTENT', 'BREAK']),
      contentItemId: z.string().min(1).max(64).nullish(),
      commercialBreakId: z.string().min(1).max(64).nullish(),
      label: z.string().trim().max(200).nullish(),
      timingMode: z.enum(['SEQUENTIAL', 'FIXED']).default('SEQUENTIAL'),
      fixedTime: z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Use HH:mm or HH:mm:ss')
        .nullish(),
      plannedDurationMs: duration.nullish(),
      estimatedDurationMs: duration.nullish(),
      gapAfterMs: z.number().int().min(0).max(3600_000).nullish(),
      isLive: z.boolean().default(false),
      notes: z.string().max(1000).nullish(),
      children: z.array(itemInputSchema).max(60).default([]),
    })
    .superRefine((v, ctx) => {
      if (v.kind === 'CONTENT' && !v.contentItemId) ctx.addIssue({ code: 'custom', path: ['contentItemId'], message: 'Content items need contentItemId' });
      if (v.kind === 'BREAK' && v.contentItemId) ctx.addIssue({ code: 'custom', path: ['contentItemId'], message: 'Breaks cannot reference content' });
      if (v.kind === 'CONTENT' && v.children?.length) ctx.addIssue({ code: 'custom', path: ['children'], message: 'Only breaks can contain items' });
      if (v.timingMode === 'FIXED' && !v.fixedTime) ctx.addIssue({ code: 'custom', path: ['fixedTime'], message: 'Fixed-time items need a start time' });
    }),
);

export const saveItemsSchema = z.object({
  lockVersion: z.number().int().min(0),
  items: z.array(itemInputSchema).max(600),
});

export const createScheduleSchema = z.object({
  channelId: z.string().min(1),
  broadcastDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().trim().max(200).optional(),
  copyFromScheduleId: z.string().optional(),
  templateId: z.string().optional(),
});

export const transitionSchema = z.object({
  lockVersion: z.number().int().min(0),
  reason: z.string().trim().max(2000).optional(),
  note: z.string().trim().max(2000).optional(),
});

export const listSchedulesSchema = z.object({
  channelId: z.string().optional(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'PUBLISHED', 'ARCHIVED']).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

export const templateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  fromScheduleId: z.string().min(1),
});

export const applyTemplateSchema = z.object({
  templateId: z.string().min(1),
  channelId: z.string().min(1),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** ISO weekdays 1=Mon … 7=Sun */
  weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
});
