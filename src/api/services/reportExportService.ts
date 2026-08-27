import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toCsv } from '../../utils/csv';

export type ReportRow = Record<string, unknown>;

export type WorkbookSheet = {
  name: string;
  rows: ReportRow[];
};

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadWorkbook(filename: string, sheets: WorkbookSheet[]): void {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const worksheet = XLSX.utils.json_to_sheet(sheet.rows.length > 0 ? sheet.rows : [{ message: 'No records found' }]);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31) || 'Report');
  }
  XLSX.writeFile(workbook, filename);
}

export function downloadCsvReport(filename: string, rows: ReportRow[], metaLines: string[] = []): void {
  const csv = rows.length > 0 ? toCsv(rows) : 'message\r\n"No records found"';
  const content = `${metaLines.join('\r\n')}\r\n${csv}`;
  downloadBlob(filename, new Blob([content], { type: 'text/csv;charset=utf-8' }));
}

export async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function drawPdfCoverWithLogo(
  doc: import('jspdf').jsPDF,
  options: {
    title: string;
    subtitle?: string;
    companyName?: string;
    generatedBy?: string;
    logoUrl?: string | null;
    bandHeight?: number;
  }
): Promise<number> {
  const pageWidth = doc.internal.pageSize.getWidth();
  const bandHeight = options.bandHeight ?? 90;
  let titleX = 40;

  doc.setFillColor(15, 118, 110);
  doc.rect(0, 0, pageWidth, bandHeight, 'F');

  if (options.logoUrl) {
    const dataUrl = await fetchImageAsDataUrl(options.logoUrl);
    if (dataUrl) {
      try {
        doc.addImage(dataUrl, 40, 16, 52, 52, undefined, 'FAST');
        titleX = 104;
      } catch {
        // Report still generates without the logo.
      }
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(options.title, titleX, 38);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  if (options.companyName) doc.text(options.companyName, titleX, 54);
  if (options.subtitle) doc.text(options.subtitle, titleX, 68);
  const generatedAt = new Date().toLocaleString('en-ZA');
  doc.text(`Generated: ${generatedAt}`, pageWidth - 40, 34, { align: 'right' });
  if (options.generatedBy) doc.text(`By: ${options.generatedBy}`, pageWidth - 40, 48, { align: 'right' });

  doc.setTextColor(30, 41, 59);
  return bandHeight + 20;
}

export async function downloadPdfReport(
  filename: string,
  title: string,
  rows: ReportRow[],
  metaLines: string[] = [],
  options: { headerColor?: [number, number, number]; logoUrl?: string | null } = {}
): Promise<void> {
  const headers = Array.from(rows.reduce((set, row) => {
    Object.keys(row).forEach((key) => set.add(key));
    return set;
  }, new Set<string>()));
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  let titleX = 40;
  if (options.logoUrl) {
    const dataUrl = await fetchImageAsDataUrl(options.logoUrl);
    if (dataUrl) {
      try {
        doc.addImage(dataUrl, 40, 20, 60, 30, undefined, 'FAST');
        titleX = 112;
      } catch {
        // Ignore unsupported image formats — report still generates without the logo.
      }
    }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(title, titleX, 40);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  metaLines.filter(Boolean).slice(0, 6).forEach((line, index) => doc.text(String(line), 40, 58 + index * 12));

  autoTable(doc, {
    startY: 140,
    head: [headers.length > 0 ? headers : ['Message']],
    body: rows.length > 0
      ? rows.map((row) => headers.map((header) => String(row[header] ?? '')))
      : [['No records found']],
    styles: { fontSize: 7, cellPadding: 4, overflow: 'linebreak' },
    headStyles: { fillColor: options.headerColor ?? [15, 118, 110], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] }
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Page ${page} of ${pageCount}`, doc.internal.pageSize.getWidth() - 100, doc.internal.pageSize.getHeight() - 20);
  }
  doc.save(filename);
}
