import { z } from 'zod';

export const CATEGORIES = ['PROGRAM', 'MOVIE', 'NEWS', 'LIVE', 'SPECIAL_EVENT', 'ADVERTISEMENT', 'PROMO', 'FILLER', 'SLIDE', 'STATION_ID', 'PSA'] as const;

const minute = z.number().int().min(0).max(1440);
const optDate = z
  .string()
  .datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
  .nullish()
  .transform((v) => (v ? new Date(v) : null));
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const durationMs = z.number().int().positive('Duration must be greater than zero').max(24 * 3600_000);
const emptyToNull = (v: unknown) => (v === '' ? null : v);

export const contentInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    category: z.enum(CATEGORIES),
    houseNumber: z.preprocess(emptyToNull, z.string().trim().max(40).nullish()),
    description: z.preprocess(emptyToNull, z.string().trim().max(4000).nullish()),
    assetId: z.preprocess(emptyToNull, z.string().nullish()),
    originalDurationMs: durationMs.nullish(),
    plannedDurationMs: durationMs,
    isDurationEditable: z.boolean().default(true),
    status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).default('ACTIVE'),
    language: z.preprocess(emptyToNull, z.string().trim().max(40).nullish()),
    rating: z.preprocess(emptyToNull, z.string().trim().max(20).nullish()),
    rightsHolder: z.preprocess(emptyToNull, z.string().trim().max(200).nullish()),
    licenseNotes: z.preprocess(emptyToNull, z.string().trim().max(2000).nullish()),
    maxAiringsPerDay: z.number().int().positive().nullish(),
    availableFrom: optDate,
    availableUntil: optDate,
    allowedStartMinute: minute.nullish(),
    allowedEndMinute: minute.nullish(),
    channelIds: z.array(z.string()).max(50).default([]),
  })
  .refine((v) => !(v.availableFrom && v.availableUntil) || v.availableFrom < v.availableUntil, { path: ['availableUntil'], message: 'Must be after "available from"' })
  .refine((v) => (v.allowedStartMinute == null) === (v.allowedEndMinute == null), { path: ['allowedEndMinute'], message: 'Set both ends of the time window' });

export const contentListSchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.union([z.enum(CATEGORIES), z.string().regex(/^[A-Z_,]+$/)]).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
  channelId: z.string().optional(),
  sort: z.enum(['title', 'updatedAt', 'plannedDurationMs', 'category']).default('updatedAt'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

export const channelInputSchema = z.object({
  code: z.string().trim().min(2).max(16).regex(/^[A-Z0-9_-]+$/, 'Upper-case letters, digits, - and _ only'),
  name: z.string().trim().min(1).max(120),
  timeZone: z.string().min(1).max(64),
  broadcastDayStartMinute: z.number().int().min(0).max(1439).default(360),
  defaultGapMs: z.number().int().min(0).max(600_000).default(0),
  underrunToleranceMs: z.number().int().min(0).max(3600_000).default(60_000),
  playoutSystem: z.preprocess(emptyToNull, z.string().trim().max(120).nullish()),
  isActive: z.boolean().default(true),
});

export const advertiserInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  contactName: z.preprocess(emptyToNull, z.string().trim().max(200).nullish()),
  contactEmail: z.preprocess(emptyToNull, z.string().trim().email().max(200).nullish()),
});

export const campaignInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    advertiserId: z.string().min(1),
    startDate: isoDate,
    endDate: isoDate,
    priority: z.number().int().min(1).max(10).default(5),
    maxAirings: z.number().int().positive().nullish(),
    contractedAirings: z.number().int().positive().nullish(),
    dailyLimit: z.number().int().positive().nullish(),
    weeklyLimit: z.number().int().positive().nullish(),
    minSpacingMs: z.number().int().min(0).max(24 * 3600_000).nullish(),
    allowedStartMinute: minute.nullish(),
    allowedEndMinute: minute.nullish(),
    budgetCents: z.number().int().min(0).nullish(),
    status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']).default('DRAFT'),
    channelIds: z.array(z.string()).max(50).default([]),
  })
  .refine((v) => v.startDate <= v.endDate, { path: ['endDate'], message: 'End date must be on or after start date' });

export const creativeInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  houseNumber: z.preprocess(emptyToNull, z.string().trim().max(40).nullish()),
  plannedDurationMs: durationMs,
  assetId: z.preprocess(emptyToNull, z.string().nullish()),
});

export const breakInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    channelId: z.preprocess(emptyToNull, z.string().nullish()),
    defaultDurationMs: durationMs,
    minDurationMs: durationMs,
    maxDurationMs: durationMs,
    isActive: z.boolean().default(true),
  })
  .refine((v) => v.minDurationMs <= v.defaultDurationMs && v.defaultDurationMs <= v.maxDurationMs, { path: ['defaultDurationMs'], message: 'Need min ≤ default ≤ max' });

export const ruleInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(['NO_DUPLICATE_CONTENT', 'RATING_TIME_WINDOW', 'CATEGORY_TIME_WINDOW', 'CATEGORY_REQUIRES_APPROVAL', 'SCHEDULE_END_DEADLINE', 'MAX_GAP']),
  channelId: z.preprocess(emptyToNull, z.string().nullish()),
  severity: z.enum(['ERROR', 'WARNING']).default('ERROR'),
  isActive: z.boolean().default(true),
  params: z.record(z.unknown()),
});

/** Per-type parameter schemas so rules stored in the database are always well-formed. */
export const ruleParamSchemas = {
  NO_DUPLICATE_CONTENT: z.object({ withinMinutes: z.number().int().positive().max(1440).optional(), categories: z.array(z.enum(CATEGORIES)).optional() }),
  RATING_TIME_WINDOW: z.object({ ratings: z.array(z.string().min(1)).min(1), startMinute: minute, endMinute: minute }),
  CATEGORY_TIME_WINDOW: z.object({ categories: z.array(z.enum(CATEGORIES)).min(1), startMinute: minute, endMinute: minute }),
  CATEGORY_REQUIRES_APPROVAL: z.object({ categories: z.array(z.enum(CATEGORIES)).min(1) }),
  SCHEDULE_END_DEADLINE: z.object({ endMinute: minute }),
  MAX_GAP: z.object({ maxGapMs: z.number().int().positive() }),
} as const;

export const userCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(256),
  roleKeys: z.array(z.string()).min(1),
});

export const userUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
  roleKeys: z.array(z.string()).min(1).optional(),
  password: z.string().min(1).max(256).optional(),
});
