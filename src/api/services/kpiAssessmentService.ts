import { insforge } from '../insforge/client';
import type {
  KPIAssessment,
  KPIAssessmentLine,
  KpiAssessmentStatus,
  KpiAssessmentType,
  KpiImportance,
  KpiPeriodType,
  UUID
} from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';

const IMPORTANCE_WEIGHT: Record<KpiImportance, number> = { low: 1, medium: 1.5, high: 2 };

export function getOverallRatingBand(score: number): string {
  if (score >= 5) return 'Exceptional';
  if (score >= 4) return 'Exceeds';
  if (score >= 3) return 'Meets expectations';
  if (score >= 2) return 'Improvement needed';
  return 'Unsatisfactory';
}

export function computeOverallScore(lines: { manager_rating: number | null; importance_rating: KpiImportance }[]): number | null {
  const withRating = lines.filter((l) => l.manager_rating != null);
  if (withRating.length === 0) return null;
  let sumWeighted = 0;
  let sumWeight = 0;
  for (const l of withRating) {
    const w = IMPORTANCE_WEIGHT[l.importance_rating] ?? 1;
    sumWeighted += (l.manager_rating ?? 0) * w;
    sumWeight += w;
  }
  if (sumWeight === 0) return null;
  return Math.round((sumWeighted / sumWeight) * 100) / 100;
}

export type CreateKPIAssessmentInput = {
  organizationId: UUID;
  assessmentType: KpiAssessmentType;
  employeeId?: UUID | null;
  employeeNameSnapshot?: string | null;
  managerId: UUID;
  managerNameSnapshot: string | null;
  projectId?: UUID | null;
  projectName?: string | null;
  departmentId?: UUID | null;
  siteId?: UUID | null;
  periodType: KpiPeriodType;
  periodStartDate: string;
  periodEndDate: string;
  createdByUserId: UUID;
  lines: Array<{
    kpiItemId?: UUID | null;
    customKpiTitle?: string | null;
    kpiTitle: string;
    importanceRating: KpiImportance;
  }>;
};

export async function createKPIAssessment(input: CreateKPIAssessmentInput): Promise<KPIAssessment> {
  const { data: assessment, error: errAssess } = await insforge.database
    .from('kpi_assessments')
    .insert({
      organization_id: input.organizationId,
      assessment_type: input.assessmentType,
      employee_id: input.employeeId ?? null,
      employee_name_snapshot: input.employeeNameSnapshot ?? null,
      manager_id: input.managerId,
      manager_name_snapshot: input.managerNameSnapshot ?? null,
      project_id: input.projectId ?? null,
      project_name: input.projectName ?? null,
      department_id: input.departmentId ?? null,
      site_id: input.siteId ?? null,
      period_type: input.periodType,
      period_start_date: input.periodStartDate,
      period_end_date: input.periodEndDate,
      status: 'draft',
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();

  if (errAssess) throw new Error(getErrorMessage(errAssess));
  if (!assessment) throw new Error('Failed to create KPI assessment.');

  const assessmentId = (assessment as KPIAssessment).assessment_id;

  if (input.lines.length > 0) {
    const lineRows = input.lines.map((l) => ({
      assessment_id: assessmentId,
      kpi_item_id: l.kpiItemId ?? null,
      custom_kpi_title: l.customKpiTitle ?? null,
      kpi_title: l.kpiTitle,
      importance_rating: l.importanceRating
    }));
    const { error: errLines } = await insforge.database.from('kpi_assessment_lines').insert(lineRows);
    if (errLines) throw new Error(getErrorMessage(errLines));
  }

  await createActivityLog({
    companyId: input.organizationId,
    actorUserId: input.createdByUserId,
    action: 'kpi_assessments.create',
    entityType: 'kpi_assessment',
    entityId: assessmentId
  });

  await refreshAssessmentOverallScore(assessmentId, input.organizationId);
  const out = await getKPIAssessment(assessmentId, input.organizationId);
  if (!out) throw new Error('Failed to load created assessment.');
  return out;
}

export async function getKPIAssessment(assessmentId: UUID, organizationId: UUID): Promise<KPIAssessment | null> {
  const { data, error } = await insforge.database
    .from('kpi_assessments')
    .select('*')
    .eq('assessment_id', assessmentId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw new Error(getErrorMessage(error));
  return data as KPIAssessment | null;
}

export async function listKPIAssessmentLines(assessmentId: UUID): Promise<KPIAssessmentLine[]> {
  const { data, error } = await insforge.database
    .from('kpi_assessment_lines')
    .select('*')
    .eq('assessment_id', assessmentId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as KPIAssessmentLine[];
}

export async function refreshAssessmentOverallScore(assessmentId: UUID, organizationId: UUID): Promise<void> {
  const lines = await listKPIAssessmentLines(assessmentId);
  const score = computeOverallScore(lines);
  const band = score != null ? getOverallRatingBand(score) : null;
  const { error } = await insforge.database
    .from('kpi_assessments')
    .update({
      overall_score: score,
      overall_rating_band: band,
      updated_at: new Date().toISOString()
    })
    .eq('assessment_id', assessmentId)
    .eq('organization_id', organizationId);
  if (error) throw new Error(getErrorMessage(error));
}

export type ListKPIAssessmentsFilters = {
  organizationId: UUID;
  assessmentType?: KpiAssessmentType;
  employeeId?: UUID;
  managerId?: UUID;
  departmentId?: UUID;
  status?: KpiAssessmentStatus;
  periodFrom?: string;
  periodTo?: string;
  scoreMin?: number;
  scoreMax?: number;
  search?: string;
  limit?: number;
};

export async function listKPIAssessments(filters: ListKPIAssessmentsFilters): Promise<KPIAssessment[]> {
  let query = insforge.database
    .from('kpi_assessments')
    .select('*')
    .eq('organization_id', filters.organizationId);

  if (filters.assessmentType) query = query.eq('assessment_type', filters.assessmentType);
  if (filters.employeeId) query = query.eq('employee_id', filters.employeeId);
  if (filters.managerId) query = query.eq('manager_id', filters.managerId);
  if (filters.departmentId) query = query.eq('department_id', filters.departmentId);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.periodFrom) query = query.gte('period_end_date', filters.periodFrom);
  if (filters.periodTo) query = query.lte('period_start_date', filters.periodTo);
  if (filters.scoreMin != null) query = query.gte('overall_score', filters.scoreMin);
  if (filters.scoreMax != null) query = query.lte('overall_score', filters.scoreMax);

  const limit = filters.limit ?? 200;
  const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(getErrorMessage(error));
  let result = (data ?? []) as KPIAssessment[];
  if (filters.search?.trim()) {
    const term = filters.search.trim().toLowerCase();
    result = result.filter(
      (a) =>
        (a.employee_name_snapshot?.toLowerCase().includes(term)) ||
        (a.manager_name_snapshot?.toLowerCase().includes(term)) ||
        (a.project_name?.toLowerCase().includes(term))
    );
  }
  return result;
}

export async function updateKPIAssessment(
  assessmentId: UUID,
  organizationId: UUID,
  patch: Partial<Pick<KPIAssessment, 'status' | 'employee_comments' | 'manager_remarks' | 'employee_name_snapshot' | 'manager_name_snapshot'>>,
  actorUserId: UUID
): Promise<KPIAssessment> {
  const { data, error } = await insforge.database
    .from('kpi_assessments')
    .update({
      ...(patch as any),
      updated_at: new Date().toISOString()
    })
    .eq('assessment_id', assessmentId)
    .eq('organization_id', organizationId)
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update KPI assessment.');

  await createActivityLog({
    companyId: organizationId,
    actorUserId,
    action: 'kpi_assessments.update',
    entityType: 'kpi_assessment',
    entityId: assessmentId
  });

  return data as KPIAssessment;
}
