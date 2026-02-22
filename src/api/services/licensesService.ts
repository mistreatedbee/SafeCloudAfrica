import { insforge } from '../insforge/client';
import type { UUID } from '../models/entities';
import { logPlatformAdminAction } from './platformAdminAuditService';

export type OrgLicenseRow = {
  id: UUID;
  company_id: UUID;
  plan_name: string;
  seat_limit: number;
  start_date: string;
  end_date: string;
  status: string;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

export type CreateLicenseInput = {
  company_id: UUID;
  plan_name: 'base' | 'growth' | 'professional' | 'hr_only';
  seat_limit: number;
  duration_months: number;
  start_date: string;
};

export async function listLicenses(opts?: { company_id?: UUID; status?: string }): Promise<OrgLicenseRow[]> {
  let q = insforge.database.from('org_licenses').select('*').order('created_at', { ascending: false }).limit(200);
  if (opts?.company_id) q = q.eq('company_id', opts.company_id);
  if (opts?.status) q = q.eq('status', opts.status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as OrgLicenseRow[];
}

export async function createLicense(
  input: CreateLicenseInput,
  createdByUserId: UUID
): Promise<OrgLicenseRow> {
  const start = new Date(input.start_date);
  const end = new Date(start);
  end.setMonth(end.getMonth() + input.duration_months);

  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);
  const status = end >= new Date() ? 'active' : 'expired';

  const { data: license, error: licenseError } = await insforge.database
    .from('org_licenses')
    .insert({
      company_id: input.company_id,
      plan_name: input.plan_name,
      seat_limit: input.seat_limit,
      start_date: startDate,
      end_date: endDate,
      status,
      created_by_user_id: createdByUserId
    })
    .select()
    .single();
  if (licenseError) throw licenseError;

  const licenseTypeMap = {
    base: 'base',
    growth: 'growth',
    professional: 'professional',
    hr_only: 'hr_only'
  } as const;

  await insforge.database
    .from('companies')
    .update({
      license_type: licenseTypeMap[input.plan_name],
      employee_limit: input.seat_limit,
      subscription_duration_months: input.duration_months
    })
    .eq('id', input.company_id);

  await logPlatformAdminAction(createdByUserId, {
    action: 'license_created',
    target_company_id: input.company_id,
    details: { plan_name: input.plan_name, seat_limit: input.seat_limit, end_date: endDate }
  });

  return license as OrgLicenseRow;
}

export function remainingDays(endDate: string): number {
  const end = new Date(endDate);
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}
