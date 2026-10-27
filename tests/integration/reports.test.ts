import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it } from 'vitest';
import { GET as exportRoute } from '@/app/api/schedules/[id]/export/route';
import { GET as reportRoute } from '@/app/api/reports/[key]/route';
import { prisma } from '@/server/db';
import { buildReport } from '@/server/reports/builders';
import { renderReport } from '@/server/reports/exporters';
import { toCsv } from '@/server/reports/format';
import { createSchedule, getScheduleView, saveScheduleItems } from '@/server/services/schedules';
import { transitionSchedule } from '@/server/services/workflow';
import { actorFor, call, cookieFor, fullDayItems, seedBase, type Base } from './helpers';

let b: Base;
let scheduleId: string;
beforeEach(async () => {
  b = await seedBase();
  const scheduler = await actorFor(b.users.scheduler.id);
  const approver = await actorFor(b.users.approver.id);
  const s = await createSchedule(scheduler, { channelId: b.channel.id, broadcastDate: '2026-06-01' });
  const v0 = await getScheduleView(scheduler, s.id);
  const v = await saveScheduleItems(scheduler, s.id, { lockVersion: v0.lockVersion, items: fullDayItems(b) });
  let t = await transitionSchedule(scheduler, s.id, 'submit', { lockVersion: v.lockVersion });
  t = await transitionSchedule(approver, s.id, 'approve', { lockVersion: t.lockVersion });
  await transitionSchedule(approver, s.id, 'publish', { lockVersion: t.lockVersion });
  scheduleId = s.id;
});

describe('reports', () => {
  it('daily log lists every item and totals top-level airtime to 24h', async () => {
    const r = await buildReport(await actorFor(b.users.viewer.id), 'daily-log', { from: '2026-06-01', to: '2026-06-01', channelId: b.channel.id });
    expect(r.rows).toHaveLength(7); // 5 top-level + 2 spots
    expect(r.totals!.duration).toBe(24 * 3600_000);
    expect(r.timeZone).toBe('Asia/Colombo');
  });

  it('ad delivery report counts planned airings and remaining contract', async () => {
    const r = await buildReport(await actorFor(b.users.viewer.id), 'ad-delivery', { from: '2026-06-01', to: '2026-06-02' });
    const row = r.rows.find((x) => x.campaign === 'Acme Launch')!;
    expect(row.planned).toBe(2);
    expect(row.remaining).toBe(2); // maxAirings 4 − 2 booked
  });

  it('program airtime aggregates per content item', async () => {
    const r = await buildReport(await actorFor(b.users.viewer.id), 'content-usage', { from: '2026-06-01', to: '2026-06-01' });
    const filler = r.rows.find((x) => x.title === 'Filler 57')!;
    expect(filler.airings).toBe(2);
    expect(filler.airtime).toBe(59 * 60_000);
  });

  it('CSV output is escaped and guarded against formula injection', async () => {
    await prisma.contentItem.update({ where: { id: b.content.show.id }, data: { title: '=HYPERLINK("x","y")' } });
    const r = await buildReport(await actorFor(b.users.viewer.id), 'daily-log', { from: '2026-06-01', to: '2026-06-01' });
    const csv = toCsv(r);
    expect(csv).toContain(`"'=HYPERLINK(""x"",""y"")"`);
    expect(csv).toContain('24:00:00');
  });

  it('renders XLSX with the right rows and a valid PDF', async () => {
    const r = await buildReport(await actorFor(b.users.viewer.id), 'daily-log', { from: '2026-06-01', to: '2026-06-01' });
    const xlsx = await renderReport(r, 'xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(xlsx) as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    const titles: string[] = [];
    ws.eachRow((row, n) => n > 5 && titles.push(String(row.getCell(6).value ?? '')));
    expect(titles).toContain('Twelve Hour Show');
    expect(titles.at(-1)).toBe(''); // totals row has no title
    const pdf = Buffer.from(await renderReport(r, 'pdf'));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });
});

describe('export endpoints respect permissions', () => {
  it('exports a schedule as PDF/XLSX/CSV for permitted users and audits it', async () => {
    const cookie = await cookieFor(b.users.scheduler.id);
    for (const format of ['pdf', 'xlsx', 'csv']) {
      const r = await call(exportRoute, { cookie, path: `/api/schedules/${scheduleId}/export?format=${format}`, params: { id: scheduleId } });
      expect(r.status).toBe(200);
      expect(r.res.headers.get('content-disposition')).toContain(`.${format}`);
    }
    expect(await prisma.auditLog.count({ where: { action: 'schedule.export' } })).toBe(3);
  });

  it('denies exports to users without reports.export', async () => {
    const cookie = await cookieFor(b.users.content.id); // reports.view but not export
    const r = await call(reportRoute, { cookie, path: '/api/reports/daily-log?from=2026-06-01&to=2026-06-01&format=csv', params: { key: 'daily-log' } });
    expect(r.status).toBe(403);
    const json = await call(reportRoute, { cookie, path: '/api/reports/daily-log?from=2026-06-01&to=2026-06-01', params: { key: 'daily-log' } });
    expect(json.status).toBe(200);
    const sched = await call(exportRoute, { cookie, path: `/api/schedules/${scheduleId}/export?format=pdf`, params: { id: scheduleId } });
    expect(sched.status).toBe(403);
  });

  it('validates report filters', async () => {
    const cookie = await cookieFor(b.users.viewer.id);
    const bad = await call(reportRoute, { cookie, path: '/api/reports/daily-log?from=2026-06-05&to=2026-06-01', params: { key: 'daily-log' } });
    expect(bad.status).toBe(400);
    const unknown = await call(reportRoute, { cookie, path: '/api/reports/nope?from=2026-06-01&to=2026-06-01', params: { key: 'nope' } });
    expect(unknown.status).toBe(404);
  });
});
