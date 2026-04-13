import { insforge } from '../insforge/client';
import type { HrKpi, HrKpiAssessmentType, HrKpiImportance, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';

export type CreateHrKpiInput = {
  companyId: UUID;
  kpiTitle: string;
  assessmentType: HrKpiAssessmentType;
  employeeUserId?: UUID | null;
  projectRef?: string | null;
  managerUserId: UUID;
  importance: HrKpiImportance;
  targetValueNumeric?: number | null;
  targetValueText?: string | null;
  actualValueNumeric?: number | null;
  actualValueText?: string | null;
  employeeSelfRating?: number | null;
  managerRating?: number | null;
  managerRemarks?: string | null;
  employeeComments?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  createdByUserId: UUID;
};

export async function createHrKpi(input: CreateHrKpiInput): Promise<HrKpi> {
  const achieved =
    input.targetValueNumeric != null && input.actualValueNumeric != null
      ? input.actualValueNumeric >= input.targetValueNumeric
      : null;

  const { data, error } = await insforge.database
    .from('hr_kpis')
    .insert({
      company_id: input.companyId,
      kpi_title: input.kpiTitle,
      assessment_type: input.assessmentType,
      employee_user_id: input.employeeUserId ?? null,
      project_ref: input.projectRef ?? null,
      manager_user_id: input.managerUserId,
      importance: input.importance,
      target_value_numeric: input.targetValueNumeric ?? null,
      target_value_text: input.targetValueText ?? null,
      actual_value_numeric: input.actualValueNumeric ?? null,
      actual_value_text: input.actualValueText ?? null,
      achieved,
      employee_self_rating: input.employeeSelfRating ?? null,
      manager_rating: input.managerRating ?? null,
      manager_remarks: input.managerRemarks ?? null,
      employee_comments: input.employeeComments ?? null,
      period_start: input.periodStart ?? null,
      period_end: input.periodEnd ?? null,
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create KPI.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'hr_kpis.create',
    entityType: 'hr_kpi',
    entityId: (data as any).id as UUID
  });

  return data as HrKpi;
}

export async function listHrKpis(input: {
  companyId: UUID;
  assessmentType?: HrKpiAssessmentType;
  employeeUserId?: UUID;
  projectRef?: string;
  from?: string;
  to?: string;
}): Promise<HrKpi[]> {
  let query = insforge.database.from('hr_kpis').select('*').eq('company_id', input.companyId);

  if (input.assessmentType) {
    query = query.eq('assessment_type', input.assessmentType);
  }
  if (input.employeeUserId) {
    query = query.eq('employee_user_id', input.employeeUserId);
  }
  if (input.projectRef) {
    query = query.eq('project_ref', input.projectRef);
  }
  if (input.from) {
    query = query.gte('period_start', input.from);
  }
  if (input.to) {
    query = query.lte('period_end', input.to);
  }

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as HrKpi[];
}

export async function updateHrKpi(
  companyId: UUID,
  kpiId: UUID,
  patch: Partial<HrKpi>,
  actorUserId: UUID
): Promise<HrKpi> {
  const { data, error } = await insforge.database
    .from('hr_kpis')
    .update({
      ...(patch as any),
      updated_at: new Date().toISOString()
    })
    .eq('company_id', companyId)
    .eq('id', kpiId)
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update KPI.');

  await createActivityLog({
    companyId,
    actorUserId,
    action: 'hr_kpis.update',
    entityType: 'hr_kpi',
    entityId: kpiId
  });

  return data as HrKpi;
}

export async function markHrKpiClosedOut(input: {
  companyId: UUID;
  kpiId: UUID;
  linkedTaskId?: UUID | null;
  closureEvidenceUrl?: string | null;
  actorUserId: UUID;
}): Promise<HrKpi> {
  const nowIso = new Date().toISOString();
  const patch: Partial<HrKpi> = {
    closed_out_at: nowIso,
    closed_out_by_user_id: input.actorUserId
  } as any;

  if (input.linkedTaskId !== undefined) {
    (patch as any).linked_task_id = input.linkedTaskId;
  }
  if (input.closureEvidenceUrl !== undefined) {
    (patch as any).closure_evidence_url = input.closureEvidenceUrl;
  }

  return updateHrKpi(input.companyId, input.kpiId, patch, input.actorUserId);
}

export async function deleteHrKpi(input: {
  companyId: UUID;
  kpiId: UUID;
  actorUserId: UUID;
}): Promise<void> {
  const { error } = await insforge.database
    .from('hr_kpis')
    .delete()
    .eq('company_id', input.companyId)
    .eq('id', input.kpiId);
  if (error) throw new Error(getErrorMessage(error));

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'hr_kpis.delete',
    entityType: 'hr_kpi',
    entityId: input.kpiId
  }).catch(() => undefined);
}
