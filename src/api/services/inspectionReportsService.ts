import { insforge } from '../insforge/client';
import type { UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';

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
};

export async function getInspectionRunReport(companyId: UUID, runId: UUID): Promise<InspectionRunReport> {
  const { data: runWithItems, error } = await insforge.database
    .rpc('get_inspection_run_with_items', { p_company_id: companyId, p_run_id: runId })
    .single();
  if (error) throw new Error(getErrorMessage(error));

  const items = (runWithItems.items ?? []) as any[];
  const totalScore = items.reduce((sum, i) => sum + (i.score ?? 0), 0);
  const maxScore = items.reduce((sum, i) => sum + (i.max_score ?? 0), 0);
  const compliancePercent = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

  const findings = items.filter((i) => i.inspection_rating === 'PC' || i.inspection_rating === 'NC');
  const nonConformances = items.filter((i) => i.nonconformance_flag || i.inspection_rating === 'NC');
  const highRiskFindings = items.filter((i) => i.risk_level === 'high');

  return {
    runId,
    inspectionId: runWithItems.run.inspection_id,
    checklistName: runWithItems.run.checklist_name ?? null,
    totalScore,
    maxScore,
    compliancePercent,
    findings,
    nonConformances,
    highRiskFindings
  };
}

