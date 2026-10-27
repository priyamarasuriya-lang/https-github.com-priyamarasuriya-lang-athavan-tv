import { AppError, forbidden } from '@/server/errors';
import { api } from '@/server/http';
import { buildReport, REPORT_KEYS, reportFilterSchema, type ReportKey } from '@/server/reports/builders';
import { CONTENT_TYPES, renderReport, type ExportFormat } from '@/server/reports/exporters';
import { recordAudit } from '@/server/services/audit';

/** GET /api/reports/:key?from&to&channelId&category&status&format=json|csv|xlsx|pdf */
export const GET = api<{ key: string }>({ permission: 'reports.view' }, async ({ actor, req, params }) => {
  if (!REPORT_KEYS.includes(params.key as ReportKey)) throw new AppError('NOT_FOUND', 'Unknown report.');
  const format = req.nextUrl.searchParams.get('format') ?? 'json';
  const { format: _f, ...query } = Object.fromEntries(req.nextUrl.searchParams);
  const filters = reportFilterSchema.parse(query);
  if (format !== 'json' && !actor.permissions.has('reports.export')) throw forbidden('You do not have permission to export reports.');
  if (format !== 'json' && !(format in CONTENT_TYPES)) throw new AppError('BAD_REQUEST', 'format must be json, pdf, xlsx or csv.');
  const report = await buildReport(actor, params.key as ReportKey, filters);
  if (format === 'json') return report;
  const bytes = await renderReport(report, format as ExportFormat);
  await recordAudit({ actorId: actor.id, action: 'report.export', entityType: 'Report', entityId: params.key, summary: `${format.toUpperCase()} ${report.period} ${report.channel} (${report.rows.length} rows)`, ip: actor.ip });
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': CONTENT_TYPES[format as ExportFormat],
      'Content-Disposition': `attachment; filename="${params.key}-${filters.from}_${filters.to}.${format}"`,
      'Cache-Control': 'no-store',
    },
  });
});
