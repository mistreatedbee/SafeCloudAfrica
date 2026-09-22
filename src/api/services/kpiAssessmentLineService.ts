import { insforge } from '../insforge/client';
import type { KPIAssessmentLine, KpiImportance, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import { refreshAssessmentOverallScore } from './kpiAssessmentService';

// kpi_assessment_lines has no organization_id/company_id column of its own — it is
// scoped entirely by assessment_id/line_id. organizationId is kept as a parameter on
// every function here (rather than removed) purely to refresh the parent
// kpi_assessments row's score, which IS organization-scoped.

export async function getKPIAssessmentLine(lineId: UUID, _organizationId: UUID): Promise<KPIAssessmentLine | null> {
  const { data, error } = await insforge.database
    .from('kpi_assessment_lines')
    .select('*')
    .eq('line_id', lineId)
    .maybeSingle();
  if (error) throw new Error(getErrorMessage(error));
  return data as KPIAssessmentLine | null;
}

export async function updateKPIAssessmentLine(
  lineId: UUID,
  assessmentId: UUID,
  organizationId: UUID,
  patch: Partial<Pick<KPIAssessmentLine, 'employee_own_rating' | 'manager_rating' | 'notes' | 'importance_rating' | 'kpi_title' | 'kpi_questionnaire'>>
): Promise<KPIAssessmentLine> {
  const nextPatch: Record<string, unknown> = { ...(patch as any) };
  if (typeof patch.kpi_questionnaire === 'string') {
    nextPatch.kpi_title = patch.kpi_questionnaire;
    nextPatch.kpi_questionnaire = patch.kpi_questionnaire;
  }

  const { data, error } = await insforge.database
    .from('kpi_assessment_lines')
    .update({
      ...nextPatch,
      updated_at: new Date().toISOString()
    })
    .eq('line_id', lineId)
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update KPI Questionnaire.');

  await refreshAssessmentOverallScore(assessmentId, organizationId);
  return data as KPIAssessmentLine;
}

export async function addKPIAssessmentLine(
  assessmentId: UUID,
  organizationId: UUID,
  input: {
    kpiItemId?: UUID | null;
    customKpiTitle?: string | null;
    kpiTitle: string;
    importanceRating: KpiImportance;
  }
): Promise<KPIAssessmentLine> {
  const { data, error } = await insforge.database
    .from('kpi_assessment_lines')
    .insert({
      assessment_id: assessmentId,
      kpi_item_id: input.kpiItemId ?? null,
      custom_kpi_title: input.customKpiTitle ?? null,
      kpi_title: input.kpiTitle,
      importance_rating: input.importanceRating
    })
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to add KPI Questionnaire.');
  await refreshAssessmentOverallScore(assessmentId, organizationId);
  return data as KPIAssessmentLine;
}

export async function deleteKPIAssessmentLine(lineId: UUID, assessmentId: UUID, organizationId: UUID): Promise<void> {
  const { error } = await insforge.database
    .from('kpi_assessment_lines')
    .delete()
    .eq('line_id', lineId);
  if (error) throw new Error(getErrorMessage(error));
  await refreshAssessmentOverallScore(assessmentId, organizationId);
}
