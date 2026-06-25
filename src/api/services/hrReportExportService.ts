import * as XLSXStyle from 'xlsx-js-style';
import { downloadPdfReport } from './reportExportService';

export type HrReportColumn = { key: string; label: string; width?: number };

const TEAL_FILL = 'FF0B9E75';
const ALT_ROW_FILL = 'FFF5F5F5';
const BORDER = { style: 'thin' as const, color: { rgb: 'FFD0D0D0' } };

function formatCell(value: unknown): string | number {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return value;
  return String(value);
}

export function buildHrWorkbookSheet(input: {
  companyName: string;
  reportTitle: string;
  generatedByName: string;
  columns: HrReportColumn[];
  rows: Record<string, unknown>[];
}): XLSXStyle.WorkSheet {
  const generatedLine = `Generated ${new Date().toLocaleString('en-ZA')} by ${input.generatedByName}`;
  const headerLabels = input.columns.map((c) => c.label);
  const aoa: (string | number)[][] = [
    [`${input.companyName} — ${input.reportTitle}`],
    [generatedLine],
    [],
    headerLabels,
    ...input.rows.map((row) => input.columns.map((c) => formatCell(row[c.key])))
  ];

  const ws = XLSXStyle.utils.aoa_to_sheet(aoa);
  const colCount = input.columns.length;

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(0, colCount - 1) } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: Math.max(0, colCount - 1) } }
  ];

  const titleCell = ws['A1'];
  if (titleCell) titleCell.s = { font: { bold: true, sz: 14 } };
  const metaCell = ws['A2'];
  if (metaCell) metaCell.s = { font: { italic: true, color: { rgb: 'FF666666' } } };

  for (let c = 0; c < colCount; c++) {
    const headerRef = XLSXStyle.utils.encode_cell({ r: 3, c });
    const headerCell = ws[headerRef];
    if (headerCell) {
      headerCell.s = {
        font: { bold: true, color: { rgb: 'FFFFFFFF' } },
        fill: { fgColor: { rgb: TEAL_FILL }, patternType: 'solid' },
        border: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
        alignment: { vertical: 'center' }
      };
    }
  }

  for (let r = 0; r < input.rows.length; r++) {
    const isAlt = r % 2 === 1;
    for (let c = 0; c < colCount; c++) {
      const ref = XLSXStyle.utils.encode_cell({ r: 4 + r, c });
      const cell = ws[ref];
      if (cell) {
        cell.s = {
          fill: isAlt ? { fgColor: { rgb: ALT_ROW_FILL }, patternType: 'solid' } : undefined,
          border: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }
        };
      }
    }
  }

  ws['!cols'] = input.columns.map((col) => {
    const longest = Math.max(
      col.label.length,
      ...input.rows.map((row) => String(formatCell(row[col.key]) ?? '').length)
    );
    return { wch: col.width ?? Math.min(60, Math.max(10, longest + 2)) };
  });

  return ws;
}

export function exportHrReportExcel(input: {
  moduleName: string;
  companyName: string;
  generatedByName: string;
  columns: HrReportColumn[];
  rows: Record<string, unknown>[];
}): void {
  const ws = buildHrWorkbookSheet({
    companyName: input.companyName,
    reportTitle: `${input.moduleName} Report`,
    generatedByName: input.generatedByName,
    columns: input.columns,
    rows: input.rows
  });
  const wb = XLSXStyle.utils.book_new();
  XLSXStyle.utils.book_append_sheet(wb, ws, input.moduleName.slice(0, 31) || 'Report');
  const filename = `SCA_${input.moduleName.replace(/\s+/g, '_')}_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSXStyle.writeFile(wb, filename);
}

export function exportHrReportPdf(input: {
  moduleName: string;
  companyName: string;
  generatedByName: string;
  columns: HrReportColumn[];
  rows: Record<string, unknown>[];
}): void {
  const filename = `SCA_${input.moduleName.replace(/\s+/g, '_')}_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
  const rows = input.rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const col of input.columns) out[col.label] = formatCell(row[col.key]);
    return out;
  });
  downloadPdfReport(
    filename,
    `${input.companyName} — ${input.moduleName} Report`,
    rows,
    [`Generated ${new Date().toLocaleString('en-ZA')} by ${input.generatedByName}`],
    { headerColor: [11, 158, 117] }
  );
}

export function exportHrReport(input: {
  moduleName: string;
  companyName: string;
  generatedByName: string;
  columns: HrReportColumn[];
  rows: Record<string, unknown>[];
  format: 'excel' | 'pdf';
}): void {
  if (input.format === 'excel') exportHrReportExcel(input);
  else exportHrReportPdf(input);
}
