import { insforge } from '../insforge/client';
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

function normalizeInspectionRunReport(
  input: Partial<InspectionRunReport> & Pick<InspectionRunReport, 'runId' | 'inspectionId'>
): InspectionRunReport {
  return {
    runId: input.runId,
    inspectionId: input.inspectionId,
    checklistName: input.checklistName ?? null,
    totalScore: Number(input.totalScore ?? 0),
    maxScore: Number(input.maxScore ?? 0),
    compliancePercent: Number(input.compliancePercent ?? 0),
    departmentPerformanceScore: Number(input.departmentPerformanceScore ?? 0),
    repeatFindingsCount: Number(input.repeatFindingsCount ?? 0),
    repeatFindingsIndicator: input.repeatFindingsIndicator ?? 'none',
    auditScoreHistory: Array.isArray(input.auditScoreHistory) ? input.auditScoreHistory : [],
    findings: Array.isArray(input.findings) ? input.findings : [],
    nonConformances: Array.isArray(input.nonConformances) ? input.nonConformances : [],
    highRiskFindings: Array.isArray(input.highRiskFindings) ? input.highRiskFindings : [],
    evidenceByItemId: input.evidenceByItemId && typeof input.evidenceByItemId === 'object' ? input.evidenceByItemId : {}
  };
}

export async function getInspectionRunReport(companyId: UUID, runId: UUID): Promise<InspectionRunReport> {
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

  return normalizeInspectionRunReport({
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
  });
}
