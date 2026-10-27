import type { Prisma } from '@/generated/prisma/client';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { AppError } from '@/server/errors';
import { api, parseJson } from '@/server/http';
import { recordAudit } from '@/server/services/audit';
import { clearSettingsCache, getAllSettings, SETTINGS, type SettingKey } from '@/server/services/settings';

export const GET = api({ permission: 'settings.manage' }, async () => ({
  values: await getAllSettings(),
  labels: Object.fromEntries(Object.entries(SETTINGS).map(([k, v]) => [k, v.label])),
}));

export const PUT = api({ permission: 'settings.manage' }, async ({ actor, req }) => {
  const body = await parseJson(req, z.record(z.unknown()));
  const updates: Array<[SettingKey, unknown]> = [];
  for (const [key, value] of Object.entries(body)) {
    if (!(key in SETTINGS)) throw new AppError('VALIDATION_ERROR', `Unknown setting "${key}".`);
    const parsed = SETTINGS[key as SettingKey].schema.safeParse(value);
    if (!parsed.success) throw new AppError('VALIDATION_ERROR', `Invalid value for ${key}: ${parsed.error.issues[0]?.message}`);
    updates.push([key as SettingKey, parsed.data]);
  }
  await prisma.$transaction(async (tx) => {
    for (const [key, value] of updates) {
      await tx.systemSetting.upsert({ where: { key }, create: { key, value: value as Prisma.InputJsonValue, updatedById: actor.id }, update: { value: value as Prisma.InputJsonValue, updatedById: actor.id } });
    }
    await recordAudit({ actorId: actor.id, action: 'settings.update', entityType: 'SystemSetting', entityId: updates.map((u) => u[0]).join(','), data: Object.fromEntries(updates) as Prisma.InputJsonValue, ip: actor.ip }, tx);
  });
  clearSettingsCache();
  return getAllSettings();
});
