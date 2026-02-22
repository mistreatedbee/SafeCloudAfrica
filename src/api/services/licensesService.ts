import { insforge } from '../insforge/client';
import type { UUID } from '../models/entities';
import type { LicenseKey } from '../models/entities';
import { logPlatformAdminAction } from './platformAdminAuditService';

/** Generate a random license key (e.g. XXXX-XXXX-XXXX-XXXX). */
function generateLicenseKey(): string {
  const segment = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  return [segment(), segment(), segment(), segment()].join('-');
}

const DEFAULT_MODULES_BY_PLAN: Record<string, string[]> = {
  base: ['General', 'HR'],
  growth: ['General', 'HR', 'Safety'],
  professional: ['General', 'HR', 'Safety', 'Legal', 'Quality'],
  hr_only: ['HR']
};

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
  billing_cycle_months?: number | null;
  modules_enabled?: string[] | Record<string, boolean> | null;
  license_key_id?: UUID | null;
  activated_at?: string | null;
  activated_by_user_id?: UUID | null;
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

// ---------- License keys (key-based activation) ----------

export type CreateLicenseKeyInput = {
  plan_name: 'base' | 'growth' | 'professional' | 'hr_only';
  billing_cycle_months: number;
  seat_limit: number;
  issued_to?: string | null;
};

export async function listLicenseKeys(opts?: { status?: string }): Promise<LicenseKey[]> {
  let q = insforge.database.from('license_keys').select('*').order('created_at', { ascending: false }).limit(200);
  if (opts?.status) q = q.eq('status', opts.status);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as (LicenseKey & { modules_enabled?: unknown })[];
  return rows.map((r) => ({
    ...r,
    modules_enabled: Array.isArray(r.modules_enabled) ? r.modules_enabled : (r.modules_enabled && typeof r.modules_enabled === 'object' ? Object.keys(r.modules_enabled as Record<string, unknown>) : [])
  }));
}

export async function createLicenseKey(input: CreateLicenseKeyInput, createdByUserId: UUID): Promise<{ key: string; id: UUID }> {
  let key = generateLicenseKey();
  const maxAttempts = 20;
  for (let i = 0; i < maxAttempts; i++) {
    const { data: existing } = await insforge.database.from('license_keys').select('id').eq('key', key).maybeSingle();
    if (!existing) break;
    key = generateLicenseKey();
  }
  const modules_enabled = DEFAULT_MODULES_BY_PLAN[input.plan_name] ?? ['General', 'HR'];
  const { data: row, error } = await insforge.database
    .from('license_keys')
    .insert({
      key,
      plan_name: input.plan_name,
      billing_cycle_months: input.billing_cycle_months,
      seat_limit: input.seat_limit,
      modules_enabled,
      status: 'unused',
      issued_to: input.issued_to?.trim() || null,
      created_by_super_admin_id: createdByUserId
    })
    .select('id, key')
    .single();
  if (error) throw error;
  if (!row) throw new Error('Failed to create license key');
  await logPlatformAdminAction(createdByUserId, {
    action: 'license_created',
    target_company_id: null,
    details: { license_key_id: (row as { id: UUID }).id, plan_name: input.plan_name, seat_limit: input.seat_limit, billing_cycle_months: input.billing_cycle_months }
  });
  return { key: (row as { key: string }).key, id: (row as { id: UUID }).id };
}

export async function revokeLicenseKey(keyId: UUID, actorUserId: UUID): Promise<void> {
  const { data: row, error: fetchErr } = await insforge.database.from('license_keys').select('id, status').eq('id', keyId).maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!row) throw new Error('License key not found');
  if ((row as { status: string }).status !== 'unused') throw new Error('Only unused keys can be revoked');
  const { error: updateErr } = await insforge.database.from('license_keys').update({ status: 'revoked' }).eq('id', keyId);
  if (updateErr) throw updateErr;
  await logPlatformAdminAction(actorUserId, {
    action: 'license_revoked',
    target_company_id: null,
    details: { license_key_id: keyId }
  });
}

export async function suspendOrgSubscription(companyId: UUID, actorUserId: UUID): Promise<void> {
  const { error: licenseErr } = await insforge.database.from('org_licenses').update({ status: 'suspended' }).eq('company_id', companyId);
  if (licenseErr) throw licenseErr;
  const { error: companyErr } = await insforge.database.from('companies').update({ status: 'suspended' }).eq('id', companyId);
  if (companyErr) throw companyErr;
  await logPlatformAdminAction(actorUserId, {
    action: 'org_suspended',
    target_company_id: companyId,
    details: {}
  });
}
