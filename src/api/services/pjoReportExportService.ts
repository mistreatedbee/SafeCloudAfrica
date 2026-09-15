import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { PjoObservation, PjoResponse } from '../models/entities';
import { drawPdfCoverWithLogo, fetchImageAsDataUrl } from './reportExportService';
import { downloadStyledExcelWorkbook, type ExcelSheetSpec } from './excelExportService';
import { getPublicUrl, type StorageBucket } from './storageService';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-ZA');
}

function answerLabel(r: PjoResponse): string {
  if (r.yes_no !== null && r.yes_no !== undefined) return r.yes_no ? 'Yes' : 'No';
  if (r.rating !== null && r.rating !== undefined) return String(r.rating);
  return '—';
}

function needsNcr(r: PjoResponse): boolean {
  const hasDeviation = Boolean(r.deviation && r.deviation.trim().length > 0);
  return r.yes_no === false || r.rating === 1 || hasDeviation;
}

function safeFileNamePart(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'PJO';
}

export async function exportPjoDetailPdf(input: {
  pjo: PjoObservation;
  responses: PjoResponse[];
  companyName: string;
  generatedBy: string;
  logoUrl?: string | null;
}): Promise<Blob> {
  const { pjo, responses } = input;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  let y = await drawPdfCoverWithLogo(doc, {
    title: 'Pre-Job Observation Report',
    subtitle: pjo.employee_name,
    companyName: input.companyName,
    generatedBy: input.generatedBy,
    logoUrl: input.logoUrl
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Observation details', 40, y);
  y += 16;

  const flagged = responses.filter(needsNcr).length;
  const overviewRows: Array<[string, string]> = [
    ['Employee', pjo.employee_name],
    ['Employee number', pjo.employee_number ?? '—'],
    ['Job title', pjo.job_title ?? '—'],
    ['Department', pjo.department ?? '—'],
    ['Site', pjo.site ?? '—'],
    ['Date of PJO', formatDate(pjo.observed_at)],
    ['Reason', pjo.reason],
    ['Job observed', pjo.job_observed],
    ['Observer / Supervisor', pjo.observer_name ?? '—'],
    ['Status', pjo.status],
    ['Total questions', String(responses.length)],
    ['Findings / concerns flagged', String(flagged)]
  ];

  autoTable(doc, {
    startY: y,
    body: overviewRows,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 4, overflow: 'linebreak' },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 140 },
      1: { cellWidth: pageWidth - 220 }
    }
  });

  y = ((doc as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y) + 24;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Checklist', 40, y);

  const checklistRows = responses.map((r) => [
    String(r.question_no),
    String(r.question_text).slice(0, 90),
    answerLabel(r),
    String(r.deviation ?? '—').slice(0, 60),
    r.evidence_file_name ? 'Yes' : 'No'
  ]);

  autoTable(doc, {
    startY: y + 10,
    head: [['#', 'Question', 'Answer', 'Deviation / Comments', 'Evidence']],
    body: checklistRows.length > 0 ? checklistRows : [['—', 'No checklist responses', '—', '—', '—']],
    styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [15, 118, 110], textColor: 255 },
    columnStyles: { 1: { cellWidth: 180 }, 3: { cellWidth: 140 } }
  });

  // Evidence appendix: thumbnail any image evidence attached to responses.
  const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
  const isImage = (name: string | null | undefined) =>
    Boolean(name && IMAGE_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext)));
  const withImages = responses.filter((r) => r.evidence_bucket && r.evidence_key && isImage(r.evidence_file_name));

  if (withImages.length > 0) {
    doc.addPage();
    let ey = 40;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Evidence', 40, ey);
    ey += 20;

    const thumbSize = 100;
    const maxPerRow = 4;
    const gap = 16;
    let col = 0;
    for (const r of withImages.slice(0, 24)) {
      const url = getPublicUrl(r.evidence_bucket as StorageBucket, r.evidence_key as string);
      const dataUrl = await fetchImageAsDataUrl(url);
      if (!dataUrl) continue;
      const x = 40 + col * (thumbSize + gap);
      if (ey + thumbSize + 20 > doc.internal.pageSize.getHeight() - 40) {
        doc.addPage();
        ey = 40;
      }
      try {
        doc.addImage(dataUrl, x, ey, thumbSize, thumbSize, undefined, 'FAST');
      } catch {
        continue;
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(`Q${r.question_no}: ${(r.evidence_file_name ?? '').slice(0, 20)}`, x, ey + thumbSize + 10);
      col += 1;
      if (col >= maxPerRow) {
        col = 0;
        ey += thumbSize + 26;
      }
    }
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - 80, doc.internal.pageSize.getHeight() - 20);
  }

  return doc.output('blob');
}

export function pjoDetailPdfFileName(pjo: PjoObservation): string {
  const date = pjo.observed_at ?? new Date().toISOString().slice(0, 10);
  return `SCA_PJO_${safeFileNamePart(pjo.employee_name)}_${date}.pdf`;
}

export async function exportPjoListExcel(input: {
  pjos: PjoObservation[];
  responsesByPjoId: Map<string, PjoResponse[]>;
  companyName: string;
  generatedBy: string;
  dateFrom: string;
  dateTo: string;
}): Promise<void> {
  const { pjos, responsesByPjoId } = input;

  // Build the union of questions (by question_no, using the most recent
  // question_text seen) across all included PJOs, in question_no order.
  const questionByNo = new Map<number, string>();
  for (const pjo of pjos) {
    for (const r of responsesByPjoId.get(pjo.id) ?? []) {
      questionByNo.set(r.question_no, r.question_text);
    }
  }
  const questionNumbers = Array.from(questionByNo.keys()).sort((a, b) => a - b);

  const columns: ExcelSheetSpec['columns'] = [
    { header: 'Employee', width: 22 },
    { header: 'Employee No', width: 14 },
    { header: 'Job Title', width: 20 },
    { header: 'Department', width: 18 },
    { header: 'PJO Date', width: 12 },
    { header: 'Observer', width: 20 },
    ...questionNumbers.map((no) => ({ header: `Q${no}: ${(questionByNo.get(no) ?? '').slice(0, 40)}`, width: 18 })),
    { header: 'Evidence (Y/N)', width: 14 }
  ];

  const rows = pjos.map((pjo) => {
    const responses = responsesByPjoId.get(pjo.id) ?? [];
    const responseByNo = new Map(responses.map((r) => [r.question_no, r]));
    const hasEvidence = responses.some((r) => r.evidence_file_name);
    return [
      pjo.employee_name,
      pjo.employee_number ?? '',
      pjo.job_title ?? '',
      pjo.department ?? '',
      pjo.observed_at,
      pjo.observer_name ?? '',
      ...questionNumbers.map((no) => {
        const r = responseByNo.get(no);
        return r ? answerLabel(r) : '';
      }),
      hasEvidence ? 'Y' : 'N'
    ];
  });

  const dateTag = (d: string) => d || 'all';
  const sheet: ExcelSheetSpec = {
    name: 'PJO Report',
    titleLines: [
      `${input.companyName} — PJO Report`,
      `Date range: ${input.dateFrom || 'earliest'} to ${input.dateTo || 'latest'} · Generated: ${new Date().toLocaleString('en-ZA')} · By: ${input.generatedBy}`
    ],
    columns,
    rows,
    totalsRow: [`Total PJOs: ${pjos.length}`, ...new Array(columns.length - 1).fill('')]
  };

  await downloadStyledExcelWorkbook(
    [sheet],
    `SCA_PJO_Report_${dateTag(input.dateFrom)}_${dateTag(input.dateTo)}.xlsx`
  );
}
