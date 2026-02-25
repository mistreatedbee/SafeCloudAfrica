import { insforge } from '../insforge/client';
import type { Company, CompanyInvite, CompanyMembership, UUID } from '../models/entities';
import type { CompanyRole, LicenseType } from '../models/core';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';
import { ensureInsforgeSession } from '../insforge/ensureSession';

function generateInviteToken(): string {
  // Browser-safe unique token for invite links.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

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
  if (company.employee_limit > 0 && memberCount >= company.employee_limit) {
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

export type InviteCreateErrorCode =
  | 'NOT_IN_ORGANISATION'
  | 'PERMISSION_DENIED'
  | 'ALREADY_INVITED'
  | 'USER_ALREADY_EXISTS'
  | 'LICENSE_LIMIT_REACHED'
  | 'INVITE_CREATE_FAILED'
  | 'UNKNOWN';

export type InviteCreateResult =
  | {
      ok: true;
      status: 'SENT';
      invite: CompanyInvite;
    }
  | {
      ok: false;
      status: 'FAILED';
      code: InviteCreateErrorCode;
      message: string;
    };

function normalizeInviteStatus(status: string | null | undefined): string {
  return String(status ?? '').trim().toUpperCase();
}

function mapInviteCreateError(message: string): { code: InviteCreateErrorCode; message: string } {
  const lowered = message.toLowerCase();
  if (lowered.includes('already invited') || lowered.includes('duplicate') || lowered.includes('unique')) {
    return { code: 'ALREADY_INVITED', message: 'This user is already invited.' };
  }
  if (lowered.includes('already exists') || lowered.includes('already in this organization') || lowered.includes('already in this organisation')) {
    return { code: 'USER_ALREADY_EXISTS', message: 'User already exists in this organization.' };
  }
  if (lowered.includes('licence limit') || lowered.includes('license limit') || lowered.includes('seat limit')) {
    return { code: 'LICENSE_LIMIT_REACHED', message: 'License limit reached. Upgrade to add more users.' };
  }
  if (lowered.includes('permission') || lowered.includes('not allowed') || lowered.includes('forbidden') || lowered.includes('rls')) {
    return { code: 'PERMISSION_DENIED', message: 'Only organization owners or admins can send invites.' };
  }
  return { code: 'UNKNOWN', message: 'Invite failed to send. Please try again or contact support.' };
}

export async function createInvite(input: {
  company: Company;
  actorUserId: UUID;
  email: string;
  role: CompanyRole;
}): Promise<InviteCreateResult> {
  try {
    await ensureInsforgeSession();
  } catch {
    return {
      ok: false,
      status: 'FAILED',
      code: 'UNKNOWN',
      message: 'Invite failed to send. Please try again or contact support.'
    };
  }
  const normalizedEmail = input.email.trim().toLowerCase();

  try {
    const { data: inviterMembership, error: inviterError } = await insforge.database
      .from('company_memberships')
      .select('role')
      .eq('company_id', input.company.id)
      .eq('user_id', input.actorUserId)
      .maybeSingle();

    if (inviterError) {
      return {
        ok: false,
        status: 'FAILED',
        code: 'PERMISSION_DENIED',
        message: 'Only organization owners or admins can send invites.'
      };
    }
    if (!inviterMembership) {
      return {
        ok: false,
        status: 'FAILED',
        code: 'NOT_IN_ORGANISATION',
        message: 'Inviter must belong to this organization.'
      };
    }

    const inviterRole = normalizeInviteStatus((inviterMembership as any).role);
    if (inviterRole !== 'OWNER' && inviterRole !== 'ADMIN') {
      return {
        ok: false,
        status: 'FAILED',
        code: 'PERMISSION_DENIED',
        message: 'Only organization owners or admins can send invites.'
      };
    }

    const { data: existingInvite, error: existingInviteError } = await insforge.database
      .from('company_invites')
      .select('id, status')
      .eq('company_id', input.company.id)
      .eq('email', normalizedEmail)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!existingInviteError && existingInvite) {
      const existingStatus = normalizeInviteStatus((existingInvite as any).status);
      if (existingStatus === 'PENDING' || existingStatus === 'SENT') {
        return {
          ok: false,
          status: 'FAILED',
          code: 'ALREADY_INVITED',
          message: 'This user is already invited.'
        };
      }
    }

    const { data: existingProfile, error: existingProfileError } = await insforge.database
      .from('user_profiles')
      .select('id')
      .eq('company_id', input.company.id)
      .eq('email', normalizedEmail)
      .limit(1)
      .maybeSingle();
    if (!existingProfileError && existingProfile) {
      return {
        ok: false,
        status: 'FAILED',
        code: 'USER_ALREADY_EXISTS',
        message: 'User already exists in this organization.'
      };
    }

    const memberCount = await countActiveMembers(input.company.id);
    const { count: pendingInviteCount, error: pendingCountError } = await insforge.database
      .from('company_invites')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', input.company.id)
      .in('status', ['PENDING', 'SENT', 'pending', 'sent']);
    if (pendingCountError) {
      return {
        ok: false,
        status: 'FAILED',
        code: 'INVITE_CREATE_FAILED',
        message: 'Invite failed to send. Please try again or contact support.'
      };
    }
    const projectedSeats = memberCount + (pendingInviteCount ?? 0);
    if (input.company.employee_limit > 0 && projectedSeats >= input.company.employee_limit) {
      return {
        ok: false,
        status: 'FAILED',
        code: 'LICENSE_LIMIT_REACHED',
        message: 'License limit reached. Upgrade to add more users.'
      };
    }
  } catch (err: any) {
    const mapped = mapInviteCreateError(getErrorMessage(err));
    return { ok: false, status: 'FAILED', code: mapped.code, message: mapped.message };
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const { data, error } = await insforge.database
    .from('company_invites')
    .insert({
      company_id: input.company.id,
      email: normalizedEmail,
      role: input.role,
      created_by_user_id: input.actorUserId,
      token: generateInviteToken(),
      expires_at: expiresAt.toISOString(),
      status: 'SENT',
      sent_at: now.toISOString(),
      error_message: null
    })
    .select('*')
    .single();

  if (error || !data) {
    const mapped = mapInviteCreateError(getErrorMessage(error));
    return { ok: false, status: 'FAILED', code: mapped.code, message: mapped.message };
  }

  // Always log consultant/admin activity (and all actions generally).
  try {
    await createActivityLog({
      companyId: input.company.id,
      actorUserId: input.actorUserId,
      action: 'company_invites.create',
      entityType: 'company_invite',
      entityId: (data as any).id as UUID,
      metadata: { email: normalizedEmail, role: input.role }
    });
  } catch {
    // Do not fail invite creation when activity logging fails.
  }

  return {
    ok: true,
    status: 'SENT',
    invite: data as CompanyInvite
  };
}

export async function acceptInvite(input: { inviteId: UUID; userId: UUID }): Promise<CompanyMembership> {
  await ensureInsforgeSession();
  // Mark invite accepted (idempotency is handled server-side; if already accepted, update may fail)
  const { data: invite, error: inviteError } = await insforge.database
    .from('company_invites')
    .update({
      accepted_at: new Date().toISOString(),
      accepted_user_id: input.userId,
      status: 'ACCEPTED'
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

export async function getInviteIdByToken(token: string): Promise<UUID | null> {
  const cleanToken = token.trim();
  if (!cleanToken) return null;

  const { data, error } = await insforge.database.rpc('get_invite_id_by_token', { p_token: cleanToken });
  if (error) throw new Error(getErrorMessage(error));
  if (!data) return null;
  return data as UUID;
}

export async function updateMembershipRole(input: {
  companyId: UUID;
  membershipId: UUID;
  role: CompanyRole;
}): Promise<void> {
  const { error } = await insforge.database
    .from('company_memberships')
    .update({ role })
    .eq('company_id', input.companyId)
    .eq('id', input.membershipId);
  if (error) throw new Error(getErrorMessage(error));
}

export async function updateMembershipStatus(input: {
  companyId: UUID;
  membershipId: UUID;
  status: 'INVITED' | 'ACTIVE' | 'DISABLED';
}): Promise<void> {
  const { error } = await insforge.database
    .from('company_memberships')
    .update({ status })
    .eq('company_id', input.companyId)
    .eq('id', input.membershipId);
  if (error) throw new Error(getErrorMessage(error));
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
