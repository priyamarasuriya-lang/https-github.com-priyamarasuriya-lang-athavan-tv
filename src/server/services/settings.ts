import { z } from 'zod';
import { prisma } from '@/server/db';

/** Typed system settings with defaults. Stored as JSON in SystemSetting. */
export const SETTINGS = {
  stationName: { schema: z.string().min(1).max(120), default: 'BAT Television', label: 'Station name (used on reports)' },
  enforceSeparationOfDuties: { schema: z.boolean(), default: true, label: 'Prevent users approving schedules they submitted' },
  sessionTtlHours: { schema: z.number().int().min(1).max(72), default: 12, label: 'Session lifetime (hours)' },
  loginMaxAttempts: { schema: z.number().int().min(3).max(20), default: 5, label: 'Failed sign-ins before lockout' },
  loginLockMinutes: { schema: z.number().int().min(1).max(1440), default: 15, label: 'Lockout duration (minutes)' },
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = (typeof SETTINGS)[K]['default'];

const cache = new Map<string, { value: unknown; at: number }>();
const TTL_MS = 10_000;

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as SettingValue<K>;
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  const parsed = row ? SETTINGS[key].schema.safeParse(row.value) : null;
  const value = (parsed?.success ? parsed.data : SETTINGS[key].default) as SettingValue<K>;
  cache.set(key, { value, at: Date.now() });
  return value;
}

export async function getAllSettings() {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(SETTINGS) as SettingKey[]) out[key] = await getSetting(key);
  return out as { [K in SettingKey]: SettingValue<K> };
}

export function clearSettingsCache() {
  cache.clear();
}
