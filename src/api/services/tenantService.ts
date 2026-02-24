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
};

export async function createCompany(input: CreateCompanyInput): Promise<Company> {
  const session = await ensureInsforgeSession();
  const { data, error } = await insforge.database
    .from('companies')
    .insert({
      name: input.name,
      license_type: input.licenseType,
      employee_limit: input.employeeLimit,
      // Critical for RLS: auth.uid() must match this value.
      // Use the session user id (source of truth) to avoid any mismatch.
      primary_admin_user_id: session.userId,
      metadata: input.metadata ?? null
    })
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
  
  const memberCount = await countActiveMembers(input.companyId);
  if (memberCount >= company.employee_limit) {
    throw new Error(`Your licence limit is ${company.employee_limit} users. Please upgrade to add more employees.`);
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

export async function countActiveMembers(companyId: UUID): Promise<number> {
  const { count, error } = await insforge.database
    .from('company_memberships')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId);

  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
}

export async function getSeatLimitForCompany(companyId: UUID): Promise<number> {
  const company = await getCompanyById(companyId);
  return company?.employee_limit ?? 0;
}

export async function createInvite(input: {
  company: Company;
  actorUserId: UUID;
  email: string;
  role: CompanyRole;
}): Promise<CompanyInvite> {
  await ensureInsforgeSession();
  const memberCount = await countActiveMembers(input.company.id);
  if (memberCount >= input.company.employee_limit) {
    throw new Error(`Your licence limit is ${input.company.employee_limit} users. Please upgrade to add more employees.`);
  }

  const { data, error } = await insforge.database
    .from('company_invites')
    .insert({
      company_id: input.company.id,
      email: input.email.trim().toLowerCase(),
      role: input.role,
      created_by_user_id: input.actorUserId
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
      accepted_user_id: input.userId
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
  }
}
