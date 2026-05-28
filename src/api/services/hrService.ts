
import { insforge } from '../insforge/client';
import { withInsforgeSession } from '../insforge/ensureSession';
import type { UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog, listActivityLogsByEntity } from './activityLogService';
import { createNotification } from './notificationsService';

export type HrEmployee = {
  id: UUID;
  company_id: UUID;
  user_id: UUID | null;
  employee_no: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  id_number: string | null;
  date_of_birth: string | null;
  address: string | null;
  job_title: string | null;
  department_id: UUID | null;
  site_id: UUID | null;
  supervisor_user_id: UUID | null;
  supervisor_employee_id?: UUID | null;
  employment_type: string;
  employment_type_other: string | null;
  employment_status: 'ONBOARDING' | 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'TERMINATED' | 'ARCHIVED';
  start_date: string;
  end_date: string | null;
  contract_expiry_date: string | null;
  probation_end_date: string | null;
  next_review_date: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

export type HrEmployeeSensitiveDetails = {
  employee_id: UUID;
  company_id: UUID;
  medical_aid_name: string | null;
  medical_aid_membership_number: string | null;
  marital_status: 'Single' | 'Married' | 'Divorced' | 'Separated' | 'Widowed' | 'Domestic Partner' | null;
  partner_name: string | null;
  tax_number: string | null;
  passport_number: string | null;
  passport_expiry_date: string | null;
  permit_number: string | null;
  permit_expiry_date: string | null;
  country_of_issue: string | null;
  bank_name: string | null;
  account_holder_name: string | null;
  account_number: string | null;
  branch_code: string | null;
  account_type: string | null;
  created_at: string;
  updated_at: string;
};

export type HrEmployeeDependent = {
  id: UUID;
  company_id: UUID;
  employee_id: UUID;
  dependent_name: string;
  relationship: string;
  contact_details: string | null;
  created_at: string;
  updated_at: string;
};

export type HrLeaveRequest = {
  id: UUID;
  company_id: UUID;
  employee_id: UUID;
  leave_type_id: UUID;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string | null;
  reason_other: string | null;
  proof_file_ids: UUID[];
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'DECLINED' | 'CANCELLED';
  submitted_at: string | null;
  approved_by_user_id: UUID | null;
  approved_at: string | null;
  decline_reason: string | null;
  supervisor_approval_status: 'PENDING' | 'APPROVED' | 'DECLINED';
  hr_approval_status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'NOT_REQUIRED';
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

export type HrTimesheet = {
  id: UUID;
  company_id: UUID;
  employee_id: UUID;
  date: string;
  hours_worked: number;
  overtime_hours: number;
  project_or_client: string | null;
  notes: string | null;
  status: 'SUBMITTED' | 'APPROVED' | 'DECLINED';
  approved_by_user_id: UUID | null;
  approved_at: string | null;
  decline_reason: string | null;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

export type HrMonthlyHours = {
  id: UUID;
  company_id: UUID;
  employee_id: UUID;
  year: number;
  month: number;
  total_hours: number;
  overtime_hours: number;
  total_with_overtime: number;
  last_calculated_at: string;
  updated_by_user_id: UUID | null;
  created_at: string;
  updated_at: string;
};

export type HrSimpleRecord = Record<string, unknown> & { id: UUID; company_id: UUID; created_at: string; updated_at?: string };

export type HrEmployeeWellnessAssessment = HrSimpleRecord & {
  employee_id: UUID;
  department_id: UUID | null;
  assessment_date: string;
  company_name: string | null;
  employee_number: string | null;
  job_title: string | null;
  line_manager_name: string | null;
  wellness_assessment_answers: Record<string, unknown>;
  health_lifestyle_assessment: Record<string, unknown>;
  workplace_wellness_needs: Record<string, unknown>;
  programme_participation: Record<string, unknown>;
  employee_signature: string | null;
  wellness_officer_signature: string | null;
  approval_date: string | null;
  created_by_user_id: UUID;
  updated_by_user_id: UUID | null;
};

export type HrEmployeeWellnessAction = HrSimpleRecord & {
  assessment_id: UUID;
  identified_issue: string;
  action_required: string;
  responsible_employee_id: UUID | null;
  target_date: string | null;
  status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED';
  completed_date: string | null;
  created_by_user_id: UUID;
  updated_by_user_id: UUID | null;
};

export type HrDashboardStats = {
  totalEmployees: number;
  onboardingEmployees: number;
  activeEmployees: number;
  terminatedEmployees: number;
  pendingLeaveApprovals: number;
  approvedUpcomingLeave: number;
  overdueLeaveApprovals: number;
  contractsExpiring30Days: number;
  contractsExpiring14Days: number;
  contractsExpiring7Days: number;
  hoursWorkedSelectedPeriod: number;
  trainingCompliancePercent: number;
  disciplinaryOpen: number;
  disciplinaryRepeatOffence: number;
  hrDocsExpiringSoon: number;
  hrDocsExpired: number;
  acknowledgementCompletionPercent: number;
};

export type HrDocumentExpiryStatus = 'active' | 'expiring_30' | 'expiring_7' | 'expired' | 'archived';

export type HrPersonalDocumentRow = HrSimpleRecord & {
  employee_id: UUID;
  doc_type: string;
  title: string;
  doc_name?: string | null;
  file_ids: UUID[];
  issue_date: string | null;
  expiry_date: string | null;
  notes: string | null;
  status: 'ACTIVE' | 'EXPIRED' | 'ARCHIVED';
  uploaded_by_user_id: UUID;
  visible_to_employee: boolean;
  acknowledged_by_employee: boolean | null;
  acknowledged_at: string | null;
};

export type HrAckDocumentRow = HrSimpleRecord & {
  title: string;
  category: string;
  file_ids: UUID[];
  version: string | null;
  effective_date: string | null;
  review_date: string | null;
  assigned_all: boolean;
  assigned_department_ids: UUID[] | null;
  assigned_roles: string[] | null;
  acknowledgement_required: boolean;
  signature_required: boolean;
  created_by_user_id: UUID;
};

export type HrAckReceiptRow = HrSimpleRecord & {
  ack_document_id: UUID;
  employee_id: UUID;
  employee_user_id: UUID | null;
  status: 'PENDING' | 'ACKNOWLEDGED' | 'SIGNED';
  acknowledged_at: string | null;
  signed_at: string | null;
  acknowledgement_method: string | null;
  ip_address: string | null;
  device_info: string | null;
};

function withHrSession<T>(reason: string, fn: () => Promise<T>): Promise<T> {
  return withInsforgeSession(`hr:${reason}`, fn);
}

async function getCount(table: string, companyId: UUID, eq?: Record<string, string | number | boolean>): Promise<number> {
  return withHrSession(`count:${table}`, async () => {
  let q = insforge.database.from(table).select('*', { count: 'planned', head: true }).eq('company_id', companyId);
  if (eq) {
    for (const [key, value] of Object.entries(eq)) q = q.eq(key, value);
  }
  const { count, error } = await q;
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
  });
}

async function listTable<T>(table: string, companyId: UUID, filters?: Record<string, string | number | boolean | null>, order = 'created_at'): Promise<T[]> {
  return withHrSession(`list:${table}`, async () => {
  let q = insforge.database.from(table).select('*').eq('company_id', companyId);
  if (filters) {
    for (const [key, value] of Object.entries(filters)) {
      if (value === null) q = q.is(key, null);
      else q = q.eq(key, value);
    }
  }
  const { data, error } = await q.order(order, { ascending: false });
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as T[];
  });
}

async function insertTable<T>(table: string, payload: Record<string, unknown>): Promise<T> {
  return withHrSession(`insert:${table}`, async () => {
  const { data, error } = await insforge.database.from(table).insert(payload).select('*').single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error(`Failed to create ${table} row`);
  return data as T;
  });
}

async function upsertTable<T>(table: string, payload: Record<string, unknown>, onConflict: string): Promise<T> {
  return withHrSession(`upsert:${table}`, async () => {
  const { data, error } = await insforge.database.from(table).upsert(payload, { onConflict }).select('*').single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error(`Failed to upsert ${table} row`);
  return data as T;
  });
}

export async function listHrEmployees(companyId: UUID): Promise<HrEmployee[]> {
  return listTable<HrEmployee>('hr_employees', companyId);
}

export async function searchHrEmployees(
  companyId: UUID,
  input?: {
    query?: string;
    includeUnlinked?: boolean;
    activeOnly?: boolean;
    limit?: number;
  }
): Promise<HrEmployee[]> {
  return withHrSession('employees:search', async () => {
  const qText = input?.query?.trim() ?? '';
  let q = insforge.database
    .from('hr_employees')
    .select('*')
    .eq('company_id', companyId)
    .order('first_name', { ascending: true })
    .order('last_name', { ascending: true })
    .limit(input?.limit ?? 120);

  if (input?.activeOnly !== false) {
    q = q.in('employment_status', ['ONBOARDING', 'ACTIVE', 'ON_LEAVE', 'SUSPENDED']);
  }
  if (!input?.includeUnlinked) q = q.not('user_id', 'is', null);
  if (qText) {
    q = q.or(
      `first_name.ilike.%${qText}%,last_name.ilike.%${qText}%,employee_no.ilike.%${qText}%,email.ilike.%${qText}%,job_title.ilike.%${qText}%`
    );
  }

  const { data, error } = await q;
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as HrEmployee[];
  });
}

export async function getHrEmployeeById(companyId: UUID, id: UUID): Promise<HrEmployee | null> {
  return withHrSession('employees:get-by-id', async () => {
  const { data, error } = await insforge.database.from('hr_employees').select('*').eq('company_id', companyId).eq('id', id).maybeSingle();
  if (error) throw new Error(getErrorMessage(error));
  return (data as HrEmployee) ?? null;
  });
}

export async function getHrEmployeeByUserId(companyId: UUID, userId: UUID): Promise<HrEmployee | null> {
  return withHrSession('employees:get-by-user-id', async () => {
  const { data, error } = await insforge.database
    .from('hr_employees')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .in('employment_status', ['ONBOARDING', 'ACTIVE', 'ON_LEAVE', 'SUSPENDED'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(getErrorMessage(error));
  return (data as HrEmployee) ?? null;
  });
}

export async function upsertHrEmployee(input: Partial<HrEmployee> & {
  company_id: UUID;
  created_by_user_id: UUID;
  employee_no: string;
  first_name: string;
  last_name: string;
  email: string;
  employment_type: string;
  start_date: string;
}): Promise<HrEmployee> {
  const employee = await upsertTable<HrEmployee>(
    'hr_employees',
    { ...input, updated_at: new Date().toISOString() },
    'company_id,employee_no'
  );
  await createActivityLog({
    companyId: input.company_id,
    actorUserId: input.created_by_user_id,
    action: 'hr.employee.upsert',
    entityType: 'hr_employee',
    entityId: employee.id
  });
  return employee;
}

export async function canAccessSensitiveEmployeeFields(companyId: UUID): Promise<boolean> {
  return withHrSession('employees:can-access-sensitive-fields', async () => {
  const { data, error } = await insforge.database.rpc('hr_can_access_sensitive_employee_fields', { p_company_id: companyId });
  if (error) throw new Error(getErrorMessage(error));
  return Boolean(data);
  });
}

export async function getHrEmployeeSensitiveDetails(companyId: UUID, employeeId: UUID): Promise<HrEmployeeSensitiveDetails | null> {
  return withHrSession('employees:get-sensitive-details', async () => {
  const { data, error } = await insforge.database
    .from('hr_employee_sensitive_details')
    .select('*')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)
    .maybeSingle();
  if (error) throw new Error(getErrorMessage(error));
  return (data as HrEmployeeSensitiveDetails) ?? null;
  });
}

export async function upsertHrEmployeeSensitiveDetails(input: {
  companyId: UUID;
  employeeId: UUID;
  actorUserId: UUID;
  patch: Partial<Omit<HrEmployeeSensitiveDetails, 'employee_id' | 'company_id' | 'created_at' | 'updated_at'>>;
}): Promise<HrEmployeeSensitiveDetails> {
  const row = await upsertTable<HrEmployeeSensitiveDetails>(
    'hr_employee_sensitive_details',
    {
      company_id: input.companyId,
      employee_id: input.employeeId,
      ...input.patch,
      updated_at: new Date().toISOString()
    },
    'employee_id'
  );
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'hr.employee_sensitive.upsert',
    entityType: 'hr_employee_sensitive_details',
    entityId: input.employeeId
  }).catch(() => {});
  return row;
}

export async function listHrEmployeeDependents(companyId: UUID, employeeId: UUID): Promise<HrEmployeeDependent[]> {
  return withHrSession('employees:list-dependents', async () => {
  const { data, error } = await insforge.database
    .from('hr_employee_dependents')
    .select('*')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as HrEmployeeDependent[];
  });
}

export async function replaceHrEmployeeDependents(input: {
  companyId: UUID;
  employeeId: UUID;
  actorUserId: UUID;
  dependents: Array<Pick<HrEmployeeDependent, 'dependent_name' | 'relationship' | 'contact_details'>>;
}): Promise<number> {
  return withHrSession('employees:replace-dependents', async () => {
  const payload = input.dependents.map((d) => ({
    dependent_name: d.dependent_name,
    relationship: d.relationship,
    contact_details: d.contact_details ?? null
  }));
  const { data, error } = await insforge.database.rpc('hr_replace_employee_dependents', {
    p_company_id: input.companyId,
    p_employee_id: input.employeeId,
    p_dependents: payload as any
  });
  if (error) throw new Error(getErrorMessage(error));
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'hr.employee_dependents.replace',
    entityType: 'hr_employee',
    entityId: input.employeeId,
    metadata: { dependents: payload.length }
  }).catch(() => {});
  return Number(data ?? 0);
  });
}

export async function archiveHrEmployee(companyId: UUID, employeeId: UUID, actorUserId: UUID): Promise<void> {
  return withHrSession('employees:archive', async () => {
  const { error } = await insforge.database
    .from('hr_employees')
    .update({ employment_status: 'ARCHIVED', updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', employeeId);
  if (error) throw new Error(getErrorMessage(error));
  await createActivityLog({ companyId, actorUserId, action: 'hr.employee.archive', entityType: 'hr_employee', entityId: employeeId });
  });
}

export async function listHrLeaveRequests(companyId: UUID, employeeId?: UUID): Promise<HrLeaveRequest[]> {
  return listTable<HrLeaveRequest>('hr_leave_requests', companyId, employeeId ? { employee_id: employeeId } : undefined);
}

export async function createHrLeaveRequest(input: Omit<HrLeaveRequest, 'id' | 'created_at' | 'updated_at' | 'approved_by_user_id' | 'approved_at' | 'decline_reason'> & {
  approverUserId?: UUID | null;
}): Promise<HrLeaveRequest> {
  const row = await insertTable<HrLeaveRequest>('hr_leave_requests', {
    ...input,
    status: input.status ?? 'SUBMITTED',
    submitted_at: input.submitted_at ?? new Date().toISOString()
  });
  await createActivityLog({
    companyId: input.company_id,
    actorUserId: input.created_by_user_id,
    action: 'hr.leave.request.create',
    entityType: 'hr_leave_request',
    entityId: row.id
  }).catch(() => undefined);
  if (input.approverUserId) {
    await createNotification(input.company_id, input.approverUserId, 'info', 'Leave Approval Required', 'A new leave request requires your approval.');
  }
  return row;
}

export async function applyHrLeaveApproval(input: {
  companyId: UUID;
  leaveRequestId: UUID;
  decision: 'SUPERVISOR_APPROVE' | 'SUPERVISOR_DECLINE' | 'HR_APPROVE' | 'HR_DECLINE';
  actorUserId: UUID;
  declineReason?: string | null;
  employeeUserId?: UUID | null;
}): Promise<HrLeaveRequest> {
  return withHrSession('leave:apply-approval', async () => {
  if ((input.decision === 'SUPERVISOR_DECLINE' || input.decision === 'HR_DECLINE') && !input.declineReason?.trim()) {
    throw new Error('Decline reason is required.');
  }
  const { data, error } = await insforge.database.rpc('hr_apply_leave_approval', {
    p_leave_request_id: input.leaveRequestId,
    p_company_id: input.companyId,
    p_decision: input.decision,
    p_actor_user_id: input.actorUserId,
    p_decline_reason: input.declineReason ?? null
  });
  if (error) throw new Error(getErrorMessage(error));
  const row = data as HrLeaveRequest;
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'hr.leave.approval',
    entityType: 'hr_leave_request',
    entityId: input.leaveRequestId,
    metadata: { decision: input.decision }
  });
  if (input.employeeUserId) {
    const approved = input.decision === 'SUPERVISOR_APPROVE' || input.decision === 'HR_APPROVE';
    await createNotification(
      input.companyId,
      input.employeeUserId,
      approved ? 'success' : 'warning',
      approved ? 'Leave Approved' : 'Leave Declined',
      approved ? 'Your leave request has been approved.' : `Your leave request was declined.${input.declineReason ? ` Reason: ${input.declineReason}` : ''}`
    );
  }
  return row;
  });
}

export async function listHrTimesheets(companyId: UUID, employeeId?: UUID): Promise<HrTimesheet[]> {
  return listTable<HrTimesheet>('hr_timesheets', companyId, employeeId ? { employee_id: employeeId } : undefined, 'date');
}

export async function upsertHrTimesheet(input: Omit<HrTimesheet, 'id' | 'created_at' | 'updated_at' | 'approved_by_user_id' | 'approved_at' | 'decline_reason'>): Promise<HrTimesheet> {
  const row = await upsertTable<HrTimesheet>('hr_timesheets', { ...input, updated_at: new Date().toISOString() }, 'company_id,employee_id,date');
  const d = new Date(input.date);
  await createActivityLog({
    companyId: input.company_id,
    actorUserId: input.created_by_user_id,
    action: 'hr.timesheet.upsert',
    entityType: 'hr_timesheet',
    entityId: row.id
  }).catch(() => undefined);
  await recalculateHrMonthlyHours(input.company_id, input.employee_id, d.getUTCFullYear(), d.getUTCMonth() + 1, input.created_by_user_id).catch(() => {});
  return row;
}

export async function approveHrTimesheet(input: {
  companyId: UUID;
  timesheetId: UUID;
  actorUserId: UUID;
  decision: 'APPROVED' | 'DECLINED';
  declineReason?: string | null;
}): Promise<HrTimesheet> {
  return withHrSession('timesheets:approve', async () => {
  const { data, error } = await insforge.database
    .from('hr_timesheets')
    .update({
      status: input.decision,
      approved_by_user_id: input.actorUserId,
      approved_at: new Date().toISOString(),
      decline_reason: input.decision === 'DECLINED' ? input.declineReason ?? null : null,
      updated_at: new Date().toISOString()
    })
    .eq('company_id', input.companyId)
    .eq('id', input.timesheetId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to approve timesheet');
  const row = data as HrTimesheet;
  const d = new Date(row.date);
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'hr.timesheet.approval',
    entityType: 'hr_timesheet',
    entityId: input.timesheetId,
    metadata: { decision: input.decision }
  }).catch(() => undefined);
  await recalculateHrMonthlyHours(row.company_id, row.employee_id, d.getUTCFullYear(), d.getUTCMonth() + 1, input.actorUserId).catch(() => {});
  return row;
  });
}

export async function listHrRecords(companyId: UUID, table:
  | 'hr_employee_documents'
  | 'hr_employment_contracts'
  | 'hr_leave_types'
  | 'hr_leave_balances'
  | 'hr_performance_reviews'
  | 'hr_disciplinary_cases'
  | 'hr_policy_acknowledgements'
  | 'hr_vacancies'
  | 'hr_applicants'
  | 'hr_interview_notes'
  | 'hr_monthly_hours'
  | 'hr_ack_documents'
  | 'hr_ack_receipts'
  | 'hr_employee_wellness_assessments'
  | 'hr_employee_wellness_actions',
  filters?: Record<string, string | number | boolean | null>
): Promise<HrSimpleRecord[]> {
  return listTable<HrSimpleRecord>(table, companyId, filters);
}

export async function createHrRecord(
  table:
    | 'hr_employee_documents'
    | 'hr_employment_contracts'
    | 'hr_leave_types'
    | 'hr_leave_balances'
    | 'hr_performance_reviews'
    | 'hr_disciplinary_cases'
    | 'hr_policy_acknowledgements'
    | 'hr_vacancies'
    | 'hr_applicants'
    | 'hr_interview_notes'
    | 'hr_monthly_hours'
    | 'hr_ack_documents'
    | 'hr_ack_receipts'
    | 'hr_employee_wellness_assessments'
    | 'hr_employee_wellness_actions',
  payload: Record<string, unknown>
): Promise<HrSimpleRecord> {
  const row = await insertTable<HrSimpleRecord>(table, payload);
  const companyId = payload.company_id as UUID | undefined;
  const actorUserId = payload.created_by_user_id as UUID | undefined;
  if (companyId && actorUserId) {
    await createActivityLog({
      companyId,
      actorUserId,
      action: `hr.${table}.create`,
      entityType: table,
      entityId: row.id
    }).catch(() => {});
  }
  return row;
}

export async function updateHrRecord(
  table:
    | 'hr_employee_documents'
    | 'hr_employment_contracts'
    | 'hr_leave_types'
    | 'hr_leave_balances'
    | 'hr_performance_reviews'
    | 'hr_disciplinary_cases'
    | 'hr_policy_acknowledgements'
    | 'hr_vacancies'
    | 'hr_applicants'
    | 'hr_interview_notes'
    | 'hr_leave_requests'
    | 'hr_timesheets'
    | 'hr_monthly_hours'
    | 'hr_ack_documents'
    | 'hr_ack_receipts'
    | 'hr_employee_wellness_assessments'
    | 'hr_employee_wellness_actions',
  input: {
    companyId: UUID;
    rowId: UUID;
    actorUserId: UUID;
    patch: Record<string, unknown>;
  }
): Promise<HrSimpleRecord> {
  return withHrSession(`update:${table}`, async () => {
  const { data, error } = await insforge.database
    .from(table)
    .update({ ...input.patch, updated_at: new Date().toISOString() })
    .eq('company_id', input.companyId)
    .eq('id', input.rowId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error(`Failed to update ${table} row.`);
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: `hr.${table}.update`,
    entityType: table,
    entityId: input.rowId
  }).catch(() => {});
  return data as HrSimpleRecord;
  });
}

export async function deleteHrRecord(
  table:
    | 'hr_employee_documents'
    | 'hr_employment_contracts'
    | 'hr_leave_types'
    | 'hr_leave_balances'
    | 'hr_performance_reviews'
    | 'hr_disciplinary_cases'
    | 'hr_policy_acknowledgements'
    | 'hr_vacancies'
    | 'hr_applicants'
    | 'hr_interview_notes'
    | 'hr_leave_requests'
    | 'hr_timesheets'
    | 'hr_monthly_hours'
    | 'hr_ack_documents'
    | 'hr_ack_receipts'
    | 'hr_employee_wellness_assessments'
    | 'hr_employee_wellness_actions',
  input: {
    companyId: UUID;
    rowId: UUID;
    actorUserId: UUID;
  }
): Promise<void> {
  return withHrSession(`delete:${table}`, async () => {
  const { error } = await insforge.database
    .from(table)
    .delete()
    .eq('company_id', input.companyId)
    .eq('id', input.rowId);
  if (error) throw new Error(getErrorMessage(error));
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: `hr.${table}.delete`,
    entityType: table,
    entityId: input.rowId
  }).catch(() => {});
  });
}

export async function listEmployeeWellnessAssessments(input: {
  companyId: UUID;
  employeeId?: UUID;
}): Promise<HrEmployeeWellnessAssessment[]> {
  const filters: Record<string, string | number | boolean | null> = {};
  if (input.employeeId) filters.employee_id = input.employeeId;
  const rows = await listHrRecords(input.companyId, 'hr_employee_wellness_assessments', filters);
  return rows as HrEmployeeWellnessAssessment[];
}

export async function getEmployeeWellnessAssessment(input: {
  companyId: UUID;
  assessmentId: UUID;
}): Promise<{ assessment: HrEmployeeWellnessAssessment | null; actions: HrEmployeeWellnessAction[] }> {
  return withHrSession('wellness:get-assessment', async () => {
  const { data, error } = await insforge.database
    .from('hr_employee_wellness_assessments')
    .select('*')
    .eq('company_id', input.companyId)
    .eq('id', input.assessmentId)
    .maybeSingle();
  if (error) throw new Error(getErrorMessage(error));
  const assessment = (data as HrEmployeeWellnessAssessment) ?? null;
  if (!assessment) return { assessment: null, actions: [] };
  const actions = (await listHrRecords(input.companyId, 'hr_employee_wellness_actions', { assessment_id: input.assessmentId })) as HrEmployeeWellnessAction[];
  return { assessment, actions };
  });
}

export async function createEmployeeWellnessAssessment(input: {
  companyId: UUID;
  employeeId: UUID;
  departmentId: UUID | null;
  assessmentDate: string;
  header: {
    companyName: string | null;
    employeeNumber: string | null;
    jobTitle: string | null;
    lineManagerName: string | null;
  };
  wellnessAssessmentAnswers: Record<string, unknown>;
  healthLifestyleAssessment: Record<string, unknown>;
  workplaceWellnessNeeds: Record<string, unknown>;
  programmeParticipation: Record<string, unknown>;
  approvals: {
    employeeSignature: string | null;
    wellnessOfficerSignature: string | null;
    approvalDate: string | null;
  };
  actions: Array<{
    identifiedIssue: string;
    actionRequired: string;
    responsibleEmployeeId: UUID | null;
    targetDate: string | null;
  }>;
  actorUserId: UUID;
}): Promise<{ assessment: HrEmployeeWellnessAssessment; actions: HrEmployeeWellnessAction[] }> {
  const payload = {
    company_id: input.companyId,
    employee_id: input.employeeId,
    department_id: input.departmentId,
    assessment_date: input.assessmentDate,
    company_name: input.header.companyName,
    employee_number: input.header.employeeNumber,
    job_title: input.header.jobTitle,
    line_manager_name: input.header.lineManagerName,
    wellness_assessment_answers: input.wellnessAssessmentAnswers,
    health_lifestyle_assessment: input.healthLifestyleAssessment,
    workplace_wellness_needs: input.workplaceWellnessNeeds,
    programme_participation: input.programmeParticipation,
    employee_signature: input.approvals.employeeSignature,
    wellness_officer_signature: input.approvals.wellnessOfficerSignature,
    approval_date: input.approvals.approvalDate,
    created_by_user_id: input.actorUserId
  };
  const assessmentRow = (await createHrRecord('hr_employee_wellness_assessments', payload)) as HrEmployeeWellnessAssessment;

  const actions: HrEmployeeWellnessAction[] = [];
  for (const row of input.actions) {
    if (!row.identifiedIssue.trim() && !row.actionRequired.trim()) continue;
    const actionPayload = {
      company_id: input.companyId,
      assessment_id: assessmentRow.id,
      identified_issue: row.identifiedIssue,
      action_required: row.actionRequired,
      responsible_employee_id: row.responsibleEmployeeId,
      target_date: row.targetDate,
      status: 'OPEN',
      created_by_user_id: input.actorUserId
    };
    const created = (await createHrRecord('hr_employee_wellness_actions', actionPayload)) as HrEmployeeWellnessAction;
    actions.push(created);
  }

  return { assessment: assessmentRow, actions };
}

export async function updateEmployeeWellnessAssessment(input: {
  companyId: UUID;
  assessmentId: UUID;
  departmentId: UUID | null;
  assessmentDate: string;
  header: {
    companyName: string | null;
    employeeNumber: string | null;
    jobTitle: string | null;
    lineManagerName: string | null;
  };
  wellnessAssessmentAnswers: Record<string, unknown>;
  healthLifestyleAssessment: Record<string, unknown>;
  workplaceWellnessNeeds: Record<string, unknown>;
  programmeParticipation: Record<string, unknown>;
  approvals: {
    employeeSignature: string | null;
    wellnessOfficerSignature: string | null;
    approvalDate: string | null;
  };
  actions: Array<{
    id?: UUID;
    identifiedIssue: string;
    actionRequired: string;
    responsibleEmployeeId: UUID | null;
    targetDate: string | null;
    status?: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED';
    completedDate?: string | null;
  }>;
  actorUserId: UUID;
}): Promise<{ assessment: HrEmployeeWellnessAssessment; actions: HrEmployeeWellnessAction[] }> {
  return withHrSession('wellness:update-assessment', async () => {
  const patch = {
    department_id: input.departmentId,
    assessment_date: input.assessmentDate,
    company_name: input.header.companyName,
    employee_number: input.header.employeeNumber,
    job_title: input.header.jobTitle,
    line_manager_name: input.header.lineManagerName,
    wellness_assessment_answers: input.wellnessAssessmentAnswers,
    health_lifestyle_assessment: input.healthLifestyleAssessment,
    workplace_wellness_needs: input.workplaceWellnessNeeds,
    programme_participation: input.programmeParticipation,
    employee_signature: input.approvals.employeeSignature,
    wellness_officer_signature: input.approvals.wellnessOfficerSignature,
    approval_date: input.approvals.approvalDate,
    updated_by_user_id: input.actorUserId
  };
  const updated = (await updateHrRecord('hr_employee_wellness_assessments', {
    companyId: input.companyId,
    rowId: input.assessmentId,
    actorUserId: input.actorUserId,
    patch
  })) as HrEmployeeWellnessAssessment;

  const existing = (await listHrRecords(input.companyId, 'hr_employee_wellness_actions', {
    assessment_id: input.assessmentId
  })) as HrEmployeeWellnessAction[];
  const existingById = new Map(existing.map((row) => [row.id, row]));

  const nextActions: HrEmployeeWellnessAction[] = [];

  for (const row of input.actions) {
    const trimmedIssue = row.identifiedIssue.trim();
    const trimmedAction = row.actionRequired.trim();
    if (!trimmedIssue && !trimmedAction && !row.id) continue;

    if (row.id && existingById.has(row.id)) {
      const patchRow: Record<string, unknown> = {
        identified_issue: trimmedIssue,
        action_required: trimmedAction,
        responsible_employee_id: row.responsibleEmployeeId,
        target_date: row.targetDate,
        status: row.status ?? 'OPEN',
        completed_date: row.completedDate ?? null,
        updated_by_user_id: input.actorUserId
      };
      const updatedAction = (await updateHrRecord('hr_employee_wellness_actions', {
        companyId: input.companyId,
        rowId: row.id,
        actorUserId: input.actorUserId,
        patch: patchRow
      })) as HrEmployeeWellnessAction;
      nextActions.push(updatedAction);
      existingById.delete(row.id);
    } else if (trimmedIssue || trimmedAction) {
      const created = (await createHrRecord('hr_employee_wellness_actions', {
        company_id: input.companyId,
        assessment_id: input.assessmentId,
        identified_issue: trimmedIssue,
        action_required: trimmedAction,
        responsible_employee_id: row.responsibleEmployeeId,
        target_date: row.targetDate,
        status: row.status ?? 'OPEN',
        completed_date: row.completedDate ?? null,
        created_by_user_id: input.actorUserId
      })) as HrEmployeeWellnessAction;
      nextActions.push(created);
    }
  }

  for (const [remainingId] of existingById) {
    await insforge.database
      .from('hr_employee_wellness_actions')
      .delete()
      .eq('company_id', input.companyId)
      .eq('id', remainingId);
  }

  return { assessment: updated, actions: nextActions };
  });
}

export async function upsertHrSettings(input: {
  company_id: UUID;
  owner_can_view_restricted?: boolean;
  leave_requires_hr_final_approval?: boolean;
  leave_escalation_days?: number;
  repeat_offence_window_months?: number;
  working_days?: string[];
}): Promise<Record<string, unknown>> {
  return upsertTable<Record<string, unknown>>('hr_settings', { ...input, updated_at: new Date().toISOString() }, 'company_id');
}

export async function getHrSettings(companyId: UUID): Promise<Record<string, unknown> | null> {
  return withHrSession('settings:get', async () => {
  const { data, error } = await insforge.database.from('hr_settings').select('*').eq('company_id', companyId).maybeSingle();
  if (error) throw new Error(getErrorMessage(error));
  return (data as Record<string, unknown>) ?? null;
  });
}

export async function ensureDefaultHrLeaveTypes(companyId: UUID, createdByUserId: UUID): Promise<void> {
  const defaults = [
    'Annual Leave',
    'Sick Leave',
    'Maternity Leave',
    'Parental Leave',
    'Adoption Leave',
    'Commissioning Parental Leave (Surrogacy)',
    'Family Responsibility Leave',
    'Study Leave',
    'Compassionate Leave (Extended)',
    'Unpaid Leave',
    'Special Leave',
    'Occupational Injury Leave'
  ];
  const existing = await listHrRecords(companyId, 'hr_leave_types');
  const seen = new Set(existing.map((x) => String(x.name ?? '').trim().toLowerCase()).filter(Boolean));
  const missing = defaults.filter((name) => !seen.has(name.toLowerCase()));
  for (const name of missing) {
    await createHrRecord('hr_leave_types', {
      company_id: companyId,
      name,
      paid: !['Unpaid Leave'].includes(name),
      requires_proof: ['Sick Leave', 'Maternity Leave', 'Occupational Injury Leave'].includes(name),
      default_days_per_year: name === 'Annual Leave' ? 15 : 0,
      carry_over_allowed: name === 'Annual Leave',
      created_by_user_id: createdByUserId
    });
  }
}

export async function getOrCreateHrLeaveTypeByName(companyId: UUID, createdByUserId: UUID, name: string): Promise<UUID> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Leave type is required.');
  const all = await listHrRecords(companyId, 'hr_leave_types');
  const existing = all.find((x) => String(x.name ?? '').trim().toLowerCase() === trimmed.toLowerCase());
  if (existing?.id) return existing.id as UUID;
  const created = await createHrRecord('hr_leave_types', {
    company_id: companyId,
    name: trimmed,
    paid: true,
    requires_proof: false,
    default_days_per_year: 0,
    carry_over_allowed: false,
    created_by_user_id: createdByUserId
  });
  return created.id as UUID;
}

export async function canViewRestrictedFields(companyId: UUID): Promise<boolean> {
  return withHrSession('restricted-fields:can-view', async () => {
  const { data, error } = await insforge.database.rpc('hr_can_view_restricted_fields', { p_company_id: companyId });
  if (error) throw new Error(getErrorMessage(error));
  return Boolean(data);
  });
}

export async function logRestrictedFieldAccess(input: {
  companyId: UUID;
  actorUserId: UUID;
  targetEntity: string;
  targetId: UUID;
  fieldName: string;
  action: 'view' | 'export';
}): Promise<void> {
  return withHrSession('restricted-fields:log-access', async () => {
  const { error } = await insforge.database.from('hr_restricted_field_access_logs').insert({
    company_id: input.companyId,
    actor_user_id: input.actorUserId,
    target_entity: input.targetEntity,
    target_id: input.targetId,
    field_name: input.fieldName,
    action: input.action
  });
  if (error) throw new Error(getErrorMessage(error));
  });
}

export async function getHrDashboardStats(companyId: UUID, selectedFromDate?: string): Promise<HrDashboardStats> {
  return withHrSession('dashboard:stats', async () => {
  const now = new Date();
  const date30 = new Date(now);
  date30.setDate(date30.getDate() + 30);
  const date14 = new Date(now);
  date14.setDate(date14.getDate() + 14);
  const date7 = new Date(now);
  date7.setDate(date7.getDate() + 7);
  const periodStart = selectedFromDate ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

  const [onboardingEmployees, activeEmployees, terminatedEmployees, pendingLeaveApprovals, disciplinaryOpen, disciplinaryRepeatOffence] = await Promise.all([
    getCount('hr_employees', companyId, { employment_status: 'ONBOARDING' }),
    getCount('hr_employees', companyId, { employment_status: 'ACTIVE' }),
    getCount('hr_employees', companyId, { employment_status: 'TERMINATED' }),
    getCount('hr_leave_requests', companyId, { status: 'SUBMITTED' }),
    getCount('hr_disciplinary_cases', companyId, { status: 'OPEN' }),
    getCount('hr_disciplinary_cases', companyId, { repeat_offence_flag: true })
  ]);

  const { count: approvedUpcomingLeave } = await insforge.database
    .from('hr_leave_requests')
    .select('*', { count: 'planned', head: true })
    .eq('company_id', companyId)
    .eq('status', 'APPROVED')
    .gte('start_date', now.toISOString().slice(0, 10));

  const { count: overdueLeaveApprovals } = await insforge.database
    .from('hr_leave_requests')
    .select('*', { count: 'planned', head: true })
    .eq('company_id', companyId)
    .eq('status', 'SUBMITTED')
    .lte('created_at', new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString());

  const queryContractsCount = async (dateStr: string) => {
    const { count } = await insforge.database
      .from('hr_employment_contracts')
      .select('*', { count: 'planned', head: true })
      .eq('company_id', companyId)
      .eq('status', 'ACTIVE')
      .lte('end_date', dateStr);
    return count ?? 0;
  };

  const [contractsExpiring30Days, contractsExpiring14Days, contractsExpiring7Days] = await Promise.all([
    queryContractsCount(date30.toISOString().slice(0, 10)),
    queryContractsCount(date14.toISOString().slice(0, 10)),
    queryContractsCount(date7.toISOString().slice(0, 10))
  ]);

  const { data: timesheets } = await insforge.database.from('hr_timesheets').select('hours_worked,overtime_hours').eq('company_id', companyId).gte('date', periodStart);
  const hoursWorkedSelectedPeriod = (timesheets ?? []).reduce((acc: number, row: { hours_worked: number; overtime_hours: number }) => acc + Number(row.hours_worked || 0) + Number(row.overtime_hours || 0), 0);

  const { count: hrDocsExpiringSoon } = await insforge.database
    .from('hr_employee_documents')
    .select('*', { count: 'planned', head: true })
    .eq('company_id', companyId)
    .gte('expiry_date', now.toISOString().slice(0, 10))
    .lte('expiry_date', date30.toISOString().slice(0, 10));

  const { count: hrDocsExpired } = await insforge.database
    .from('hr_employee_documents')
    .select('*', { count: 'planned', head: true })
    .eq('company_id', companyId)
    .or(`status.eq.EXPIRED,expiry_date.lt.${now.toISOString().slice(0, 10)}`);

  const { count: ackTotal } = await insforge.database
    .from('hr_ack_receipts')
    .select('*', { count: 'planned', head: true })
    .eq('company_id', companyId);
  const { count: ackDone } = await insforge.database
    .from('hr_ack_receipts')
    .select('*', { count: 'planned', head: true })
    .eq('company_id', companyId)
    .in('status', ['ACKNOWLEDGED', 'SIGNED']);

  const { count: trainingCompleted } = await insforge.database.from('training_records').select('*', { count: 'planned', head: true }).eq('company_id', companyId).eq('status', 'COMPLETED');
  const { count: trainingTotal } = await insforge.database.from('training_records').select('*', { count: 'planned', head: true }).eq('company_id', companyId);

  return {
    totalEmployees: onboardingEmployees + activeEmployees + terminatedEmployees,
    onboardingEmployees,
    activeEmployees,
    terminatedEmployees,
    pendingLeaveApprovals,
    approvedUpcomingLeave: approvedUpcomingLeave ?? 0,
    overdueLeaveApprovals: overdueLeaveApprovals ?? 0,
    contractsExpiring30Days,
    contractsExpiring14Days,
    contractsExpiring7Days,
    hoursWorkedSelectedPeriod,
    trainingCompliancePercent: trainingTotal ? Math.round(((trainingCompleted ?? 0) / trainingTotal) * 100) : 0,
    disciplinaryOpen,
    disciplinaryRepeatOffence,
    hrDocsExpiringSoon: hrDocsExpiringSoon ?? 0,
    hrDocsExpired: hrDocsExpired ?? 0,
    acknowledgementCompletionPercent: ackTotal ? Math.round(((ackDone ?? 0) / ackTotal) * 100) : 0
  };
  });
}

export async function getEmployeeIntegratedProfile(companyId: UUID, employeeId: UUID): Promise<Record<string, unknown>> {
  return withHrSession('employees:integrated-profile', async () => {
  const employee = await getHrEmployeeById(companyId, employeeId);
  if (!employee) return { employee: null };

  const canSensitive = await canAccessSensitiveEmployeeFields(companyId).catch(() => false);

  const [documents, contracts, leaveRequests, balances, timesheets, performance, disciplinary, monthlyHours, auditTrail, trainingRecords, incidents, healthExpiring, assignedTasks, kpiHistory] = await Promise.all([
    listHrRecords(companyId, 'hr_employee_documents', { employee_id: employeeId }),
    listHrRecords(companyId, 'hr_employment_contracts', { employee_id: employeeId }),
    listHrLeaveRequests(companyId, employeeId),
    listHrRecords(companyId, 'hr_leave_balances', { employee_id: employeeId }),
    listHrTimesheets(companyId, employeeId),
    listHrRecords(companyId, 'hr_performance_reviews', { employee_id: employeeId }),
    listHrRecords(companyId, 'hr_disciplinary_cases', { employee_id: employeeId }),
    listHrRecords(companyId, 'hr_monthly_hours', { employee_id: employeeId }),
    listActivityLogsByEntity({ companyId, entityType: 'hr_employee', entityId: employeeId, limit: 100 }),
    (async () => {
      if (!employee.user_id) return [];
      const { data, error } = await insforge.database.from('training_records').select('*').eq('company_id', companyId).eq('user_id', employee.user_id);
      if (error) throw new Error(getErrorMessage(error));
      return (data ?? []) as Array<Record<string, unknown>>;
    })(),
    (async () => {
      if (!employee.user_id) return [];
      const { data, error } = await insforge.database.from('incidents').select('*').eq('company_id', companyId).eq('affected_user_id', employee.user_id);
      if (error) throw new Error(getErrorMessage(error));
      return (data ?? []) as Array<Record<string, unknown>>;
    })(),
    (async () => {
      if (!employee.user_id) return [];
      const { data, error } = await insforge.database.from('health_medicals').select('id,expiry_date,fitness_status').eq('company_id', companyId).eq('employee_user_id', employee.user_id).not('expiry_date', 'is', null);
      if (error) throw new Error(getErrorMessage(error));
      return (data ?? []) as Array<Record<string, unknown>>;
    })(),
    (async () => {
      if (!employee.user_id) return [];
      const { data, error } = await insforge.database
        .from('tasks')
        .select('id,title,status,due_at,priority,source_entity_type,source_entity_id')
        .eq('company_id', companyId)
        .eq('assignee_user_id', employee.user_id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw new Error(getErrorMessage(error));
      return (data ?? []) as Array<Record<string, unknown>>;
    })(),
    (async () => {
      if (!employee.user_id) return [];
      const { data: assessments, error: assessErr } = await insforge.database
        .from('kpi_assessments')
        .select('assessment_id,assessment_name,period_start_date,period_end_date,status,employee_id,employee_name_snapshot,manager_id,manager_name_snapshot')
        .eq('organization_id', companyId)
        .eq('employee_id', employee.user_id)
        .order('period_end_date', { ascending: false })
        .limit(100);
      if (assessErr) throw new Error(getErrorMessage(assessErr));
      const assessmentList = (assessments ?? []) as Array<Record<string, unknown>>;
      const assessmentIds = assessmentList.map((a) => String(a.assessment_id)).filter(Boolean);
      if (assessmentIds.length === 0) return [];

      const { data: lines, error: linesErr } = await insforge.database
        .from('kpi_assessment_lines')
        .select('line_id,assessment_id,kpi_questionnaire,kpi_title,importance_rating,employee_own_rating,manager_rating,achievement_status,weighted_score')
        .in('assessment_id', assessmentIds);
      if (linesErr) throw new Error(getErrorMessage(linesErr));

      const assessmentsById = new Map(assessmentList.map((a) => [String(a.assessment_id), a]));
      return ((lines ?? []) as Array<Record<string, unknown>>).map((line) => {
        const assessment = assessmentsById.get(String(line.assessment_id));
        return {
          line_id: line.line_id,
          assessment_id: line.assessment_id,
          kpi_name: line.kpi_questionnaire ?? line.kpi_title,
          assessment_period: `${assessment?.period_start_date ?? ''} to ${assessment?.period_end_date ?? ''}`,
          target: line.importance_rating ?? null,
          actual_performance: line.weighted_score ?? null,
          manager_rating: line.manager_rating ?? null,
          status:
            line.achievement_status === 'achieved'
              ? 'Achieved'
              : line.achievement_status === 'partially_achieved'
                ? 'Partially Achieved'
                : line.achievement_status === 'not_achieved'
                  ? 'Not Achieved'
                  : line.manager_rating == null
                    ? 'Pending'
                    : Number(line.manager_rating) >= 4
                      ? 'Achieved'
                      : Number(line.manager_rating) === 3
                        ? 'Partially Achieved'
                        : 'Not Achieved'
        };
      });
    })()
  ]);

  const [sensitiveDetails, dependents] = canSensitive
    ? await Promise.all([
      getHrEmployeeSensitiveDetails(companyId, employeeId).catch(() => null),
      listHrEmployeeDependents(companyId, employeeId).catch(() => [])
    ])
    : [null, [] as HrEmployeeDependent[]];

  return {
    employee,
    documents,
    contracts,
    leaveRequests,
    balances,
    timesheets,
    performance,
    disciplinary,
    monthlyHours,
    trainingRecords,
    incidents,
    healthExpiring,
    assignedTasks,
    kpiHistory,
    auditTrail,
    canSensitive,
    sensitiveDetails,
    dependents
  };
  });
}

export async function getHrEmployeeExportRows(companyId: UUID): Promise<Array<Record<string, unknown>>> {
  const rows = await listHrEmployees(companyId);
  return rows.map((row) => ({
    employeeNo: row.employee_no,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    jobTitle: row.job_title,
    employmentType: row.employment_type,
    employmentStatus: row.employment_status,
    startDate: row.start_date,
    endDate: row.end_date
  }));
}

export async function getHrLeaveExportRows(companyId: UUID): Promise<Array<Record<string, unknown>>> {
  const rows = await listHrLeaveRequests(companyId);
  return rows.map((row) => ({
    leaveRequestId: row.id,
    employeeId: row.employee_id,
    leaveTypeId: row.leave_type_id,
    startDate: row.start_date,
    endDate: row.end_date,
    totalDays: row.total_days,
    status: row.status,
    supervisorApprovalStatus: row.supervisor_approval_status,
    hrApprovalStatus: row.hr_approval_status
  }));
}

export async function getHrTimesheetExportRows(companyId: UUID): Promise<Array<Record<string, unknown>>> {
  const rows = await listHrTimesheets(companyId);
  return rows.map((row) => ({
    timesheetId: row.id,
    employeeId: row.employee_id,
    date: row.date,
    hoursWorked: row.hours_worked,
    overtimeHours: row.overtime_hours,
    status: row.status,
    projectOrClient: row.project_or_client
  }));
}

export async function getHrDisciplinaryExportRows(companyId: UUID): Promise<Array<Record<string, unknown>>> {
  const rows = await listHrRecords(companyId, 'hr_disciplinary_cases');
  return rows.map((row) => ({
    id: row.id,
    employeeId: row.employee_id,
    caseType: row.case_type,
    warningLevel: row.warning_level,
    offenceCategory: row.offence_category,
    offenceSubcategory: row.offence_subcategory,
    description: row.description,
    dateIssued: row.date_issued,
    outcome: row.outcome,
    repeatOffenceFlag: row.repeat_offence_flag,
    status: row.status,
    createdAt: row.created_at
  }));
}

function dayDiff(dateIso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateIso);
  d.setHours(0, 0, 0, 0);
  const ms = d.getTime() - today.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export function getDocumentExpiryStatus(row: {
  expiry_date?: string | null;
  status?: string | null;
}): HrDocumentExpiryStatus {
  if (String(row.status ?? '').toUpperCase() === 'ARCHIVED') return 'archived';
  if (!row.expiry_date) return 'active';
  const diff = dayDiff(row.expiry_date);
  if (diff < 0) return 'expired';
  if (diff <= 7) return 'expiring_7';
  if (diff <= 30) return 'expiring_30';
  return 'active';
}

export async function listHrPersonalDocuments(input: {
  companyId: UUID;
  actorRole: string | null;
  actorUserId: UUID;
  employeeId?: UUID;
}): Promise<HrPersonalDocumentRow[]> {
  return withHrSession('personal-documents:list', async () => {
  let q = insforge.database
    .from('hr_employee_documents')
    .select('*')
    .eq('company_id', input.companyId)
    .order('created_at', { ascending: false });

  if (input.employeeId) q = q.eq('employee_id', input.employeeId);
  const role = input.actorRole ?? '';
  if (role === 'employee') {
    const me = await getHrEmployeeByUserId(input.companyId, input.actorUserId);
    if (!me) return [];
    q = q.eq('employee_id', me.id);
  } else if (role === 'supervisor') {
    const { data: team, error: teamError } = await insforge.database
      .from('hr_employees')
      .select('id')
      .eq('company_id', input.companyId)
      .eq('supervisor_user_id', input.actorUserId);
    if (teamError) throw new Error(getErrorMessage(teamError));
    const teamIds = (team ?? []).map((x: any) => x.id as UUID);
    if (teamIds.length === 0) return [];
    q = q.in('employee_id', teamIds);
  } else if (role === 'owner') {
    return [];
  }

  const { data, error } = await q;
  if (error) throw new Error(getErrorMessage(error));
  return ((data ?? []) as HrPersonalDocumentRow[]).map((row) => ({
    ...row,
    doc_name: row.doc_name ?? row.title,
    status: getDocumentExpiryStatus(row) === 'expired' && row.status === 'ACTIVE' ? 'EXPIRED' : row.status
  }));
  });
}

export async function createHrPersonalDocument(input: {
  companyId: UUID;
  employeeId: UUID;
  docType: string;
  docName: string;
  fileIds: UUID[];
  issueDate?: string | null;
  expiryDate?: string | null;
  notes?: string | null;
  uploadedByUserId: UUID;
}): Promise<HrPersonalDocumentRow> {
  return withHrSession('personal-documents:create', async () => {
  const { data, error } = await insforge.database
    .from('hr_employee_documents')
    .insert({
      company_id: input.companyId,
      employee_id: input.employeeId,
      doc_type: input.docType,
      title: input.docName,
      doc_name: input.docName,
      file_ids: input.fileIds,
      issue_date: input.issueDate ?? null,
      expiry_date: input.expiryDate ?? null,
      notes: input.notes ?? null,
      status: getDocumentExpiryStatus({ expiry_date: input.expiryDate }) === 'expired' ? 'EXPIRED' : 'ACTIVE',
      visible_to_employee: true,
      uploaded_by_user_id: input.uploadedByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create personal HR document.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.uploadedByUserId,
    action: 'hr.personal_document.create',
    entityType: 'hr_employee_document',
    entityId: (data as any).id as UUID
  });
  return data as HrPersonalDocumentRow;
  });
}

export async function updateHrPersonalDocument(input: {
  companyId: UUID;
  documentId: UUID;
  actorUserId: UUID;
  patch: Partial<Pick<HrPersonalDocumentRow, 'doc_name' | 'doc_type' | 'issue_date' | 'expiry_date' | 'notes' | 'status' | 'acknowledged_by_employee' | 'acknowledged_at'>>;
}): Promise<HrPersonalDocumentRow> {
  return withHrSession('personal-documents:update', async () => {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof input.patch.doc_name !== 'undefined') {
    patch.doc_name = input.patch.doc_name;
    patch.title = input.patch.doc_name;
  }
  if (typeof input.patch.doc_type !== 'undefined') patch.doc_type = input.patch.doc_type;
  if (typeof input.patch.issue_date !== 'undefined') patch.issue_date = input.patch.issue_date;
  if (typeof input.patch.expiry_date !== 'undefined') patch.expiry_date = input.patch.expiry_date;
  if (typeof input.patch.notes !== 'undefined') patch.notes = input.patch.notes;
  if (typeof input.patch.status !== 'undefined') patch.status = input.patch.status;
  if (typeof input.patch.acknowledged_by_employee !== 'undefined') patch.acknowledged_by_employee = input.patch.acknowledged_by_employee;
  if (typeof input.patch.acknowledged_at !== 'undefined') patch.acknowledged_at = input.patch.acknowledged_at;

  const { data, error } = await insforge.database
    .from('hr_employee_documents')
    .update(patch)
    .eq('company_id', input.companyId)
    .eq('id', input.documentId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update personal HR document.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'hr.personal_document.update',
    entityType: 'hr_employee_document',
    entityId: input.documentId
  });
  return data as HrPersonalDocumentRow;
  });
}

export async function deleteHrPersonalDocument(input: {
  companyId: UUID;
  documentId: UUID;
  actorUserId: UUID;
}): Promise<void> {
  return withHrSession('personal-documents:delete', async () => {
  const { error } = await insforge.database
    .from('hr_employee_documents')
    .delete()
    .eq('company_id', input.companyId)
    .eq('id', input.documentId);
  if (error) throw new Error(getErrorMessage(error));

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'hr.personal_document.delete',
    entityType: 'hr_employee_document',
    entityId: input.documentId
  }).catch(() => {});
  });
}

export async function createHrAcknowledgementDocument(input: {
  companyId: UUID;
  actorUserId: UUID;
  title: string;
  category: string;
  fileIds: UUID[];
  version?: string | null;
  effectiveDate?: string | null;
  reviewDate?: string | null;
  assignedAll: boolean;
  assignedDepartmentIds?: UUID[] | null;
  assignedRoles?: string[] | null;
  acknowledgementRequired: boolean;
  signatureRequired: boolean;
}): Promise<HrAckDocumentRow> {
  return withHrSession('ack-documents:create', async () => {
  const { data, error } = await insforge.database
    .from('hr_ack_documents')
    .insert({
      company_id: input.companyId,
      title: input.title,
      category: input.category,
      file_ids: input.fileIds,
      version: input.version ?? null,
      effective_date: input.effectiveDate ?? null,
      review_date: input.reviewDate ?? null,
      assigned_all: input.assignedAll,
      assigned_department_ids: input.assignedDepartmentIds ?? null,
      assigned_roles: input.assignedRoles ?? null,
      acknowledgement_required: input.acknowledgementRequired,
      signature_required: input.signatureRequired,
      created_by_user_id: input.actorUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create acknowledgement document.');

  const { data: employees, error: empError } = await insforge.database
    .from('hr_employees')
    .select('id,user_id,department_id')
    .eq('company_id', input.companyId)
    .in('employment_status', ['ONBOARDING', 'ACTIVE', 'ON_LEAVE', 'SUSPENDED']);
  if (empError) throw new Error(getErrorMessage(empError));

  const assignedRoleSet = new Set((input.assignedRoles ?? []).map((r) => r.toLowerCase()));
  const assignedDeptSet = new Set((input.assignedDepartmentIds ?? []).map((x) => String(x)));

  let eligible = (employees ?? []) as any[];
  if (!input.assignedAll && (assignedDeptSet.size > 0 || assignedRoleSet.size > 0)) {
    let membershipMap = new Map<string, string>();
    if (assignedRoleSet.size > 0) {
      const userIds = eligible.map((e) => e.user_id).filter(Boolean);
      if (userIds.length > 0) {
        const { data: memberships } = await insforge.database
          .from('company_memberships')
          .select('user_id, role')
          .eq('company_id', input.companyId)
          .in('user_id', userIds);
        for (const m of memberships ?? []) membershipMap.set(String((m as any).user_id), String((m as any).role).toLowerCase());
      }
    }
    eligible = eligible.filter((e) => {
      const deptOk = assignedDeptSet.size === 0 || (e.department_id && assignedDeptSet.has(String(e.department_id)));
      const roleVal = e.user_id ? membershipMap.get(String(e.user_id)) : null;
      const roleOk = assignedRoleSet.size === 0 || (roleVal ? assignedRoleSet.has(roleVal) : false);
      return deptOk && roleOk;
    });
  }

  const rows = eligible.map((e) => ({
    company_id: input.companyId,
    ack_document_id: (data as any).id as UUID,
    employee_id: e.id as UUID,
    employee_user_id: (e.user_id as UUID | null) ?? null,
    status: 'PENDING'
  }));
  if (rows.length > 0) {
    await insforge.database.from('hr_ack_receipts').upsert(rows, { onConflict: 'company_id,ack_document_id,employee_id' });
  }

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'hr.ack_document.create',
    entityType: 'hr_ack_document',
    entityId: (data as any).id as UUID
  });
  return data as HrAckDocumentRow;
  });
}

export async function listHrAcknowledgementDocuments(input: {
  companyId: UUID;
  actorRole: string | null;
  actorUserId: UUID;
}): Promise<Array<HrAckDocumentRow & { receipts?: HrAckReceiptRow[] }>> {
  return withHrSession('ack-documents:list', async () => {
  const { data, error } = await insforge.database
    .from('hr_ack_documents')
    .select('*')
    .eq('company_id', input.companyId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(getErrorMessage(error));
  const docs = (data ?? []) as HrAckDocumentRow[];

  const role = input.actorRole ?? '';
  if (role === 'employee') {
    const me = await getHrEmployeeByUserId(input.companyId, input.actorUserId);
    if (!me) return [];
    const { data: rec } = await insforge.database
      .from('hr_ack_receipts')
      .select('*')
      .eq('company_id', input.companyId)
      .eq('employee_id', me.id);
    const recByDoc = new Map<UUID, HrAckReceiptRow[]>();
    for (const r of (rec ?? []) as HrAckReceiptRow[]) {
      const list = recByDoc.get(r.ack_document_id) ?? [];
      list.push(r);
      recByDoc.set(r.ack_document_id, list);
    }
    return docs.filter((d) => recByDoc.has(d.id)).map((d) => ({ ...d, receipts: recByDoc.get(d.id) ?? [] }));
  }

  const { data: receipts } = await insforge.database
    .from('hr_ack_receipts')
    .select('*')
    .eq('company_id', input.companyId);
  const recByDoc = new Map<UUID, HrAckReceiptRow[]>();
  for (const r of (receipts ?? []) as HrAckReceiptRow[]) {
    const list = recByDoc.get(r.ack_document_id) ?? [];
    list.push(r);
    recByDoc.set(r.ack_document_id, list);
  }
  return docs.map((d) => ({ ...d, receipts: recByDoc.get(d.id) ?? [] }));
  });
}

export async function submitHrAcknowledgement(input: {
  companyId: UUID;
  actorUserId: UUID;
  ackDocumentId: UUID;
  action: 'acknowledge' | 'sign';
  ipAddress?: string | null;
  deviceInfo?: string | null;
}): Promise<HrAckReceiptRow> {
  return withHrSession('ack-documents:submit', async () => {
  const me = await getHrEmployeeByUserId(input.companyId, input.actorUserId);
  if (!me) throw new Error('No linked employee profile.');

  const nextStatus = input.action === 'sign' ? 'SIGNED' : 'ACKNOWLEDGED';
  const patch: Record<string, unknown> = {
    status: nextStatus,
    acknowledgement_method: input.action === 'sign' ? 'Signature' : 'Click',
    ip_address: input.ipAddress ?? null,
    device_info: input.deviceInfo ?? null,
    updated_at: new Date().toISOString()
  };
  if (input.action === 'sign') patch.signed_at = new Date().toISOString();
  else patch.acknowledged_at = new Date().toISOString();

  const { data, error } = await insforge.database
    .from('hr_ack_receipts')
    .upsert({
      company_id: input.companyId,
      ack_document_id: input.ackDocumentId,
      employee_id: me.id,
      employee_user_id: me.user_id,
      ...patch
    }, { onConflict: 'company_id,ack_document_id,employee_id' })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to record acknowledgement.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: input.action === 'sign' ? 'hr.ack_document.sign' : 'hr.ack_document.acknowledge',
    entityType: 'hr_ack_receipt',
    entityId: (data as any).id as UUID
  });
  return data as HrAckReceiptRow;
  });
}

export async function deleteHrAcknowledgementDocument(input: {
  companyId: UUID;
  documentId: UUID;
  actorUserId: UUID;
}): Promise<void> {
  return withHrSession('ack-documents:delete', async () => {
  const { error: receiptsError } = await insforge.database
    .from('hr_ack_receipts')
    .delete()
    .eq('company_id', input.companyId)
    .eq('ack_document_id', input.documentId);
  if (receiptsError) throw new Error(getErrorMessage(receiptsError));

  const { error: docError } = await insforge.database
    .from('hr_ack_documents')
    .delete()
    .eq('company_id', input.companyId)
    .eq('id', input.documentId);
  if (docError) throw new Error(getErrorMessage(docError));

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'hr.ack_document.delete',
    entityType: 'hr_ack_document',
    entityId: input.documentId
  }).catch(() => {});
  });
}

export async function sendHrDocumentExpiryAlerts(companyId: UUID, actorUserId: UUID): Promise<number> {
  const docs = await listHrPersonalDocuments({
    companyId,
    actorRole: 'admin',
    actorUserId
  });
  const toNotify = docs.filter((d) => {
    if (!d.expiry_date) return false;
    const diff = dayDiff(d.expiry_date);
    return diff === 30 || diff === 7 || diff < 0;
  });
  if (toNotify.length === 0) return 0;

  const employees = await listHrEmployees(companyId);
  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const hrRecipients = await listHrManagersAndAdmins(companyId).catch(() => []);
  let count = 0;

  for (const doc of toNotify) {
    const status = getDocumentExpiryStatus(doc);
    const employee = employeeById.get(doc.employee_id);
    const title = status === 'expired' ? 'HR document expired' : 'HR document nearing expiry';
    const message = `${doc.doc_name ?? doc.title} for ${employee ? `${employee.first_name} ${employee.last_name}` : doc.employee_id} is ${status === 'expired' ? 'expired' : `expiring soon (${doc.expiry_date})`}.`;

    const recipients = new Set<UUID>();
    for (const userId of hrRecipients) recipients.add(userId);
    if (employee?.supervisor_user_id) recipients.add(employee.supervisor_user_id);
    if (employee?.user_id) recipients.add(employee.user_id);

    for (const recipient of recipients) {
      await createNotification(
        companyId,
        recipient,
        status === 'expired' ? 'warning' : 'info',
        title,
        message,
        { module: 'hr', route: '/dashboard/hr/documents', employeeId: doc.employee_id, documentId: doc.id, expiryStatus: status }
      ).catch(() => {});
      count += 1;
    }
  }

  await createActivityLog({
    companyId,
    actorUserId,
    action: 'hr.documents.expiry_alerts.sent',
    entityType: 'hr_employee_document',
    entityId: toNotify[0]?.id ?? actorUserId,
    metadata: { documents: toNotify.length, notifications: count }
  }).catch(() => {});

  return count;
}

export function recommendDisciplinaryAction(input: { repeatCount: number; caseType: string }): string {
  const ct = input.caseType.trim().toLowerCase();
  if (input.repeatCount >= 2) return 'Final written warning and formal hearing';
  if (input.repeatCount >= 1) return 'Written warning and corrective coaching';
  if (ct.includes('dismiss') || ct.includes('major')) return 'Formal hearing with possible suspension';
  if (ct.includes('final')) return 'Final written warning';
  if (ct.includes('written')) return 'Written warning';
  return 'Verbal warning and coaching';
}

export async function listHrManagersAndAdmins(companyId: UUID): Promise<UUID[]> {
  return withHrSession('managers-and-admins:list', async () => {
  const { data, error } = await insforge.database
    .from('company_memberships')
    .select('user_id, role')
    .eq('company_id', companyId)
    .in('role', ['owner', 'admin', 'manager', 'supervisor']);
  if (error) throw new Error(getErrorMessage(error));
  return [...new Set((data ?? []).map((row: any) => row.user_id as UUID))];
  });
}

export async function recalculateHrMonthlyHours(
  companyId: UUID,
  employeeId: UUID,
  year: number,
  month: number,
  actorUserId?: UUID | null
): Promise<HrMonthlyHours | null> {
  return withHrSession('monthly-hours:recalculate', async () => {
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const nextMonthStart = new Date(Date.UTC(year, month, 1));
  const monthStartIso = monthStart.toISOString().slice(0, 10);
  const nextMonthStartIso = nextMonthStart.toISOString().slice(0, 10);
  const { data, error } = await insforge.database
    .from('hr_timesheets')
    .select('hours_worked,overtime_hours')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)
    .gte('date', monthStartIso)
    .lt('date', nextMonthStartIso);
  if (error) throw new Error(getErrorMessage(error));
  const hours = (data ?? []).reduce((sum: number, row: any) => sum + Number(row.hours_worked ?? 0), 0);
  const overtime = (data ?? []).reduce((sum: number, row: any) => sum + Number(row.overtime_hours ?? 0), 0);
  const total = hours + overtime;
  const { data: upserted, error: upsertError } = await insforge.database
    .from('hr_monthly_hours')
    .upsert({
      company_id: companyId,
      employee_id: employeeId,
      year,
      month,
      total_hours: hours,
      overtime_hours: overtime,
      total_with_overtime: total,
      last_calculated_at: new Date().toISOString(),
      updated_by_user_id: actorUserId ?? null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'company_id,employee_id,year,month' })
    .select('*')
    .single();
  if (upsertError) throw new Error(getErrorMessage(upsertError));
  return (upserted as HrMonthlyHours) ?? null;
  });
}
