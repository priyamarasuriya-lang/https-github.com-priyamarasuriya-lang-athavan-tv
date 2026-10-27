import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { fmtLocalDateTime } from '@/lib/time/zoned';
import { formatCell, toCsv } from './format';
import type { Report } from './types';

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

export const CONTENT_TYPES: Record<ExportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

export async function renderReport(report: Report, format: ExportFormat): Promise<Uint8Array> {
  if (format === 'csv') return new TextEncoder().encode(toCsv(report));
  if (format === 'xlsx') return renderXlsx(report);
  return renderPdf(report);
}

async function renderXlsx(report: Report): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = report.station;
  wb.created = report.generatedAt;
  const ws = wb.addWorksheet(report.title.slice(0, 31), { views: [{ state: 'frozen', ySplit: 5 }] });
  ws.addRow([`${report.station} — ${report.title}`]).font = { bold: true, size: 14 };
  ws.addRow([`Period: ${report.period}`, `Channel: ${report.channel}`]);
  ws.addRow([`Generated: ${fmtLocalDateTime(report.generatedAt, report.timeZone)} (${report.timeZone})`]);
  ws.addRow([]);
  const header = ws.addRow(report.columns.map((c) => c.label));
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.eachCell((cell) => (cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E2A44' } }));
  for (const row of report.rows) {
    ws.addRow(
      report.columns.map((c) => {
        const v = row[c.key];
        if (v == null) return null;
        // Durations are written as text HH:MM:SS so they read identically to the PDF/CSV.
        if (c.type === 'number') return Number(v);
        return formatCell(v, c, report.timeZone);
      }),
    );
  }
  if (report.totals) {
    const t = ws.addRow(report.columns.map((c, i) => (i === 0 ? 'Total' : report.totals![c.key] != null ? (c.type === 'number' ? report.totals![c.key] : formatCell(report.totals![c.key], c, report.timeZone)) : null)));
    t.font = { bold: true };
  }
  for (const n of report.notes ?? []) ws.addRow([`Note: ${n}`]).font = { italic: true };
  report.columns.forEach((c, i) => (ws.getColumn(i + 1).width = c.width ?? Math.max(12, Math.min(48, c.label.length + 6))));
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

function renderPdf(report: Report): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: report.columns.length > 6 ? 'landscape' : 'portrait', margin: 36, bufferPages: true, info: { Title: report.title, Author: report.station } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const usable = doc.page.width - left - doc.page.margins.right;
    const weights = report.columns.map((c) => c.width ?? (c.type === 'text' ? 3 : 1.6));
    const totalW = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((w) => (w / totalW) * usable);

    const header = () => {
      doc.fillColor('#1e2a44').font('Helvetica-Bold').fontSize(14).text(`${report.station} — ${report.title}`, left, doc.page.margins.top);
      doc.font('Helvetica').fontSize(9).fillColor('#444').text(`Period: ${report.period}    Channel: ${report.channel}    Generated: ${fmtLocalDateTime(report.generatedAt, report.timeZone)} (${report.timeZone})`);
      doc.moveDown(0.6);
      tableRow(report.columns.map((c) => c.label), true);
    };
    const tableRow = (cells: string[], bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
      const heights = cells.map((t, i) => doc.heightOfString(t, { width: widths[i] - 4 }));
      const h = Math.max(...heights, 10) + 4;
      if (doc.y + h > doc.page.height - doc.page.margins.bottom - 16) {
        doc.addPage();
        header();
      }
      const y = doc.y;
      if (bold) doc.rect(left, y, usable, h).fill('#e8edf5');
      let x = left;
      cells.forEach((t, i) => {
        doc.fillColor('#111').text(t, x + 2, y + 2, { width: widths[i] - 4 });
        x += widths[i];
      });
      doc.y = y + h;
      doc.moveTo(left, doc.y).lineTo(left + usable, doc.y).strokeColor('#d0d5dd').lineWidth(0.5).stroke();
    };

    header();
    if (!report.rows.length) doc.font('Helvetica-Oblique').fontSize(9).text('No records for the selected filters.', left, doc.y + 6);
    for (const row of report.rows) tableRow(report.columns.map((c) => formatCell(row[c.key], c, report.timeZone)));
    if (report.totals) tableRow(report.columns.map((c, i) => (i === 0 ? 'Total' : report.totals![c.key] != null ? formatCell(report.totals![c.key], c, report.timeZone) : '')), true);
    for (const n of report.notes ?? []) doc.font('Helvetica-Oblique').fontSize(8).fillColor('#555').text(`Note: ${n}`, left, doc.y + 4);

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - doc.page.margins.bottom + 10;
      doc.font('Helvetica').fontSize(7).fillColor('#777').text(`Page ${i + 1} of ${range.count}`, left, bottom, { width: usable, align: 'right', lineBreak: false });
    }
    doc.end();
  });
}
