
import { insforge } from '../insforge/client';
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
  employment_type: string;
  employment_type_other: string | null;
  employment_status: 'ONBOARDING' | 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'TERMINATED' | 'ARCHIVED';
  start_date: string;
  end_date: string | null;
  probation_end_date: string | null;
  next_review_date: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  created_by_user_id: UUID;
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

export type HrSimpleRecord = Record<string, unknown> & { id: UUID; company_id: UUID; created_at: string; updated_at?: string };

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
};

async function getCount(table: string, companyId: UUID, eq?: Record<string, string | number | boolean>): Promise<number> {
  let q = insforge.database.from(table).select('*', { count: 'exact', head: true }).eq('company_id', companyId);
  if (eq) {
    for (const [key, value] of Object.entries(eq)) q = q.eq(key, value);
  }
  const { count, error } = await q;
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
}

async function listTable<T>(table: string, companyId: UUID, filters?: Record<string, string | number | boolean | null>, order = 'created_at'): Promise<T[]> {
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
}

async function insertTable<T>(table: string, payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await insforge.database.from(table).insert(payload).select('*').single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error(`Failed to create ${table} row`);
  return data as T;
}

async function upsertTable<T>(table: string, payload: Record<string, unknown>, onConflict: string): Promise<T> {
  const { data, error } = await insforge.database.from(table).upsert(payload, { onConflict }).select('*').single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error(`Failed to upsert ${table} row`);
  return data as T;
}

export async function listHrEmployees(companyId: UUID): Promise<HrEmployee[]> {
  return listTable<HrEmployee>('hr_employees', companyId);
}

export async function getHrEmployeeById(companyId: UUID, id: UUID): Promise<HrEmployee | null> {
  const { data, error } = await insforge.database.from('hr_employees').select('*').eq('company_id', companyId).eq('id', id).maybeSingle();
  if (error) throw new Error(getErrorMessage(error));
  return (data as HrEmployee) ?? null;
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

export async function archiveHrEmployee(companyId: UUID, employeeId: UUID, actorUserId: UUID): Promise<void> {
  const { error } = await insforge.database
    .from('hr_employees')
    .update({ employment_status: 'ARCHIVED', updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', employeeId);
  if (error) throw new Error(getErrorMessage(error));
  await createActivityLog({ companyId, actorUserId, action: 'hr.employee.archive', entityType: 'hr_employee', entityId: employeeId });
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
}

export async function listHrTimesheets(companyId: UUID, employeeId?: UUID): Promise<HrTimesheet[]> {
  return listTable<HrTimesheet>('hr_timesheets', companyId, employeeId ? { employee_id: employeeId } : undefined, 'date');
}

export async function upsertHrTimesheet(input: Omit<HrTimesheet, 'id' | 'created_at' | 'updated_at' | 'approved_by_user_id' | 'approved_at' | 'decline_reason'>): Promise<HrTimesheet> {
  return upsertTable<HrTimesheet>('hr_timesheets', { ...input, updated_at: new Date().toISOString() }, 'company_id,employee_id,date');
}

export async function approveHrTimesheet(input: {
  companyId: UUID;
  timesheetId: UUID;
  actorUserId: UUID;
  decision: 'APPROVED' | 'DECLINED';
  declineReason?: string | null;
}): Promise<HrTimesheet> {
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
  return data as HrTimesheet;
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
  | 'hr_interview_notes',
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
    | 'hr_interview_notes',
  payload: Record<string, unknown>
): Promise<HrSimpleRecord> {
  return insertTable<HrSimpleRecord>(table, payload);
}

export async function upsertHrSettings(input: {
  company_id: UUID;
  owner_can_view_restricted?: boolean;
  leave_requires_hr_final_approval?: boolean;
  leave_escalation_days?: number;
  repeat_offence_window_months?: number;
}): Promise<Record<string, unknown>> {
  return upsertTable<Record<string, unknown>>('hr_settings', { ...input, updated_at: new Date().toISOString() }, 'company_id');
}

export async function getHrSettings(companyId: UUID): Promise<Record<string, unknown> | null> {
  const { data, error } = await insforge.database.from('hr_settings').select('*').eq('company_id', companyId).maybeSingle();
  if (error) throw new Error(getErrorMessage(error));
  return (data as Record<string, unknown>) ?? null;
}

export async function canViewRestrictedFields(companyId: UUID): Promise<boolean> {
  const { data, error } = await insforge.database.rpc('hr_can_view_restricted_fields', { p_company_id: companyId });
  if (error) throw new Error(getErrorMessage(error));
  return Boolean(data);
}

export async function logRestrictedFieldAccess(input: {
  companyId: UUID;
  actorUserId: UUID;
  targetEntity: string;
  targetId: UUID;
  fieldName: string;
  action: 'view' | 'export';
}): Promise<void> {
  const { error } = await insforge.database.from('hr_restricted_field_access_logs').insert({
    company_id: input.companyId,
    actor_user_id: input.actorUserId,
    target_entity: input.targetEntity,
    target_id: input.targetId,
    field_name: input.fieldName,
    action: input.action
  });
  if (error) throw new Error(getErrorMessage(error));
}

export async function getHrDashboardStats(companyId: UUID, selectedFromDate?: string): Promise<HrDashboardStats> {
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
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'APPROVED')
    .gte('start_date', now.toISOString().slice(0, 10));

  const { count: overdueLeaveApprovals } = await insforge.database
    .from('hr_leave_requests')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'SUBMITTED')
    .lte('created_at', new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString());

  const queryContractsCount = async (dateStr: string) => {
    const { count } = await insforge.database
      .from('hr_employment_contracts')
      .select('*', { count: 'exact', head: true })
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
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .lte('expiry_date', date30.toISOString().slice(0, 10));

  const { count: trainingCompleted } = await insforge.database.from('training_records').select('*', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'COMPLETED');
  const { count: trainingTotal } = await insforge.database.from('training_records').select('*', { count: 'exact', head: true }).eq('company_id', companyId);

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
    hrDocsExpiringSoon: hrDocsExpiringSoon ?? 0
  };
}

export async function getEmployeeIntegratedProfile(companyId: UUID, employeeId: UUID): Promise<Record<string, unknown>> {
  const employee = await getHrEmployeeById(companyId, employeeId);
  if (!employee) return { employee: null };

  const [documents, contracts, leaveRequests, balances, timesheets, performance, disciplinary, auditTrail, trainingRecords, incidents, healthExpiring] = await Promise.all([
    listHrRecords(companyId, 'hr_employee_documents', { employee_id: employeeId }),
    listHrRecords(companyId, 'hr_employment_contracts', { employee_id: employeeId }),
    listHrLeaveRequests(companyId, employeeId),
    listHrRecords(companyId, 'hr_leave_balances', { employee_id: employeeId }),
    listHrTimesheets(companyId, employeeId),
    listHrRecords(companyId, 'hr_performance_reviews', { employee_id: employeeId }),
    listHrRecords(companyId, 'hr_disciplinary_cases', { employee_id: employeeId }),
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
    })()
  ]);

  return {
    employee,
    documents,
    contracts,
    leaveRequests,
    balances,
    timesheets,
    performance,
    disciplinary,
    trainingRecords,
    incidents,
    healthExpiring,
    auditTrail
  };
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
