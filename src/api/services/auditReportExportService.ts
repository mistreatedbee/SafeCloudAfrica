import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Audit } from '../models/entities';
import type { AuditQuestion, AuditResponse } from './auditsService';
import { drawPdfCoverWithLogo } from './reportExportService';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-ZA');
}

export async function exportAuditDetailPdf(input: {
  audit: Audit;
  questions: AuditQuestion[];
  responses: AuditResponse[];
  companyName: string;
  generatedBy: string;
  logoUrl?: string | null;
}): Promise<Blob> {
  const { audit, questions, responses } = input;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  const responsesByQuestion = new Map<string, AuditResponse>();
  responses.forEach((r) => responsesByQuestion.set(r.audit_question_id, r));

  let totalAllocated = 0;
  let totalAchieved = 0;
  questions.forEach((q) => {
    const alloc = Number(q.allocated_score ?? 0) || 0;
    const resp = responsesByQuestion.get(q.id);
    const achieved = Number(resp?.achieved_score ?? (resp?.is_compliant ? alloc : 0)) || 0;
    totalAllocated += alloc;
    totalAchieved += achieved;
  });
  const compliancePercent = totalAllocated > 0 ? Math.round((totalAchieved / totalAllocated) * 100) : 0;
  const answered = responses.length;
  const compliant = responses.filter((r) => r.is_compliant).length;

  const title = audit.title || audit.objectives || 'Program audit';
  let y = await drawPdfCoverWithLogo(doc, {
    title: 'Audit Report',
    subtitle: `${audit.audit_number ?? ''} — ${title}`.trim(),
    companyName: input.companyName,
    generatedBy: input.generatedBy,
    logoUrl: input.logoUrl
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Audit overview', 40, y);
  y += 16;

  const overviewRows: Array<[string, string]> = [
    ['Audit number', audit.audit_number ?? '—'],
    ['Type', audit.audit_type ?? '—'],
    ['Status', audit.status ?? '—'],
    ['Scheduled date', formatDate(audit.scheduled_date ?? audit.selected_date)],
    ['Scope', audit.scope_of_audit ?? '—'],
    ['Location', audit.location ?? '—'],
    ['Findings', String(audit.findings_count ?? 0)],
    ['Non-conformances', String(audit.nonconformances_count ?? 0)],
    ['Observations', String(audit.observations_count ?? 0)],
    ['Checklist answered', `${answered} / ${questions.length}`],
    ['Compliance score', `${compliancePercent}% (${compliant} compliant responses)`]
  ];

  autoTable(doc, {
    startY: y,
    body: overviewRows,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 4, overflow: 'linebreak' },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 130 },
      1: { cellWidth: pageWidth - 210 }
    }
  });

  y = ((doc as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y) + 24;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Checklist results', 40, y);

  const checklistRows = questions.map((q, idx) => {
    const resp = responsesByQuestion.get(q.id);
    return [
      String(idx + 1),
      String(q.section ?? '—'),
      String(q.question).slice(0, 120),
      resp ? (resp.is_compliant ? 'Yes' : 'No') : '—',
      String((resp as AuditResponse & { deviation_type?: string })?.deviation_type ?? '—'),
      String(q.allocated_score ?? '—'),
      String(resp?.achieved_score ?? '—'),
      String(resp?.risk_rating ?? '—')
    ];
  });

  autoTable(doc, {
    startY: y + 10,
    head: [['#', 'Section', 'Question', 'Compliant', 'Finding', 'Alloc.', 'Achieved', 'Risk']],
    body: checklistRows.length > 0 ? checklistRows : [['—', '—', 'No checklist questions', '—', '—', '—', '—', '—']],
    styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [15, 118, 110], textColor: 255 },
    columnStyles: { 2: { cellWidth: 150 } }
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - 80, doc.internal.pageSize.getHeight() - 20);
  }

  return doc.output('blob');
}
