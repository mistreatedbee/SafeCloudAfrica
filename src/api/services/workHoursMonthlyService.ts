import { insforge } from '../insforge/client';
import type { WorkHoursMonthly, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';

export type ListWorkHoursMonthlyInput = {
  companyId: UUID;
  siteId?: UUID | null;
  departmentId?: UUID | null;
  projectId?: UUID | null;
  year?: number;
  limit?: number;
};

export async function listWorkHoursMonthly(input: ListWorkHoursMonthlyInput): Promise<WorkHoursMonthly[]> {
  let q = insforge.database
    .from('work_hours_monthly')
    .select('*')
    .eq('company_id', input.companyId);
  if (input.siteId != null) q = q.eq('site_id', input.siteId);
  if (input.departmentId != null) q = q.eq('department_id', input.departmentId);
  if (input.projectId != null) q = q.eq('project_id', input.projectId);
  if (input.year != null) q = q.eq('year', input.year);
  const { data, error } = await q.order('year', { ascending: false }).order('month', { ascending: false }).limit(input.limit ?? 120);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as WorkHoursMonthly[];
}

export async function getWorkHoursMonthlyById(companyId: UUID, id: UUID): Promise<WorkHoursMonthly | null> {
  const { data, error } = await insforge.database
    .from('work_hours_monthly')
    .select('*')
    .eq('company_id', companyId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(getErrorMessage(error));
  return data as WorkHoursMonthly | null;
}

export async function getWorkHoursMonthlyForMonth(input: {
  companyId: UUID;
  year: number;
  month: number;
  siteId?: UUID | null;
  departmentId?: UUID | null;
  projectId?: UUID | null;
}): Promise<WorkHoursMonthly | null> {
  let q = insforge.database
    .from('work_hours_monthly')
    .select('*')
    .eq('company_id', input.companyId)
    .eq('year', input.year)
    .eq('month', input.month);
  if (input.siteId != null) q = q.eq('site_id', input.siteId);
  else q = q.is('site_id', null);
  if (input.departmentId != null) q = q.eq('department_id', input.departmentId);
  else q = q.is('department_id', null);
  if (input.projectId != null) q = q.eq('project_id', input.projectId);
  else q = q.is('project_id', null);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(getErrorMessage(error));
  return data as WorkHoursMonthly | null;
}

export type UpsertWorkHoursMonthlyInput = {
  companyId: UUID;
  siteId?: UUID | null;
  departmentId?: UUID | null;
  projectId?: UUID | null;
  year: number;
  month: number;
  totalEmployees: number;
  salariedEmployees: number;
  wageEmployees: number;
  standardHoursPerDay?: number;
  daysWorked?: number;
  overtimeHoursWeekOrSat?: number;
  overtimeHoursSunday?: number;
  overtimeFactorWeekOrSat?: number;
  overtimeFactorSunday?: number;
  employeeAbsentDays?: number;
  employeeAbsentHours?: number | null;
  employeeTransportHours?: number | null;
  contractorsIncluded?: boolean;
  contractorIds?: UUID[] | null;
  createdByUserId: UUID;
  id?: UUID | null;
};

function computeHours(input: UpsertWorkHoursMonthlyInput): {
  salariedHoursCalculated: number;
  wageHoursCalculated: number;
  absentHours: number;
  overtimeValue: number;
  totalHoursWorkedFinal: number;
} {
  const std = input.standardHoursPerDay ?? 8;
  const days = input.daysWorked ?? 21;
  const salaried = (input.salariedEmployees ?? 0) * std * days;
  const wage = (input.wageEmployees ?? 0) * std * days;
  const absentDays = input.employeeAbsentDays ?? 0;
  const absentHours = (input.employeeAbsentHours != null ? input.employeeAbsentHours : absentDays * std);
  const otWeekSat = input.overtimeHoursWeekOrSat ?? 0;
  const otSun = input.overtimeHoursSunday ?? 0;
  const facWeek = input.overtimeFactorWeekOrSat ?? 1.5;
  const facSun = input.overtimeFactorSunday ?? 2;
  const overtimeValue = otWeekSat * facWeek + otSun * facSun;
  const transport = input.employeeTransportHours ?? 0;
  const total = salaried + wage + overtimeValue - absentHours + transport;
  return {
    salariedHoursCalculated: salaried,
    wageHoursCalculated: wage,
    absentHours,
    overtimeValue,
    totalHoursWorkedFinal: Math.max(0, total)
  };
}

export async function upsertWorkHoursMonthly(input: UpsertWorkHoursMonthlyInput): Promise<WorkHoursMonthly> {
  const computed = computeHours(input);
  const std = input.standardHoursPerDay ?? 8;
  const days = input.daysWorked ?? 21;
  const payload = {
    company_id: input.companyId,
    site_id: input.siteId ?? null,
    department_id: input.departmentId ?? null,
    project_id: input.projectId ?? null,
    year: input.year,
    month: input.month,
    total_employees: input.totalEmployees,
    salaried_employees: input.salariedEmployees,
    wage_employees: input.wageEmployees,
    standard_hours_per_day: std,
    days_worked: days,
    salaried_hours_calculated: computed.salariedHoursCalculated,
    wage_hours_calculated: computed.wageHoursCalculated,
    overtime_hours_week_or_sat: input.overtimeHoursWeekOrSat ?? 0,
    overtime_hours_sunday: input.overtimeHoursSunday ?? 0,
    overtime_factor_week_or_sat: input.overtimeFactorWeekOrSat ?? 1.5,
    overtime_factor_sunday: input.overtimeFactorSunday ?? 2,
    employee_absent_days: input.employeeAbsentDays ?? 0,
    employee_absent_hours: input.employeeAbsentHours ?? (input.employeeAbsentDays ?? 0) * std,
    employee_transport_hours: input.employeeTransportHours ?? null,
    contractors_included: input.contractorsIncluded ?? false,
    contractor_ids: input.contractorIds ?? null,
    total_hours_worked_final: computed.totalHoursWorkedFinal,
    created_by_user_id: input.createdByUserId,
    updated_at: new Date().toISOString()
  };

  const existing = await getWorkHoursMonthlyForMonth({
    companyId: input.companyId,
    year: input.year,
    month: input.month,
    siteId: input.siteId,
    departmentId: input.departmentId,
    projectId: input.projectId
  });

  if (existing) {
    const { data, error } = await insforge.database
      .from('work_hours_monthly')
      .update(payload)
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to update work hours monthly');
    return data as WorkHoursMonthly;
  }

  const { data, error } = await insforge.database
    .from('work_hours_monthly')
    .insert({ ...payload, created_at: new Date().toISOString() })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create work hours monthly');
  return data as WorkHoursMonthly;
}

export async function deleteWorkHoursMonthly(companyId: UUID, id: UUID): Promise<void> {
  const { error } = await insforge.database
    .from('work_hours_monthly')
    .delete()
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) throw new Error(getErrorMessage(error));
}

export function sumTotalHoursForPeriod(rows: WorkHoursMonthly[], periodStart: { year: number; month: number }, periodEnd: { year: number; month: number }): number {
  let sum = 0;
  for (const r of rows) {
    const y = r.year;
    const m = r.month;
    if (y < periodStart.year || (y === periodStart.year && m < periodStart.month)) continue;
    if (y > periodEnd.year || (y === periodEnd.year && m > periodEnd.month)) continue;
    sum += r.total_hours_worked_final;
  }
  return sum;
}
