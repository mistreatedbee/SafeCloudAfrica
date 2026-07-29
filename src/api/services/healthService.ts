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
const APP_STARTUP_HEALTH_THRESHOLD = 0.70;

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

async function checkAppStartupHealth(companyId: UUID): Promise<void> {
  try {
    const { data, error } = await insforge.database
      .from('feature_health_metrics')
      .select('*')
      .eq('company_id', companyId)
      .eq('feature_name', 'app_startup')
      .order('measured_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return;

    const healthScore = Number(data.health_score ?? 0);
    if (healthScore < APP_STARTUP_HEALTH_THRESHOLD) {
      const managementUserIds = await listManagementUserIds(companyId);
      if (managementUserIds.length > 0) {
        await notifyUsers({
          companyId,
          userIds: managementUserIds,
          type: 'warning',
          title: 'App Startup Health Alert',
          message: `app_startup feature health has degraded to ${healthScore.toFixed(2)} (below 0.70 threshold). Please investigate and validate the improving trend to completion.`,
          metadata: {
            feature: 'app_startup',
            health_score: healthScore,
            threshold: APP_STARTUP_HEALTH_THRESHOLD,
            measured_at: data.measured_at
          }
        });
      }
    }
  } catch {
    // Health monitoring should not block other operations.
  }
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