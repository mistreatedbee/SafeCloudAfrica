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

function getImportanceWeight(importance: KpiImportance): number {
  return IMPORTANCE_WEIGHT[importance] ?? 1;
}

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

export function computeAchievementPercentage(lines: { manager_rating: number | null; importance_rating: KpiImportance }[]): number | null {
  const withRating = lines.filter((l) => l.manager_rating != null);
  if (withRating.length === 0) return null;
  let weightedSum = 0;
  let weightedMax = 0;
  for (const l of withRating) {
    const w = getImportanceWeight(l.importance_rating);
    weightedSum += (l.manager_rating ?? 0) * w;
    weightedMax += 5 * w;
  }
  if (weightedMax === 0) return null;
  return Math.round((weightedSum / weightedMax) * 10000) / 100;
}

export function normalizeAssessmentStatus(status: KpiAssessmentStatus): Exclude<KpiAssessmentStatus, 'submitted' | 'finalized'> {
  if (status === 'submitted') return 'in_progress';
  if (status === 'finalized') return 'completed';
  return status;
}

function canTransitionStatus(current: KpiAssessmentStatus, next: KpiAssessmentStatus): boolean {
  const from = normalizeAssessmentStatus(current);
  const to = normalizeAssessmentStatus(next);
  const transitions: Record<Exclude<KpiAssessmentStatus, 'submitted' | 'finalized'>, Array<Exclude<KpiAssessmentStatus, 'submitted' | 'finalized'>>> = {
    draft: ['in_progress'],
    in_progress: ['under_review'],
    under_review: ['completed'],
    completed: ['closed'],
    closed: []
  };
  return from === to || transitions[from].includes(to);
}

export type CreateKPIAssessmentInput = {
  organizationId: UUID;
  assessmentName?: string;
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
  lines?: Array<{
    kpiItemId?: UUID | null;
    customKpiTitle?: string | null;
    kpiTitle: string;
    importanceRating: KpiImportance;
  }>;
  questionnaires?: Array<{
    kpiItemId?: UUID | null;
    customKpiTitle?: string | null;
    kpiTitle: string;
    importanceRating: KpiImportance;
  }>;
};

export async function createKPIAssessment(input: CreateKPIAssessmentInput): Promise<KPIAssessment> {
  const assessmentName =
    input.assessmentName?.trim() ||
    (input.assessmentType === 'employee'
      ? `${input.employeeNameSnapshot ?? 'Employee'} ${input.periodType} KPI Assessment`
      : `${input.projectName ?? 'Project'} ${input.periodType} KPI Assessment`);

  const { data: assessment, error: errAssess } = await insforge.database
    .from('kpi_assessments')
    .insert({
      organization_id: input.organizationId,
      assessment_name: assessmentName,
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
  const questionnaires = input.questionnaires ?? input.lines ?? [];

  if (questionnaires.length > 0) {
    const lineRows = questionnaires.map((l) => ({
      assessment_id: assessmentId,
      kpi_item_id: l.kpiItemId ?? null,
      custom_kpi_title: l.customKpiTitle ?? null,
      kpi_title: l.kpiTitle,
      kpi_questionnaire: l.kpiTitle,
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

export type UpsertKPIAssessmentDraftInput = {
  organizationId: UUID;
  actorUserId: UUID;
  assessmentId?: UUID | null;
  assessmentName: string;
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
  questionnaires?: Array<{
    kpiItemId?: UUID | null;
    customKpiTitle?: string | null;
    kpiTitle: string;
    importanceRating: KpiImportance;
  }>;
};

/**
 * Server-side draft persistence for autosave.
 * - Creates KPI assessment with `status = draft` if it doesn't exist yet.
 * - Otherwise updates the assessment fields and replaces KPI assessment lines.
 *
 * Best-effort callers should swallow errors to keep local drafts the source of truth.
 */
export async function upsertKPIAssessmentDraft(input: UpsertKPIAssessmentDraftInput): Promise<KPIAssessment> {
  const organizationId = input.organizationId;
  const actorUserId = input.actorUserId;
  const assessmentId = input.assessmentId ?? null;

  const questionnaires = input.questionnaires ?? [];

  if (!assessmentId) {
    return createKPIAssessment({
      organizationId,
      assessmentName: input.assessmentName,
      assessmentType: input.assessmentType,
      employeeId: input.employeeId ?? null,
      employeeNameSnapshot: input.employeeNameSnapshot ?? null,
      managerId: input.managerId,
      managerNameSnapshot: input.managerNameSnapshot,
      projectId: input.projectId ?? null,
      projectName: input.projectName ?? null,
      departmentId: input.departmentId ?? null,
      siteId: input.siteId ?? null,
      periodType: input.periodType,
      periodStartDate: input.periodStartDate,
      periodEndDate: input.periodEndDate,
      createdByUserId: actorUserId,
      questionnaires
    });
  }

  const patch: Record<string, unknown> = {
    assessment_name: input.assessmentName.trim(),
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
    updated_at: new Date().toISOString()
  };

  const { error: updateError } = await insforge.database
    .from('kpi_assessments')
    .update(patch)
    .eq('assessment_id', assessmentId)
    .eq('organization_id', organizationId);

  if (updateError) throw new Error(getErrorMessage(updateError));

  // Replace KPI assessment lines to match the latest draft payload.
  const { error: deleteError } = await insforge.database
    .from('kpi_assessment_lines')
    .delete()
    .eq('assessment_id', assessmentId);

  if (deleteError) throw new Error(getErrorMessage(deleteError));

  if (questionnaires.length > 0) {
    const lineRows = questionnaires.map((l) => ({
      assessment_id: assessmentId,
      kpi_item_id: l.kpiItemId ?? null,
      custom_kpi_title: l.customKpiTitle ?? null,
      kpi_title: l.kpiTitle,
      kpi_questionnaire: l.kpiTitle,
      importance_rating: l.importanceRating
    }));

    const { error: insertError } = await insforge.database.from('kpi_assessment_lines').insert(lineRows);
    if (insertError) throw new Error(getErrorMessage(insertError));
  }

  // Recompute stored scores so server-side draft stays useful.
  await refreshAssessmentOverallScore(assessmentId, organizationId);

  const out = await getKPIAssessment(assessmentId, organizationId);
  if (!out) throw new Error('Failed to load updated KPI draft assessment.');
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

export async function listKPIAssessmentLines(assessmentId: UUID, organizationId: UUID): Promise<KPIAssessmentLine[]> {
  const { data, error } = await insforge.database
    .from('kpi_assessment_lines')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('assessment_id', assessmentId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as KPIAssessmentLine[];
}

export async function listKPIAssessmentLinesByAssessmentIds(assessmentIds: UUID[]): Promise<KPIAssessmentLine[]> {
  if (!assessmentIds.length) return [];
  const { data, error } = await insforge.database
    .from('kpi_assessment_lines')
    .select('*')
    .in('assessment_id', assessmentIds);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as KPIAssessmentLine[];
}

export async function refreshAssessmentOverallScore(assessmentId: UUID, organizationId: UUID): Promise<void> {
  const lines = await listKPIAssessmentLines(assessmentId, organizationId);
  const score = computeOverallScore(lines);
  const achievement = computeAchievementPercentage(lines);
  const band = score != null ? getOverallRatingBand(score) : null;
  const weightedScoreTotal = lines
    .filter((l) => l.manager_rating != null)
    .reduce((sum, l) => sum + (l.manager_rating ?? 0) * getImportanceWeight(l.importance_rating), 0);

  const { error } = await insforge.database
    .from('kpi_assessments')
    .update({
      overall_score: score,
      achievement_percentage: achievement,
      employee_overall_performance_score: score,
      weighted_score_total: Math.round(weightedScoreTotal * 100) / 100,
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
        (a.assessment_name?.toLowerCase().includes(term)) ||
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
  const current = await getKPIAssessment(assessmentId, organizationId);
  if (!current) throw new Error('KPI assessment not found.');

  if (patch.status) {
    const currentStatus = normalizeAssessmentStatus(current.status);
    const nextStatus = normalizeAssessmentStatus(patch.status);
    if (!canTransitionStatus(currentStatus, nextStatus)) {
      throw new Error(`Invalid assessment status transition: ${currentStatus} -> ${nextStatus}.`);
    }

    if (nextStatus === 'completed' || nextStatus === 'closed') {
      const lines = await listKPIAssessmentLines(assessmentId, organizationId);
      const unrated = lines.filter((l) => l.manager_rating == null);
      if (unrated.length > 0) {
        throw new Error('Manager rating is required for all KPI Questionnaires before completion/closure.');
      }
    }
  }

  const { data, error } = await insforge.database
    .from('kpi_assessments')
    .update({
      ...(patch as any),
      ...(patch.status ? { status: normalizeAssessmentStatus(patch.status) } : {}),
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
