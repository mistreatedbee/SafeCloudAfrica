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

export function downloadPdfReport(filename: string, title: string, rows: ReportRow[], metaLines: string[] = []): void {
  const headers = Array.from(rows.reduce((set, row) => {
    Object.keys(row).forEach((key) => set.add(key));
    return set;
  }, new Set<string>()));
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(title, 40, 40);
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
    headStyles: { fillColor: [15, 118, 110], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] }
  });
  doc.save(filename);
}
