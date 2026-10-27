import { AppError } from '@/server/errors';
import { api } from '@/server/http';
import { buildReport } from '@/server/reports/builders';
import { CONTENT_TYPES, renderReport, type ExportFormat } from '@/server/reports/exporters';
import { recordAudit } from '@/server/services/audit';
import { getScheduleOrThrow } from '@/server/services/schedules';
import { prisma } from '@/server/db';
import { dateToIso } from '@/lib/time/zoned';

/** GET /api/schedules/:id/export?format=pdf|xlsx|csv — the schedule's daily broadcast log. */
export const GET = api<{ id: string }>({ permission: 'reports.export' }, async ({ actor, req, params }) => {
  const format = (req.nextUrl.searchParams.get('format') ?? 'pdf') as ExportFormat;
  if (!(format in CONTENT_TYPES)) throw new AppError('BAD_REQUEST', 'format must be pdf, xlsx or csv.');
  const s = await getScheduleOrThrow(prisma, params.id);
  const date = dateToIso(s.broadcastDate);
  const report = await buildReport(actor, 'daily-log', { from: date, to: date, channelId: s.channelId, scheduleId: s.id });
  const bytes = await renderReport(report, format);
  await recordAudit({ actorId: actor.id, action: 'schedule.export', entityType: 'BroadcastSchedule', entityId: s.id, summary: `Exported ${format.toUpperCase()} (${report.rows.length} rows)`, ip: actor.ip });
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': CONTENT_TYPES[format],
      'Content-Disposition': `attachment; filename="schedule-${s.channel.code}-${date}.${format}"`,
      'Cache-Control': 'no-store',
    },
  });
});
