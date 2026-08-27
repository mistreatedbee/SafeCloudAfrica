import { insforge } from '../insforge/client';
import { withInsforgeSession } from '../insforge/ensureSession';
import type { UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import type { InspectionItemEvidence } from './inspectionEvidenceService';

export type InspectionRunReport = {
  runId: UUID;
  inspectionId: UUID;
  checklistName: string | null;
  totalScore: number;
  maxScore: number;
  compliancePercent: number;
  departmentPerformanceScore: number;
  repeatFindingsCount: number;
  repeatFindingsIndicator: 'none' | 'low' | 'high';
  auditScoreHistory: Array<{ runId: UUID; completedAt: string | null; compliancePercent: number }>;
  findings: any[];
  nonConformances: any[];
  highRiskFindings: any[];
  evidenceByItemId: Record<string, InspectionItemEvidence[]>;
};

export async function getInspectionRunReport(companyId: UUID, runId: UUID): Promise<InspectionRunReport> {
  return withInsforgeSession('inspection_run_report:get', async () => {
  const { data: runData, error: runError } = await insforge.database
    .from('inspection_runs')
    .select('*')
    .eq('company_id', companyId)
    .eq('id', runId)
    .single();
  if (runError) throw new Error(getErrorMessage(runError));

  const { data: itemsData, error: itemsError } = await insforge.database
    .from('inspection_run_items')
    .select('*')
    .eq('company_id', companyId)
    .eq('run_id', runId)
    .order('item_order', { ascending: true });
  if (itemsError) throw new Error(getErrorMessage(itemsError));

  const items = (itemsData ?? []) as any[];
  const totalScore = items.reduce((sum, i) => sum + (i.score ?? 0), 0);
  const maxScore = items.reduce((sum, i) => sum + (i.max_score ?? 0), 0);
  const compliancePercent = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

  const findings = items.filter((i) => i.inspection_rating === 'PC' || i.inspection_rating === 'NC');
  const nonConformances = items.filter((i) => i.nonconformance_flag || i.inspection_rating === 'NC');
  const highRiskFindings = items.filter((i) => i.risk_level === 'high');
  const completedItems = items.filter((i) => i.status === 'closed').length;
  const completionPercent = items.length > 0 ? (completedItems / items.length) * 100 : 0;
  const departmentPerformanceScore = Math.max(0, Math.round((compliancePercent * 0.7) + (completionPercent * 0.3)));

  const fingerprints = Array.from(
    new Set(items.map((i) => String(i.question_fingerprint ?? '').trim()).filter(Boolean))
  );
  let repeatFindingsCount = 0;
  if (fingerprints.length > 0) {
    const { data: priorRunsData, error: priorRunsError } = await insforge.database
      .from('inspection_runs')
      .select('id')
      .eq('company_id', companyId)
      .eq('template_id', (runData as any).template_id)
      .neq('id', runId);
    if (priorRunsError) throw new Error(getErrorMessage(priorRunsError));
    const priorRunIds = (priorRunsData ?? []).map((r: any) => r.id);
    if (priorRunIds.length > 0) {
      const { data: repeatNcData, error: repeatNcError } = await insforge.database
        .from('inspection_run_items')
        .select('question_fingerprint')
        .eq('company_id', companyId)
        .in('run_id', priorRunIds)
        .eq('inspection_rating', 'NC')
        .in('question_fingerprint', fingerprints);
      if (repeatNcError) throw new Error(getErrorMessage(repeatNcError));
      repeatFindingsCount = new Set((repeatNcData ?? []).map((r: any) => String(r.question_fingerprint))).size;
    }
  }
  const repeatFindingsIndicator: 'none' | 'low' | 'high' =
    repeatFindingsCount === 0 ? 'none' : repeatFindingsCount >= 3 ? 'high' : 'low';

  const { data: historyRunsData, error: historyRunsError } = await insforge.database
    .from('inspection_runs')
    .select('id, completed_at')
    .eq('company_id', companyId)
    .eq('inspection_id', (runData as any).inspection_id)
    .order('run_number', { ascending: true });
  if (historyRunsError) throw new Error(getErrorMessage(historyRunsError));
  const historyRunIds = (historyRunsData ?? []).map((r: any) => r.id);
  let auditScoreHistory: Array<{ runId: UUID; completedAt: string | null; compliancePercent: number }> = [];
  if (historyRunIds.length > 0) {
    const { data: historyItemsData, error: historyItemsError } = await insforge.database
      .from('inspection_run_items')
      .select('run_id, score, max_score')
      .eq('company_id', companyId)
      .in('run_id', historyRunIds);
    if (historyItemsError) throw new Error(getErrorMessage(historyItemsError));
    const byRun = new Map<string, { score: number; maxScore: number }>();
    for (const row of historyItemsData ?? []) {
      const key = String((row as any).run_id);
      const curr = byRun.get(key) ?? { score: 0, maxScore: 0 };
      curr.score += Number((row as any).score ?? 0);
      curr.maxScore += Number((row as any).max_score ?? 0);
      byRun.set(key, curr);
    }
    auditScoreHistory = (historyRunsData ?? []).map((run: any) => {
      const agg = byRun.get(String(run.id)) ?? { score: 0, maxScore: 0 };
      const pct = agg.maxScore > 0 ? (agg.score / agg.maxScore) * 100 : 0;
      return {
        runId: run.id as UUID,
        completedAt: run.completed_at as string | null,
        compliancePercent: pct
      };
    });
  }

  const itemIds = items.map((i) => i.id).filter(Boolean);
  let evidenceByItemId: Record<string, InspectionItemEvidence[]> = {};
  if (itemIds.length > 0) {
    const { data: evidenceData, error: evError } = await insforge.database
      .from('inspection_item_evidence')
      .select('*')
      .eq('company_id', companyId)
      .in('run_item_id', itemIds);
    if (evError) throw new Error(getErrorMessage(evError));
    const evidences = (evidenceData ?? []) as any[];
    evidenceByItemId = evidences.reduce((acc: Record<string, InspectionItemEvidence[]>, ev: any) => {
      const key = ev.run_item_id as string;
      if (!acc[key]) acc[key] = [];
      acc[key].push(ev as InspectionItemEvidence);
      return acc;
    }, {});
  }

  return {
    runId,
    inspectionId: (runData as any).inspection_id as UUID,
    checklistName: (runData as any).checklist_name ?? null,
    totalScore,
    maxScore,
    compliancePercent,
    departmentPerformanceScore,
    repeatFindingsCount,
    repeatFindingsIndicator,
    auditScoreHistory,
    findings,
    nonConformances,
    highRiskFindings,
    evidenceByItemId
  };
  });
}

export async function exportInspectionRunPdf(
  report: InspectionRunReport,
  options: { title?: string; companyName?: string; generatedBy?: string; logoUrl?: string | null } = {}
): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const { drawPdfCoverWithLogo } = await import('./reportExportService');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const title = options.title ?? 'Inspection Report';

  let y = await drawPdfCoverWithLogo(doc, {
    title,
    subtitle: report.checklistName ? `Checklist: ${report.checklistName}` : undefined,
    companyName: options.companyName,
    generatedBy: options.generatedBy,
    logoUrl: options.logoUrl
  });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Score summary', 40, y);
  y += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const summaryLines = [
    `Total score: ${report.totalScore} / ${report.maxScore} (${report.compliancePercent.toFixed(1)}% compliant)`,
    `Department performance: ${report.departmentPerformanceScore}%`,
    `Repeat findings: ${report.repeatFindingsCount} (${report.repeatFindingsIndicator})`,
    `Non-conformances: ${report.nonConformances.length}`,
    `High-risk items: ${report.highRiskFindings.length}`
  ];
  summaryLines.forEach((line) => {
    doc.text(line, 40, y);
    y += 14;
  });

  const itemRows = report.findings.map((item: any, idx: number) => [
    String(idx + 1),
    String(item.audit_section_or_category || item.section || '—'),
    String(item.question ?? '').slice(0, 80),
    String(item.inspection_rating ?? '—'),
    String(item.risk_level ?? '—')
  ]);

  autoTable(doc, {
    startY: y + 10,
    head: [['#', 'Category', 'Question', 'Rating', 'Risk']],
    body: itemRows.length > 0 ? itemRows : [['—', '—', 'No findings recorded', '—', '—']],
    styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
    headStyles: { fillColor: [15, 118, 110], textColor: 255 },
    columnStyles: { 2: { cellWidth: 180 } }
  });

  const finalY = (doc as any).lastAutoTable?.finalY ?? y + 40;
  if (report.auditScoreHistory.length > 0) {
    autoTable(doc, {
      startY: finalY + 20,
      head: [['Run', 'Completed', 'Compliance %']],
      body: report.auditScoreHistory.map((h) => [
        String(h.runId).slice(0, 8),
        h.completedAt ? new Date(h.completedAt).toLocaleDateString('en-ZA') : '—',
        `${h.compliancePercent.toFixed(1)}%`
      ]),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [30, 64, 175], textColor: 255 }
    });
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
