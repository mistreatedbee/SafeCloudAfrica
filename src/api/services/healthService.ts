import { insforge } from '../insforge/client';
import type {
  HealthHygieneRecord,
  HealthMedical,
  HealthRestrictedDuty,
  HealthSubstanceCase,
  HealthVaccination,
  HealthWellnessCampaign,
  MedicalCertificate,
  UUID
} from '../models/entities';
import type { CompanyRole } from '../models/core';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';
import { createTask } from './tasksService';
import { createNotification } from './notificationsService';
import { createHrRecord, getHrSettings, listHrRecords, recommendDisciplinaryAction, updateHrRecord } from './hrService';
import { sendTemplatedNotificationEmail } from './emailService';

const OPEN_TASK_STATUSES = ['draft', 'assigned', 'accepted', 'in-progress', 'awaiting-evidence', 'under-review', 'approved', 'reopened', 'overdue'];
const MEDICAL_RESTRICTED_VIEW_ROLES: CompanyRole[] = ['owner', 'admin', 'manager', 'supervisor'];

function canViewMedicalUnmasked(role: CompanyRole | null, isHrManager?: boolean): boolean {
  if (isHrManager) return true;
  if (role && MEDICAL_RESTRICTED_VIEW_ROLES.includes(role)) return true;
  return false;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIsoDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysUntil(dateText: string): number {
  const today = new Date(todayIsoDate());
  const target = new Date(dateText);
  return Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function severityFromHistory(repeatCount: number, caseType: string): 'minor' | 'major' | 'repeat' {
  if (repeatCount > 0) return 'repeat';
  const lowered = caseType.trim().toLowerCase();
  if (lowered.includes('final') || lowered.includes('dismiss') || lowered.includes('suspension') || lowered.includes('hearing')) return 'major';
  return 'minor';
}

function extractHygieneEmployeeMeta(record: HealthHygieneRecord): {
  employeeId: UUID | null;
  employeeUserId: UUID | null;
  employeeName: string | null;
  employeeNumber: string | null;
  offenceType: string | null;
} {
  const details = (record.result_details ?? {}) as Record<string, unknown>;
  return {
    employeeId: (details.employee_id as UUID | null) ?? null,
    employeeUserId: (details.employee_user_id as UUID | null) ?? null,
    employeeName: normalizeText(details.employee_name) || null,
    employeeNumber: normalizeText(details.employee_number) || null,
    offenceType: normalizeText(record.non_compliance_reason) || null
  };
}

async function syncHygieneDisciplinaryCase(
  companyId: UUID,
  record: HealthHygieneRecord,
  actorUserId: UUID
): Promise<HealthHygieneRecord> {
  if (record.compliance_status !== 'NON_COMPLIANT') return record;

  const employee = extractHygieneEmployeeMeta(record);
  if (!employee.employeeId || !employee.offenceType) return record;

  const settings = await getHrSettings(companyId).catch(() => null);
  const repeatWindowMonths = Number(settings?.repeat_offence_window_months ?? 6);
  const disciplinaryCases = await listHrRecords(companyId, 'hr_disciplinary_cases').catch(() => []);
  const details = ((record.result_details ?? {}) as Record<string, unknown>);
  const currentCaseId = normalizeText(details.disciplinary_case_id) || null;
  const offenceTypeLower = employee.offenceType.toLowerCase();

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - repeatWindowMonths);

  const repeatCount = disciplinaryCases.filter((row) => {
    if (String(row.employee_id ?? '') !== employee.employeeId) return false;
    if (currentCaseId && String(row.id) === currentCaseId) return false;
    const offence = normalizeText(row.offence_type ?? row.offence_category).toLowerCase();
    if (offence !== offenceTypeLower) return false;
    const issuedAt = String(row.date_issued ?? row.created_at ?? '');
    const issuedDate = new Date(issuedAt);
    return !Number.isNaN(issuedDate.getTime()) && issuedDate >= cutoff;
  }).length;

  const caseType = 'Hygiene survey';
  const severity = severityFromHistory(repeatCount, caseType);
  const recommendedAction = recommendDisciplinaryAction({ repeatCount, caseType });
  const description = [
    `Occupational hygiene non-compliance recorded for ${record.monitoring_type}.`,
    record.site_location ? `Work area: ${record.site_location}.` : null,
    record.non_compliance_reason ? `Offence: ${record.non_compliance_reason}.` : null,
    employee.employeeName ? `Employee: ${employee.employeeName}.` : null
  ]
    .filter(Boolean)
    .join(' ');

  let disciplinaryCaseId = currentCaseId;
  if (disciplinaryCaseId) {
    await updateHrRecord('hr_disciplinary_cases', {
      companyId,
      rowId: disciplinaryCaseId as UUID,
      actorUserId,
      patch: {
        employee_id: employee.employeeId,
        case_type: caseType,
        offence_type: employee.offenceType,
        offence_category: 'Health',
        description,
        warning_level: 'Written Warning',
        date_issued: record.monitored_on,
        repeat_offence_flag: severity === 'repeat',
        recommended_action: recommendedAction,
        offence_severity: severity,
        status: 'OPEN'
      }
    });
  } else {
    const created = await createHrRecord('hr_disciplinary_cases', {
      company_id: companyId,
      employee_id: employee.employeeId,
      case_type: caseType,
      warning_level: 'Written Warning',
      offence_type: employee.offenceType,
      offence_category: 'Health',
      description,
      date_issued: record.monitored_on,
      evidence_file_ids: [],
      repeat_offence_flag: severity === 'repeat',
      recommended_action: recommendedAction,
      offence_severity: severity,
      status: 'OPEN',
      created_by_user_id: actorUserId
    });
    disciplinaryCaseId = created.id;
  }

  const nextDetails = {
    ...details,
    employee_id: employee.employeeId,
    employee_user_id: employee.employeeUserId,
    employee_name: employee.employeeName,
    employee_number: employee.employeeNumber,
    disciplinary_case_id: disciplinaryCaseId,
    repeat_count: repeatCount,
    offence_type: employee.offenceType
  };

  const { data, error } = await insforge.database
    .from('health_hygiene_records')
    .update({
      result_details: nextDetails,
      updated_at: new Date().toISOString()
    })
    .eq('company_id', companyId)
    .eq('id', record.id)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  return (data as HealthHygieneRecord) ?? record;
}

function maskMedicalRestrictedFields(record: HealthMedical, role: CompanyRole | null, isHrManager?: boolean): HealthMedical {
  if (canViewMedicalUnmasked(role, isHrManager)) return record;
  return { ...record, chronic_illness_notes: null, restricted_duty_details: null, notes: null };
}

function maskSubstanceRestrictedFields(record: HealthSubstanceCase, role: CompanyRole | null, isHrManager?: boolean): HealthSubstanceCase {
  if (isHrManager) return record;
  if (role && ['owner', 'admin', 'manager'].includes(role)) return record;
  return { ...record, employee_comments: null, hr_manager_comments: null };
}

async function listManagementUserIds(companyId: UUID): Promise<UUID[]> {
  const { data, error } = await insforge.database
    .from('company_memberships')
    .select('user_id')
    .eq('company_id', companyId)
    .eq('status', 'ACTIVE')
    .in('role', ['owner', 'admin', 'manager']);
  if (error) throw new Error(getErrorMessage(error));
  return Array.from(new Set((data ?? []).map((r: any) => r.user_id as UUID).filter(Boolean)));
}

async function notifyUsers(input: {
  companyId: UUID;
  userIds: UUID[];
  type: 'info' | 'warning' | 'success' | 'error';
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const unique = Array.from(new Set(input.userIds));
  await Promise.all(
    unique.map((userId) => createNotification(input.companyId, userId, input.type, input.title, input.message, input.metadata).catch(() => undefined))
  );
}

async function getHealthEmails(companyId: UUID, userIds: Array<UUID | null | undefined>): Promise<string[]> {
  const ids = Array.from(new Set(userIds.filter(Boolean).map(String)));
  if (ids.length === 0) return [];
  const { data } = await insforge.database
    .from('user_profiles')
    .select('user_id, email')
    .eq('company_id', companyId)
    .in('user_id', ids);
  return Array.from(new Set((data ?? []).map((row: any) => String(row.email ?? '').trim()).filter(Boolean)));
}

async function sendHealthEmail(input: {
  companyId: UUID;
  userIds: Array<UUID | null | undefined>;
  templateKey: 'health_medicals' | 'health_wellness_programme';
  variables: Record<string, string | number | boolean | null | undefined>;
  actionUrl: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    const emails = await getHealthEmails(input.companyId, input.userIds);
    if (emails.length === 0) return;
    await sendTemplatedNotificationEmail({
      to: emails,
      templateKey: input.templateKey,
      variables: input.variables,
      actionUrl: input.actionUrl,
      meta: { companyId: input.companyId, ...(input.meta ?? {}) }
    });
  } catch {
    // Email notifications should not block health workflows.
  }
}

async function archivePreviousHealthRecords(input: {
  table: 'health_medicals' | 'health_vaccinations';
  companyId: UUID;
  newRecordId: UUID;
  actorUserId: UUID;
  match: Record<string, unknown>;
}): Promise<void> {
  let query = insforge.database
    .from(input.table)
    .update({
      status: 'archived',
      archived_at: new Date().toISOString(),
      archived_by_user_id: input.actorUserId,
      superseded_by_id: input.newRecordId,
      updated_at: new Date().toISOString()
    })
    .eq('company_id', input.companyId)
    .neq('id', input.newRecordId)
    .eq('status', 'active');

  for (const [key, value] of Object.entries(input.match)) {
    if (value == null || value === '') return;
    query = query.eq(key, value as any);
  }

  const { error } = await query;
  if (error) throw new Error(getErrorMessage(error));
}

export type ListHealthMedicalsInput = {
  companyId: UUID;
  employeeUserId?: UUID;
  employee?: string;
  dateFrom?: string;
  dateTo?: string;
  expiringInDays?: number;
  fitnessStatus?: HealthMedical['fitness_status'];
  limit?: number;
  actorUserId?: UUID;
  actorRole?: CompanyRole | null;
  /** Designated HR manager on membership; aligns with health RLS health_can_write_clinical. */
  actorIsHrManager?: boolean;
};

export async function listHealthMedicals(input: ListHealthMedicalsInput): Promise<HealthMedical[]> {
  if (input.dateFrom && input.dateTo && input.dateFrom > input.dateTo) {
    throw new Error('From date must not be after the to date.');
  }
  let q = insforge.database.from('health_medicals').select('*').eq('company_id', input.companyId);
  if (input.employeeUserId) q = q.eq('employee_user_id', input.employeeUserId);
  if (input.fitnessStatus) q = q.eq('fitness_status', input.fitnessStatus);
  if (input.dateFrom) q = q.gte('medical_date', input.dateFrom);
  if (input.dateTo) q = q.lte('medical_date', input.dateTo);
  if (input.expiringInDays != null) q = q.gte('expiry_date', todayIsoDate()).lte('expiry_date', addDaysIsoDate(input.expiringInDays));
  if (input.employee?.trim()) {
    const term = input.employee.trim();
    q = q.or(`employee_name.ilike.%${term}%,employee_number.ilike.%${term}%`);
  }
  const { data, error } = await q.order('medical_date', { ascending: false }).limit(input.limit ?? 300);
  if (error) throw new Error(getErrorMessage(error));
  const rows = ((data ?? []) as HealthMedical[]).map((r) =>
    maskMedicalRestrictedFields(r, input.actorRole ?? null, input.actorIsHrManager)
  );
  if (input.actorUserId) {
    await createActivityLog({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'health.medicals.view',
      entityType: 'health_medical',
      metadata: { count: rows.length }
    }).catch(() => undefined);
  }
  return rows;
}

export async function createHealthMedical(input: {
  companyId: UUID;
  employeeId?: UUID | null;
  employeeUserId?: UUID | null;
  employeeName?: string | null;
  employeeNumber?: string | null;
  medicalType: HealthMedical['medical_type'];
  medicalDate: string;
  expiryDate?: string | null;
  conductedBy?: string | null;
  fitnessStatus: HealthMedical['fitness_status'];
  fitnessCertificateFileIds?: UUID[];
  medicalCost?: number | null;
  chronicIllnessDisclosed?: boolean;
  chronicIllnessNotes?: string | null;
  restrictedDutyRequired?: boolean;
  restrictedDutyDetails?: string | null;
  notes?: string | null;
  uploadedDocuments?: unknown[] | null;
  createdByUserId: UUID;
}): Promise<HealthMedical> {
  if (input.medicalCost != null && input.medicalCost < 0) {
    throw new Error('Medical cost cannot be negative.');
  }
  const { data, error } = await insforge.database
    .from('health_medicals')
    .insert({
      company_id: input.companyId,
      employee_id: input.employeeId ?? null,
      employee_user_id: input.employeeUserId ?? null,
      employee_name: input.employeeName ?? null,
      employee_number: input.employeeNumber ?? null,
      medical_type: input.medicalType,
      medical_date: input.medicalDate,
      expiry_date: input.expiryDate ?? null,
      conducted_by: input.conductedBy ?? null,
      fitness_status: input.fitnessStatus,
      fitness_certificate_file_ids: input.fitnessCertificateFileIds ?? [],
      medical_cost: input.medicalCost ?? null,
      chronic_illness_disclosed: input.chronicIllnessDisclosed ?? false,
      chronic_illness_notes: input.chronicIllnessNotes ?? null,
      restricted_duty_required: input.restrictedDutyRequired ?? false,
      restricted_duty_details: input.restrictedDutyDetails ?? null,
      notes: input.notes ?? null,
      uploaded_documents: input.uploadedDocuments ?? [],
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create health medical record.');
  const row = data as HealthMedical;
  const medicalMatch: Record<string, unknown> = { medical_type: input.medicalType };
  if (input.employeeId) medicalMatch.employee_id = input.employeeId;
  else if (input.employeeUserId) medicalMatch.employee_user_id = input.employeeUserId;
  else medicalMatch.employee_name = input.employeeName ?? null;
  await archivePreviousHealthRecords({
    table: 'health_medicals',
    companyId: input.companyId,
    newRecordId: row.id,
    actorUserId: input.createdByUserId,
    match: medicalMatch
  }).catch(() => undefined);
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'health.medicals.create',
    entityType: 'health_medical',
    entityId: row.id
  });
  await sendHealthEmail({
    companyId: input.companyId,
    userIds: [input.employeeUserId],
    templateKey: 'health_medicals',
    variables: {
      employee: input.employeeName ?? input.employeeNumber,
      status: input.fitnessStatus,
      dueDate: input.expiryDate,
      findings: input.restrictedDutyRequired ? 'Restricted duty required' : ''
    },
    actionUrl: '/dashboard/health/medical',
    meta: { medicalId: row.id }
  });
  return row;
}

export async function updateHealthMedical(
  companyId: UUID,
  medicalId: UUID,
  patch: Partial<HealthMedical>,
  actorUserId?: UUID
): Promise<HealthMedical> {
  const { data, error } = await insforge.database
    .from('health_medicals')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', medicalId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update health medical record.');
  if (actorUserId) {
    await createActivityLog({
      companyId,
      actorUserId,
      action: 'health.medicals.update',
      entityType: 'health_medical',
      entityId: medicalId,
      metadata: { fields: Object.keys(patch) }
    }).catch(() => undefined);
  }
  const row = data as HealthMedical;
  await sendHealthEmail({
    companyId,
    userIds: [row.employee_user_id],
    templateKey: 'health_medicals',
    variables: {
      employee: row.employee_name ?? row.employee_number,
      status: row.fitness_status,
      dueDate: row.expiry_date,
      findings: row.restricted_duty_required ? 'Restricted duty required' : ''
    },
    actionUrl: '/dashboard/health/medical',
    meta: { medicalId: row.id }
  });
  return row;
}

export async function deleteHealthMedical(companyId: UUID, medicalId: UUID, actorUserId?: UUID): Promise<void> {
  const { error } = await insforge.database.from('health_medicals').delete().eq('company_id', companyId).eq('id', medicalId);
  if (error) throw new Error(getErrorMessage(error));
  if (actorUserId) {
    await createActivityLog({
      companyId,
      actorUserId,
      action: 'health.medicals.delete',
      entityType: 'health_medical',
      entityId: medicalId
    }).catch(() => undefined);
  }
}

export async function listHealthRestrictedDuty(input: {
  companyId: UUID;
  employee?: string;
  status?: HealthRestrictedDuty['status'];
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}): Promise<HealthRestrictedDuty[]> {
  let q = insforge.database.from('health_restricted_duty').select('*').eq('company_id', input.companyId);
  if (input.status) q = q.eq('status', input.status);
  if (input.dateFrom) q = q.gte('start_date', input.dateFrom);
  if (input.dateTo) q = q.lte('start_date', input.dateTo);
  if (input.employee?.trim()) {
    const term = input.employee.trim();
    q = q.or(`employee_name.ilike.%${term}%,restriction_reason.ilike.%${term}%`);
  }
  const { data, error } = await q.order('start_date', { ascending: false }).limit(input.limit ?? 300);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as HealthRestrictedDuty[];
}

async function autoCreateHygieneActionPlan(companyId: UUID, record: HealthHygieneRecord, actorUserId: UUID): Promise<UUID | null> {
  if (record.compliance_status !== 'NON_COMPLIANT') return null;
  if (record.action_plan_id) return record.action_plan_id;
  const task = await createTask({
    companyId,
    module: 'health',
    title: `Hygiene non-compliance: ${record.monitoring_type}`,
    description: record.non_compliance_reason ?? record.results_summary ?? undefined,
    category: 'capa',
    riskLevel: 'high',
    priority: 'high',
    dueAt: record.action_due_date ?? addDaysIsoDate(14),
    assigneeUserId: record.responsible_user_id ?? undefined,
    sourceEntityType: 'health_hygiene_record',
    sourceEntityId: record.id,
    createdByUserId: actorUserId
  }).catch(() => null);
  if (!task) return null;
  await insforge.database
    .from('health_hygiene_records')
    .update({ action_plan_id: task.id, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', record.id);
  const managementIds = await listManagementUserIds(companyId).catch(() => []);
  const notifyIds = [...managementIds, ...(task.assignee_user_id ? [task.assignee_user_id] : [])];
  await notifyUsers({
    companyId,
    userIds: notifyIds,
    type: 'warning',
    title: 'Hygiene Non-Compliance',
    message: `A hygiene non-compliance record requires action: ${record.monitoring_type}.`,
    metadata: { actionPlanId: task.id, hygieneRecordId: record.id }
  });
  return task.id;
}

export async function listHealthHygieneRecords(input: {
  companyId: UUID;
  employee?: string;
  dateFrom?: string;
  dateTo?: string;
  complianceStatus?: HealthHygieneRecord['compliance_status'];
  limit?: number;
}): Promise<HealthHygieneRecord[]> {
  let q = insforge.database.from('health_hygiene_records').select('*').eq('company_id', input.companyId);
  if (input.complianceStatus) q = q.eq('compliance_status', input.complianceStatus);
  if (input.dateFrom) q = q.gte('monitored_on', input.dateFrom);
  if (input.dateTo) q = q.lte('monitored_on', input.dateTo);
  if (input.employee?.trim()) {
    const term = input.employee.trim();
    q = q.or(`monitoring_type.ilike.%${term}%,department.ilike.%${term}%,site_location.ilike.%${term}%`);
  }
  const { data, error } = await q.order('monitored_on', { ascending: false }).limit(input.limit ?? 300);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as HealthHygieneRecord[];
}

export async function createHealthHygieneRecord(input: {
  companyId: UUID;
  monitoringType: string;
  siteLocation?: string | null;
  department?: string | null;
  monitoredOn: string;
  conductedBy?: string | null;
  methodOrStandard?: string | null;
  resultsSummary?: string | null;
  resultDetails?: Record<string, unknown> | null;
  complianceStatus?: HealthHygieneRecord['compliance_status'];
  nonComplianceReason?: string | null;
  labCertificateFileIds?: UUID[];
  linkedRiskAssessmentIds?: UUID[];
  responsibleUserId?: UUID | null;
  actionDueDate?: string | null;
  createdByUserId: UUID;
}): Promise<HealthHygieneRecord> {
  const { data, error } = await insforge.database
    .from('health_hygiene_records')
    .insert({
      company_id: input.companyId,
      monitoring_type: input.monitoringType,
      site_location: input.siteLocation ?? null,
      department: input.department ?? null,
      monitored_on: input.monitoredOn,
      conducted_by: input.conductedBy ?? null,
      method_or_standard: input.methodOrStandard ?? null,
      results_summary: input.resultsSummary ?? null,
      result_details: input.resultDetails ?? {},
      compliance_status: input.complianceStatus ?? 'UNKNOWN',
      non_compliance_reason: input.nonComplianceReason ?? null,
      lab_certificate_file_ids: input.labCertificateFileIds ?? [],
      linked_risk_assessment_ids: input.linkedRiskAssessmentIds ?? [],
      responsible_user_id: input.responsibleUserId ?? null,
      action_due_date: input.actionDueDate ?? null,
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create hygiene record.');
  const record = data as HealthHygieneRecord;
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'health.hygiene.create',
    entityType: 'health_hygiene_record',
    entityId: record.id
  }).catch(() => undefined);
  const actionPlanId = await autoCreateHygieneActionPlan(input.companyId, record, input.createdByUserId);
  const syncedRecord = actionPlanId ? { ...record, action_plan_id: actionPlanId } : record;
  return await syncHygieneDisciplinaryCase(input.companyId, syncedRecord, input.createdByUserId);
}

export async function updateHealthHygieneRecord(
  companyId: UUID,
  recordId: UUID,
  patch: Partial<HealthHygieneRecord>,
  actorUserId?: UUID
): Promise<HealthHygieneRecord> {
  const { data, error } = await insforge.database
    .from('health_hygiene_records')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', recordId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update hygiene record.');
  if (actorUserId) {
    await createActivityLog({
      companyId,
      actorUserId,
      action: 'health.hygiene.update',
      entityType: 'health_hygiene_record',
      entityId: recordId,
      metadata: { fields: Object.keys(patch) }
    }).catch(() => undefined);
  }
  const updatedRecord = data as HealthHygieneRecord;
  if (!actorUserId) return updatedRecord;
  return await syncHygieneDisciplinaryCase(companyId, updatedRecord, actorUserId);
}

export async function deleteHealthHygieneRecord(companyId: UUID, recordId: UUID, actorUserId?: UUID): Promise<void> {
  const { error } = await insforge.database.from('health_hygiene_records').delete().eq('company_id', companyId).eq('id', recordId);
  if (error) throw new Error(getErrorMessage(error));
  if (actorUserId) {
    await createActivityLog({
      companyId,
      actorUserId,
      action: 'health.hygiene.delete',
      entityType: 'health_hygiene_record',
      entityId: recordId
    }).catch(() => undefined);
  }
}

export async function listHealthWellnessCampaigns(companyId: UUID): Promise<HealthWellnessCampaign[]> {
  const { data, error } = await insforge.database
    .from('health_wellness_campaigns')
    .select('*')
    .eq('company_id', companyId)
    .order('date_from', { ascending: false })
    .limit(300);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as HealthWellnessCampaign[];
}

export async function createHealthWellnessCampaign(input: {
  companyId: UUID;
  title: string;
  campaignType: HealthWellnessCampaign['campaign_type'];
  dateFrom?: string | null;
  dateTo?: string | null;
  description?: string | null;
  attachmentFileIds?: UUID[];
  createdByUserId: UUID;
}): Promise<HealthWellnessCampaign> {
  const { data, error } = await insforge.database
    .from('health_wellness_campaigns')
    .insert({
      company_id: input.companyId,
      title: input.title,
      campaign_type: input.campaignType,
      date_from: input.dateFrom ?? null,
      date_to: input.dateTo ?? null,
      description: input.description ?? null,
      attachment_file_ids: input.attachmentFileIds ?? [],
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create wellness campaign.');
  const campaign = data as HealthWellnessCampaign;
  const managementIds = await listManagementUserIds(input.companyId).catch(() => []);
  await sendHealthEmail({
    companyId: input.companyId,
    userIds: managementIds,
    templateKey: 'health_wellness_programme',
    variables: {
      title: campaign.title,
      status: campaign.campaign_type,
      dueDate: campaign.date_from
    },
    actionUrl: '/dashboard/health/wellness',
    meta: { wellnessCampaignId: campaign.id }
  });
  return campaign;
}

export async function updateHealthWellnessCampaign(companyId: UUID, campaignId: UUID, patch: Partial<HealthWellnessCampaign>): Promise<HealthWellnessCampaign> {
  const { data, error } = await insforge.database
    .from('health_wellness_campaigns')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', campaignId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update wellness campaign.');
  const campaign = data as HealthWellnessCampaign;
  const managementIds = await listManagementUserIds(companyId).catch(() => []);
  await sendHealthEmail({
    companyId,
    userIds: managementIds,
    templateKey: 'health_wellness_programme',
    variables: {
      title: campaign.title,
      status: campaign.campaign_type,
      dueDate: campaign.date_from
    },
    actionUrl: '/dashboard/health/wellness',
    meta: { wellnessCampaignId: campaign.id }
  });
  return campaign;
}

export async function deleteHealthWellnessCampaign(companyId: UUID, campaignId: UUID): Promise<void> {
  const { error } = await insforge.database.from('health_wellness_campaigns').delete().eq('company_id', companyId).eq('id', campaignId);
  if (error) throw new Error(getErrorMessage(error));
}

function ensureSubstanceWriteAccess(role: CompanyRole | null | undefined, isHrManager?: boolean): void {
  if (isHrManager) return;
  if (!role || !['owner', 'admin', 'manager'].includes(role)) {
    throw new Error('You do not have permission to access substance abuse records.');
  }
}

export async function listHealthSubstanceCases(input: {
  companyId: UUID;
  actorRole?: CompanyRole | null;
  actorIsHrManager?: boolean;
}): Promise<HealthSubstanceCase[]> {
  ensureSubstanceWriteAccess(input.actorRole, input.actorIsHrManager);
  const { data, error } = await insforge.database
    .from('health_substance_cases')
    .select('*')
    .eq('company_id', input.companyId)
    .order('date_of_report', { ascending: false })
    .limit(300);
  if (error) throw new Error(getErrorMessage(error));
  return ((data ?? []) as HealthSubstanceCase[]).map((row) =>
    maskSubstanceRestrictedFields(row, input.actorRole ?? null, input.actorIsHrManager)
  );
}

export async function createHealthSubstanceCase(input: {
  companyId: UUID;
  employeeUserId?: UUID | null;
  employeeName?: string | null;
  dateOfReport: string;
  testConductedBy?: string | null;
  typeOfCase: HealthSubstanceCase['type_of_case'];
  substanceSuspected: string[];
  substanceSuspectedOther?: string | null;
  observedBehaviourSymptoms?: string | null;
  witnessNames?: string[];
  typeOfTest: HealthSubstanceCase['type_of_test'];
  testResult: HealthSubstanceCase['test_result'];
  bacLevel?: number | null;
  drugPanelResult?: string | null;
  removedFromDuty?: boolean;
  immediateActionTaken?: string | null;
  outcome?: HealthSubstanceCase['outcome'];
  employeeComments?: string | null;
  hrManagerComments?: string | null;
  attachmentFileIds?: UUID[];
  createdByUserId: UUID;
  actorRole?: CompanyRole | null;
  actorIsHrManager?: boolean;
}): Promise<HealthSubstanceCase> {
  ensureSubstanceWriteAccess(input.actorRole, input.actorIsHrManager);
  const { data, error } = await insforge.database
    .from('health_substance_cases')
    .insert({
      company_id: input.companyId,
      employee_user_id: input.employeeUserId ?? null,
      employee_name: input.employeeName ?? null,
      date_of_report: input.dateOfReport,
      test_conducted_by: input.testConductedBy ?? null,
      type_of_case: input.typeOfCase,
      substance_suspected: input.substanceSuspected ?? [],
      substance_suspected_other: input.substanceSuspectedOther ?? null,
      observed_behaviour_symptoms: input.observedBehaviourSymptoms ?? null,
      witness_names: input.witnessNames ?? [],
      type_of_test: input.typeOfTest,
      test_result: input.testResult,
      bac_level: input.bacLevel ?? null,
      drug_panel_result: input.drugPanelResult ?? null,
      removed_from_duty: input.removedFromDuty ?? false,
      immediate_action_taken: input.immediateActionTaken ?? null,
      outcome: input.outcome ?? null,
      employee_comments: input.employeeComments ?? null,
      hr_manager_comments: input.hrManagerComments ?? null,
      attachment_file_ids: input.attachmentFileIds ?? [],
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create substance abuse case.');
  const row = data as HealthSubstanceCase;
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'health.substance.create',
    entityType: 'health_substance_case',
    entityId: row.id
  }).catch(() => undefined);
  return maskSubstanceRestrictedFields(row, input.actorRole ?? null, input.actorIsHrManager);
}

export async function updateHealthSubstanceCase(
  companyId: UUID,
  caseId: UUID,
  patch: Partial<HealthSubstanceCase>,
  actorUserId?: UUID
): Promise<HealthSubstanceCase> {
  const { data, error } = await insforge.database
    .from('health_substance_cases')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', caseId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update substance abuse case.');
  if (actorUserId) {
    await createActivityLog({
      companyId,
      actorUserId,
      action: 'health.substance.update',
      entityType: 'health_substance_case',
      entityId: caseId,
      metadata: { fields: Object.keys(patch) }
    }).catch(() => undefined);
  }
  return data as HealthSubstanceCase;
}

export async function deleteHealthSubstanceCase(companyId: UUID, caseId: UUID, actorUserId?: UUID): Promise<void> {
  const { error } = await insforge.database.from('health_substance_cases').delete().eq('company_id', companyId).eq('id', caseId);
  if (error) throw new Error(getErrorMessage(error));
  if (actorUserId) {
    await createActivityLog({
      companyId,
      actorUserId,
      action: 'health.substance.delete',
      entityType: 'health_substance_case',
      entityId: caseId
    }).catch(() => undefined);
  }
}

export async function listHealthVaccinations(input: { companyId: UUID; dueInDays?: number; employeeUserId?: UUID }): Promise<HealthVaccination[]> {
  let q = insforge.database.from('health_vaccinations').select('*').eq('company_id', input.companyId);
  if (input.employeeUserId) q = q.eq('employee_user_id', input.employeeUserId);
  if (input.dueInDays != null) q = q.gte('next_due_date', todayIsoDate()).lte('next_due_date', addDaysIsoDate(input.dueInDays));
  const { data, error } = await q.order('next_due_date', { ascending: true }).limit(400);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as HealthVaccination[];
}

export async function createHealthVaccination(input: {
  companyId: UUID;
  employeeUserId?: UUID | null;
  employeeName?: string | null;
  vaccineName: string;
  doseNo?: number | null;
  dateAdministered?: string | null;
  batchNo?: string | null;
  administeredBy?: string | null;
  nextDueDate?: string | null;
  proofAttachedFileIds?: UUID[];
  validity?: string | null;
  createdByUserId: UUID;
}): Promise<HealthVaccination> {
  const { data, error } = await insforge.database
    .from('health_vaccinations')
    .insert({
      company_id: input.companyId,
      employee_user_id: input.employeeUserId ?? null,
      employee_name: input.employeeName ?? null,
      vaccine_name: input.vaccineName,
      dose_no: input.doseNo ?? null,
      date_administered: input.dateAdministered ?? null,
      batch_no: input.batchNo ?? null,
      administered_by: input.administeredBy ?? null,
      next_due_date: input.nextDueDate ?? null,
      proof_attached_file_ids: input.proofAttachedFileIds ?? [],
      validity: input.validity ?? null,
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create vaccination record.');
  const row = data as HealthVaccination;
  const match: Record<string, unknown> = {
    vaccine_name: input.vaccineName
  };
  if (input.employeeUserId) match.employee_user_id = input.employeeUserId;
  else match.employee_name = input.employeeName ?? null;
  await archivePreviousHealthRecords({
    table: 'health_vaccinations',
    companyId: input.companyId,
    newRecordId: row.id,
    actorUserId: input.createdByUserId,
    match
  }).catch(() => undefined);
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'health.vaccination.create',
    entityType: 'health_vaccination',
    entityId: row.id
  }).catch(() => undefined);
  return row;
}

export async function updateHealthVaccination(
  companyId: UUID,
  vaccinationId: UUID,
  patch: Partial<HealthVaccination>,
  actorUserId?: UUID
): Promise<HealthVaccination> {
  const { data, error } = await insforge.database
    .from('health_vaccinations')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', vaccinationId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update vaccination record.');
  if (actorUserId) {
    await createActivityLog({
      companyId,
      actorUserId,
      action: 'health.vaccination.update',
      entityType: 'health_vaccination',
      entityId: vaccinationId,
      metadata: { fields: Object.keys(patch) }
    }).catch(() => undefined);
  }
  return data as HealthVaccination;
}

export async function deleteHealthVaccination(companyId: UUID, vaccinationId: UUID, actorUserId?: UUID): Promise<void> {
  const { error } = await insforge.database.from('health_vaccinations').delete().eq('company_id', companyId).eq('id', vaccinationId);
  if (error) throw new Error(getErrorMessage(error));
  if (actorUserId) {
    await createActivityLog({
      companyId,
      actorUserId,
      action: 'health.vaccination.delete',
      entityType: 'health_vaccination',
      entityId: vaccinationId
    }).catch(() => undefined);
  }
}

export async function getHealthDashboardStats(companyId: UUID) {
  const nowDate = todayIsoDate();
  const plus30 = addDaysIsoDate(30);
  const { data: medicalRows } = await insforge.database.from('health_medicals').select('fitness_status, expiry_date, medical_cost, employee_id').eq('company_id', companyId).limit(5000);
  const medicals = (medicalRows ?? []) as Array<Pick<HealthMedical, 'fitness_status' | 'expiry_date' | 'medical_cost' | 'employee_id'>>;
  const fitCount = medicals.filter((m) => m.fitness_status === 'FIT').length;
  const restrictedCount = medicals.filter((m) => m.fitness_status === 'RESTRICTED').length;
  const unfitCount = medicals.filter((m) => m.fitness_status === 'UNFIT').length;
  const expiredCount = medicals.filter((m) => !!m.expiry_date && String(m.expiry_date) < nowDate).length;
  const medicalsExpiringSoon = medicals.filter((m) => !!m.expiry_date && String(m.expiry_date) >= nowDate && String(m.expiry_date) <= plus30).length;
  const totalCost = medicals.reduce((sum, m) => sum + Number(m.medical_cost ?? 0), 0);
  const employeesWithCost = new Set<string>();
  for (const m of medicals) {
    if (m.employee_id && m.medical_cost != null) employeesWithCost.add(String(m.employee_id));
  }
  const averageCostPerEmployee = employeesWithCost.size > 0 ? totalCost / employeesWithCost.size : 0;

  const { count: openHygieneNonCompliances } = await insforge.database
    .from('health_hygiene_records')
    .select('*', { count: 'planned', head: true })
    .eq('company_id', companyId)
    .eq('compliance_status', 'NON_COMPLIANT');
  const { count: openHealthActionPlans } = await insforge.database
    .from('tasks')
    .select('*', { count: 'planned', head: true })
    .eq('company_id', companyId)
    .eq('source_entity_type', 'health_hygiene_record')
    .in('status', OPEN_TASK_STATUSES);
  const { count: vaccinationsDueSoon } = await insforge.database
    .from('health_vaccinations')
    .select('*', { count: 'planned', head: true })
    .eq('company_id', companyId)
    .gte('next_due_date', nowDate)
    .lte('next_due_date', plus30);
  return {
    fitCount,
    restrictedCount,
    unfitCount,
    expiredCount,
    medicalsExpiringSoon,
    totalMedicalCost: totalCost,
    averageMedicalCostPerEmployee: averageCostPerEmployee,
    openHygieneNonCompliances: openHygieneNonCompliances ?? 0,
    openHealthActionPlans: openHealthActionPlans ?? 0,
    vaccinationsDueSoon: vaccinationsDueSoon ?? 0
  };
}

export async function runHealthReminderSweep(companyId: UUID): Promise<void> {
  const managementIds = await listManagementUserIds(companyId).catch(() => []);
  const { data: medicals } = await insforge.database
    .from('health_medicals')
    .select('id, employee_user_id, employee_name, expiry_date')
    .eq('company_id', companyId)
    .not('expiry_date', 'is', null)
    .gte('expiry_date', addDaysIsoDate(-1))
    .lte('expiry_date', addDaysIsoDate(30))
    .limit(2000);
  const alertDays = new Set([30, 7, 0]);
  for (const row of (medicals ?? []) as Array<{ id: UUID; employee_user_id: UUID | null; employee_name: string | null; expiry_date: string }>) {
    const d = daysUntil(row.expiry_date);
    if (!alertDays.has(d)) continue;
    const recipients = [...managementIds, ...(row.employee_user_id ? [row.employee_user_id] : [])];
    await notifyUsers({
      companyId,
      userIds: recipients,
      type: d === 0 ? 'error' : 'warning',
      title: 'Medical Expiry Alert',
      message: `${row.employee_name ?? 'Employee'} medical expires in ${d} day(s).`,
      metadata: { healthMedicalId: row.id, daysRemaining: d }
    });
  }
}

// Legacy medical certificate API (kept for compatibility with existing components).
export async function listMedicalCertificates(companyId: UUID, input?: { userId?: UUID; limit?: number }): Promise<MedicalCertificate[]> {
  const base = insforge.database.from('medical_certificates').select('*').eq('company_id', companyId);
  const q = input?.userId ? base.eq('user_id', input.userId) : base;
  const { data, error } = await q.order('expires_at', { ascending: true }).limit(input?.limit ?? 500);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as MedicalCertificate[];
}

export async function countExpiringMedical(companyId: UUID, withinDays = 30): Promise<number> {
  const { count, error } = await insforge.database
    .from('health_medicals')
    .select('*', { count: 'planned', head: true })
    .eq('company_id', companyId)
    .gte('expiry_date', todayIsoDate())
    .lte('expiry_date', addDaysIsoDate(withinDays));
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
}

export async function createMedicalCertificate(input: {
  companyId: UUID;
  userId: UUID;
  certificateType: string;
  issuedAt?: string;
  expiresAt?: string | null;
  status?: MedicalCertificate['status'];
  certificateBucket?: string | null;
  certificateKey?: string | null;
  createdByUserId: UUID;
}): Promise<MedicalCertificate> {
  const { data, error } = await insforge.database
    .from('medical_certificates')
    .insert({
      company_id: input.companyId,
      user_id: input.userId,
      certificate_type: input.certificateType,
      issued_at: input.issuedAt ?? new Date().toISOString(),
      expires_at: input.expiresAt ?? null,
      status: input.status ?? 'valid',
      certificate_bucket: input.certificateBucket ?? null,
      certificate_key: input.certificateKey ?? null,
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create medical certificate.');
  return data as MedicalCertificate;
}
