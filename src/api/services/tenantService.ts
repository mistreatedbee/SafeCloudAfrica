import { insforge } from '../insforge/client';
import type { Company, CompanyInvite, CompanyMembership, UUID } from '../models/entities';
import type { CompanyRole, LicenseType } from '../models/core';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';
import { ensureInsforgeSession } from '../insforge/ensureSession';

export type CreateCompanyInput = {
  name: string;
  licenseType: LicenseType;
  employeeLimit: number;
  primaryAdminUserId: UUID;
  metadata?: Record<string, unknown> | null;
  /** Operating Model: 3, 6, 9, or 12 months */
  subscriptionDurationMonths?: number | null;
};

export async function createCompany(input: CreateCompanyInput): Promise<Company> {
  const session = await ensureInsforgeSession();
  const row: Record<string, unknown> = {
    name: input.name,
    license_type: input.licenseType,
    employee_limit: input.employeeLimit,
    primary_admin_user_id: session.userId,
    metadata: input.metadata ?? null
  };
  if (input.subscriptionDurationMonths != null && [3, 6, 9, 12].includes(input.subscriptionDurationMonths)) {
    row.subscription_duration_months = input.subscriptionDurationMonths;
  }
  const { data, error } = await insforge.database
    .from('companies')
    .insert(row)
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create company.');
  return data as Company;
}

export async function createMembership(input: { companyId: UUID; userId: UUID; role: CompanyRole }): Promise<CompanyMembership> {
  await ensureInsforgeSession();
  
  // Check license limit before creating membership
  const company = await getCompanyById(input.companyId);
  if (!company) throw new Error('Company not found.');
  
  const seatLimit = await getSeatLimitForCompany(input.companyId);
  const memberCount = await countActiveMembers(input.companyId);
  if (memberCount >= seatLimit) {
    throw new Error(`Seat limit reached (${seatLimit} users). Upgrade license to add more users.`);
  }
  
  const { data, error } = await insforge.database
    .from('company_memberships')
    .insert({
      company_id: input.companyId,
      user_id: input.userId,
      role: input.role
    })
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create membership.');
  return data as CompanyMembership;
}

export async function listMembershipsForUser(userId: UUID): Promise<Array<CompanyMembership & { company?: Company }>> {
  const { data, error } = await insforge.database
    .from('company_memberships')
    .select('*, companies(*)')
    .eq('user_id', userId);

  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []).map((row: any) => ({
    ...(row as CompanyMembership),
    company: row.companies as Company | undefined
  }));
}

export async function getCompanyById(companyId: UUID): Promise<Company | null> {
  const { data, error } = await insforge.database.from('companies').select('*').eq('id', companyId).maybeSingle();
  if (error) throw new Error(getErrorMessage(error));
  return (data as Company) ?? null;
}

export async function updateCompanyProfile(input: {
  companyId: UUID;
  name?: string;
  metadata?: Record<string, unknown> | null;
}): Promise<Company> {
  await ensureInsforgeSession();
  const patch: any = {};
  if (typeof input.name === 'string') patch.name = input.name;
  if (typeof input.metadata !== 'undefined') patch.metadata = input.metadata;

  const { data, error } = await insforge.database
    .from('companies')
    .update(patch)
    .eq('id', input.companyId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update company.');
  return data as Company;
}

export async function listCompanyMemberships(companyId: UUID): Promise<CompanyMembership[]> {
  const { data, error } = await insforge.database.from('company_memberships').select('*').eq('company_id', companyId);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as CompanyMembership[];
}

export async function listCompanyInvites(companyId: UUID): Promise<CompanyInvite[]> {
  const { data, error } = await insforge.database
    .from('company_invites')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as CompanyInvite[];
}

/** Resolve invite id from token (for /invite/accept?token=...). Returns null if invalid or expired. */
export async function getInviteIdByToken(token: string): Promise<UUID | null> {
  const trimmed = token?.trim();
  if (!trimmed) return null;
  const { data, error } = await insforge.database.rpc('get_invite_id_by_token', { p_token: trimmed });
  if (error || data == null) return null;
  return data as UUID;
}

export async function getInviteById(inviteId: UUID): Promise<CompanyInvite> {
  const { data, error } = await insforge.database
    .from('company_invites')
    .select('*, companies(*)')
    .eq('id', inviteId)
    .maybeSingle();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Invite not found.');
  return {
    ...data,
    company: data.companies
  } as CompanyInvite & { company?: Company };
}

/** Count members with status ACTIVE (seat check and display). */
export async function countActiveMembers(companyId: UUID): Promise<number> {
  const { count, error } = await insforge.database
    .from('company_memberships')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'ACTIVE');

  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
}

/** Effective seat limit for company (org_licenses.active or company.employee_limit). */
export async function getSeatLimitForCompany(companyId: UUID): Promise<number> {
  try {
    const { data, error } = await insforge.database.rpc('get_company_seat_limit', { p_company_id: companyId });
    if (error || data == null) return 0;
    return typeof data === 'number' ? data : 0;
  } catch {
    const company = await getCompanyById(companyId);
    return company?.employee_limit ?? 0;
  }
}

export async function createInvite(input: {
  company: Company;
  actorUserId: UUID;
  email: string;
  role: CompanyRole;
}): Promise<CompanyInvite> {
  await ensureInsforgeSession();
  const seatLimit = await getSeatLimitForCompany(input.company.id);
  const memberCount = await countActiveMembers(input.company.id);
  if (memberCount >= seatLimit) {
    throw new Error(`Seat limit reached. Upgrade license to add more users.`);
  }

  const token = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const { data, error } = await insforge.database
    .from('company_invites')
    .insert({
      company_id: input.company.id,
      email: input.email.trim().toLowerCase(),
      role: input.role,
      created_by_user_id: input.actorUserId,
      token,
      expires_at: expiresAt.toISOString(),
      status: 'pending'
    })
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create invite.');

  // Always log consultant/admin activity (and all actions generally).
  await createActivityLog({
    companyId: input.company.id,
    actorUserId: input.actorUserId,
    action: 'company_invites.create',
    entityType: 'company_invite',
    entityId: (data as any).id as UUID,
    metadata: { email: input.email, role: input.role }
  });

  return data as CompanyInvite;
}

export async function acceptInvite(input: { inviteId: UUID; userId: UUID }): Promise<CompanyMembership> {
  await ensureInsforgeSession();
  // Mark invite accepted (idempotency is handled server-side; if already accepted, update may fail)
  const { data: invite, error: inviteError } = await insforge.database
    .from('company_invites')
    .update({
      accepted_at: new Date().toISOString(),
      accepted_user_id: input.userId,
      status: 'accepted'
    })
    .eq('id', input.inviteId)
    .select('*')
    .single();

  if (inviteError) throw new Error(getErrorMessage(inviteError));
  if (!invite) throw new Error('Invite not found.');

  const companyId = (invite as any).company_id as UUID;
  const role = (invite as any).role as CompanyRole;

  const membership = await createMembership({ companyId, userId: input.userId, role });

  await createActivityLog({
    companyId,
    actorUserId: input.userId,
    action: 'company_invites.accept',
    entityType: 'company_invite',
    entityId: input.inviteId
  });

  return membership;
}

export function getDefaultEmployeeLimit(licenseType: LicenseType): number {
  switch (licenseType) {
    case 'starter_6m':
      return 4;
    case 'professional_12m':
      return 20;
    case 'enterprise_custom':
      return 9999;
    case 'base':
      return 5;
    case 'growth':
      return 20;
    case 'professional':
      return 50;
    case 'hr_only':
      return 5;
    default:
      return 5;
  }
}

