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
  findings: any[];
  nonConformances: any[];
  highRiskFindings: any[];
  evidenceByItemId: Record<string, InspectionItemEvidence[]>;
};

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
    findings,
    nonConformances,
    highRiskFindings,
    evidenceByItemId
  };
}

