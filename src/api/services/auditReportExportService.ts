import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Audit } from '../models/entities';
import type { AuditQuestion, AuditResponse } from './auditsService';
import { drawPdfCoverWithLogo } from './reportExportService';
import { downloadStyledExcelWorkbook, type ExcelSheetSpec } from './excelExportService';

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
  const complianceCounts = { C: 0, NC: 0, Obs: 0, 'N/A': 0 } as Record<string, number>;
  for (const r of responses) {
    const status = (r as any).compliance_status as string | undefined;
    if (status && status in complianceCounts) complianceCounts[status] += 1;
  }

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
    ['Compliance score', `${compliancePercent}% (${totalAchieved}/${totalAllocated})`],
    ['C / NC / Obs / N-A', `${complianceCounts.C} / ${complianceCounts.NC} / ${complianceCounts.Obs} / ${complianceCounts['N/A']}`]
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
      String((resp as any)?.compliance_status ?? (resp ? (resp.is_compliant ? 'C' : 'NC') : '—')),
      String(q.allocated_score ?? '—'),
      String(resp?.achieved_score ?? '—'),
      String(resp?.risk_rating ?? '—'),
      String(resp?.finding ?? '—').slice(0, 80)
    ];
  });

  autoTable(doc, {
    startY: y + 10,
    head: [['#', 'Section', 'Question', 'Compliance', 'Alloc.', 'Achieved', 'Risk', 'Comments/Findings']],
    body: checklistRows.length > 0 ? checklistRows : [['—', '—', 'No checklist questions', '—', '—', '—', '—', '—']],
    styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [15, 118, 110], textColor: 255 },
    columnStyles: { 2: { cellWidth: 130 }, 7: { cellWidth: 100 } }
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

export async function exportAuditDetailExcel(input: {
  audit: Audit;
  questions: AuditQuestion[];
  responses: AuditResponse[];
}): Promise<void> {
  const { audit, questions, responses } = input;
  const responsesByQuestion = new Map<string, AuditResponse>();
  responses.forEach((r) => responsesByQuestion.set(r.audit_question_id, r));

  let totalAllocated = 0;
  let totalAchieved = 0;
  const complianceCounts = { C: 0, NC: 0, Obs: 0, 'N/A': 0 } as Record<string, number>;
  questions.forEach((q) => {
    const alloc = Number(q.allocated_score ?? 0) || 0;
    const resp = responsesByQuestion.get(q.id);
    const achieved = Number(resp?.achieved_score ?? (resp?.is_compliant ? alloc : 0)) || 0;
    totalAllocated += alloc;
    totalAchieved += achieved;
    const status = (resp as any)?.compliance_status as string | undefined;
    if (status && status in complianceCounts) complianceCounts[status] += 1;
  });
  const compliancePercent = totalAllocated > 0 ? Math.round((totalAchieved / totalAllocated) * 1000) / 10 : 0;
  const title = audit.title || audit.objectives || 'Audit';

  const summarySheet: ExcelSheetSpec = {
    name: 'Summary',
    titleLines: [`Audit Report — ${title}`, audit.audit_number ?? ''],
    columns: [{ header: 'Field', width: 24 }, { header: 'Value', width: 40 }],
    rows: [
      ['Audit number', audit.audit_number ?? '—'],
      ['Type', audit.audit_type ?? '—'],
      ['Status', audit.status ?? '—'],
      ['Scope', audit.scope_of_audit ?? '—'],
      ['Location', audit.location ?? '—'],
      ['Overall score', `${compliancePercent}%`],
      ['Achieved / Allocated', `${totalAchieved} / ${totalAllocated}`],
      ['Conforming (C)', complianceCounts.C],
      ['Non-conformities (NC)', complianceCounts.NC],
      ['Observations (Obs)', complianceCounts.Obs],
      ['Not applicable (N/A)', complianceCounts['N/A']]
    ]
  };

  const checklistSheet: ExcelSheetSpec = {
    name: 'Checklist',
    titleLines: [`Checklist — ${title}`],
    columns: [
      { header: '#', width: 6 },
      { header: 'Section', width: 20 },
      { header: 'Question', width: 40 },
      { header: 'Evidence reviewed', width: 30 },
      { header: 'Compliance', width: 12 },
      { header: 'Allocated', width: 10 },
      { header: 'Achieved', width: 10 },
      { header: 'Risk', width: 10 },
      { header: 'Comments / Findings', width: 40 }
    ],
    rows: questions.map((q, idx) => {
      const resp = responsesByQuestion.get(q.id);
      return [
        idx + 1,
        q.section ?? '—',
        q.question,
        q.expected_evidence ?? '—',
        (resp as any)?.compliance_status ?? (resp ? (resp.is_compliant ? 'C' : 'NC') : '—'),
        q.allocated_score ?? null,
        resp?.achieved_score ?? null,
        resp?.risk_rating ?? '—',
        resp?.finding ?? '—'
      ];
    })
  };

  const dateTag = new Date().toISOString().slice(0, 10);
  await downloadStyledExcelWorkbook(
    [summarySheet, checklistSheet],
    `SCA_Audit_${(audit.title ?? audit.audit_number ?? 'audit').replace(/\s+/g, '_')}_${dateTag}.xlsx`
  );
}
