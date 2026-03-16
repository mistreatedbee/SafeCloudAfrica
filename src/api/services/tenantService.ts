import { insforge } from '../insforge/client';
import type { Company, CompanyInvite, CompanyMembership, UUID } from '../models/entities';
import type { CompanyRole, LicenseType, ModuleKey } from '../models/core';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';
import { ensureInsforgeSession } from '../insforge/ensureSession';

function normalizeInviteStatus(status: string | null | undefined): string {
  return String(status ?? '').trim().toUpperCase();
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { accessToken } = await ensureInsforgeSession();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`
  };
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
      primary_admin_user_id: session.userId,
      metadata: input.metadata ?? null
    })
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create company.');
  return data as Company;
}

export async function createMembership(input: {
  companyId: UUID;
  userId: UUID;
  role: CompanyRole;
  departmentId?: UUID | null;
  siteId?: UUID | null;
  invitedByUserId?: UUID | null;
  consultantScope?: Record<string, unknown> | null;
}): Promise<CompanyMembership> {
  await ensureInsforgeSession();

  const company = await getCompanyById(input.companyId);
  if (!company) throw new Error('Company not found.');

  const memberCount = await countActiveMembers(input.companyId);
  if (company.employee_limit > 0 && memberCount >= company.employee_limit) {
    throw new Error('SEATS_FULL: This organization has reached its seat limit. Contact your admin.');
  }

  const payload: Record<string, unknown> = {
    company_id: input.companyId,
    user_id: input.userId,
    role: input.role,
    status: 'ACTIVE'
  };

  if (input.departmentId) payload.department_id = input.departmentId;
  if (input.siteId) payload.site_id = input.siteId;
  if (input.invitedByUserId) payload.invited_by_user_id = input.invitedByUserId;
  if (input.consultantScope) payload.consultant_scope = input.consultantScope;

  let result = await insforge.database.from('company_memberships').insert(payload).select('*').single();

  if (result.error && getErrorMessage(result.error).toLowerCase().includes('column') && getErrorMessage(result.error).toLowerCase().includes('does not exist')) {
    const fallbackPayload = {
      company_id: input.companyId,
      user_id: input.userId,
      role: input.role
    };
    result = await insforge.database.from('company_memberships').insert(fallbackPayload).select('*').single();
  }

  if (result.error) throw new Error(getErrorMessage(result.error));
  if (!result.data) throw new Error('Failed to create membership.');
  return result.data as CompanyMembership;
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
  code?: string | null;
}): Promise<Company> {
  await ensureInsforgeSession();
  const patch: Record<string, unknown> = {};
  if (typeof input.name === 'string') patch.name = input.name;
  if (typeof input.metadata !== 'undefined') patch.metadata = input.metadata;
  if (typeof input.code !== 'undefined') patch.code = input.code ?? null;

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
  const { data, error } = await insforge.database
    .from('company_memberships')
    .select('status')
    .eq('company_id', companyId);

  if (error) throw new Error(getErrorMessage(error));
  const rows = (data ?? []) as Array<{ status?: string | null }>;
  return rows.filter((row) => {
    const status = String(row.status ?? 'ACTIVE').toUpperCase();
    return status === 'ACTIVE' || status === '';
  }).length;
}

export async function countPendingInvites(companyId: UUID): Promise<number> {
  const { count, error } = await insforge.database
    .from('company_invites')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .in('status', ['PENDING', 'SENT']);
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
}

export async function getSeatLimitForCompany(companyId: UUID): Promise<number> {
  const company = await getCompanyById(companyId);
  return company?.license_user_limit ?? company?.employee_limit ?? 0;
}

export type InviteCreateErrorCode =
  | 'NOT_IN_ORGANISATION'
  | 'PERMISSION_DENIED'
  | 'ALREADY_INVITED'
  | 'ALREADY_MEMBER'
  | 'SEATS_FULL'
  | 'INVITE_CREATE_FAILED'
  | 'UNKNOWN';

export type InviteCreateResult =
  | {
      ok: true;
      status: 'SENT' | 'FAILED';
      invite: CompanyInvite;
      inviteLink?: string;
      message?: string;
    }
  | {
      ok: false;
      status: 'FAILED';
      code: InviteCreateErrorCode;
      message: string;
    };

export type InviteValidationCode = 'INVITE_INVALID' | 'INVITE_EXPIRED' | 'INVITE_ACCEPTED' | 'INVITE_REVOKED' | 'OK';

export type InviteValidationResult = {
  code: InviteValidationCode;
  invite: (CompanyInvite & { company_name?: string | null }) | null;
};

function mapInviteCreateError(message: string): { code: InviteCreateErrorCode; message: string } {
  const lowered = message.toLowerCase();
  if (lowered.includes('already invited') || lowered.includes('duplicate') || lowered.includes('unique')) {
    return { code: 'ALREADY_INVITED', message: 'This user is already invited.' };
  }
  if (lowered.includes('already member') || lowered.includes('already exists') || lowered.includes('already in this organization')) {
    return { code: 'ALREADY_MEMBER', message: 'This user is already a member of this organization.' };
  }
  if (lowered.includes('seat') || lowered.includes('licence limit') || lowered.includes('license limit')) {
    return { code: 'SEATS_FULL', message: 'Seat limit reached. Upgrade to invite more users.' };
  }
  if (lowered.includes('permission') || lowered.includes('not allowed') || lowered.includes('forbidden') || lowered.includes('rls')) {
    return { code: 'PERMISSION_DENIED', message: 'Only organization owners or admins can send invites.' };
  }
  return { code: 'UNKNOWN', message: 'Invite failed to send. Please try again or contact support.' };
}

function mapInviteErrorCode(message: string): 'INVITE_EXPIRED' | 'INVITE_INVALID' | 'INVITE_ACCEPTED' | 'INVITE_REVOKED' | 'SEATS_FULL' | 'ALREADY_MEMBER' | 'ALREADY_INVITED' | 'UNKNOWN' {
  const lowered = message.toLowerCase();
  if (lowered.includes('invite_expired')) return 'INVITE_EXPIRED';
  if (lowered.includes('invite_invalid')) return 'INVITE_INVALID';
  if (lowered.includes('invite_accepted')) return 'INVITE_ACCEPTED';
  if (lowered.includes('invite_revoked')) return 'INVITE_REVOKED';
  if (lowered.includes('seats_full') || lowered.includes('seat limit')) return 'SEATS_FULL';
  if (lowered.includes('already_member')) return 'ALREADY_MEMBER';
  if (lowered.includes('already_invited')) return 'ALREADY_INVITED';
  return 'UNKNOWN';
}

export async function createInvite(input: {
  company: Company;
  actorUserId: UUID;
  email: string;
  role: CompanyRole;
  departmentId?: UUID | null;
  siteId?: UUID | null;
  modulesScope?: ModuleKey[];
}): Promise<InviteCreateResult> {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch('/api/invites/create', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        companyId: input.company.id,
        email: input.email,
        role: input.role,
        departmentId: input.departmentId ?? null,
        siteId: input.siteId ?? null,
        modulesScope: input.modulesScope ?? []
      })
    });
    const data = await response.json().catch(() => null as any);
    if (!response.ok || !data?.ok) {
      const mapped = mapInviteCreateError(String(data?.error || response.statusText || 'Invite failed.'));
      return { ok: false, status: 'FAILED', code: mapped.code, message: mapped.message };
    }
    const invite = data.invite as CompanyInvite;
    const emailSent = !!data.emailSent;
    return {
      ok: true,
      status: emailSent ? 'SENT' : 'FAILED',
      invite,
      inviteLink: data.inviteLink ? String(data.inviteLink) : undefined,
      message: emailSent ? 'Invite email sent successfully.' : 'Invite created, but email failed. Copy link and send manually.'
    };
  } catch (err: any) {
    const mapped = mapInviteCreateError(getErrorMessage(err));
    return { ok: false, status: 'FAILED', code: mapped.code, message: mapped.message };
  }
}

export async function validateInvitationToken(token: string): Promise<InviteValidationResult> {
  const cleanToken = token.trim();
  if (!cleanToken) return { code: 'INVITE_INVALID', invite: null };

  try {
    const response = await fetch(`/api/invites/validate?token=${encodeURIComponent(cleanToken)}`);
    const data = await response.json().catch(() => null as any);
    if (!response.ok || !data?.ok) {
      const reason = String(data?.reason ?? '').toLowerCase();
      if (reason === 'expired') return { code: 'INVITE_EXPIRED', invite: null };
      if (reason === 'accepted') return { code: 'INVITE_ACCEPTED', invite: null };
      if (reason === 'revoked') return { code: 'INVITE_REVOKED', invite: null };
      return { code: 'INVITE_INVALID', invite: null };
    }

    const invite = data.invite;
    return {
      code: 'OK',
      invite: {
        id: invite.id,
        company_id: invite.orgId,
        organization_name: invite.orgName ?? null,
        email: invite.email,
        role: invite.role,
        created_by_user_id: '' as UUID,
        created_at: '',
        accepted_at: null,
        accepted_user_id: null,
        token: cleanToken,
        expires_at: invite.expiresAt ?? null,
        status: invite.status ?? 'PENDING',
        company_name: invite.orgName ?? null
      } as CompanyInvite & { company_name?: string | null }
    };
  } catch {
    return { code: 'INVITE_INVALID', invite: null };
  }
}

export async function acceptInvite(input: { inviteId: UUID; userId: UUID }): Promise<CompanyMembership> {
  await ensureInsforgeSession();

  const { data: invite, error: inviteError } = await insforge.database
    .from('company_invites')
    .select('*')
    .eq('id', input.inviteId)
    .maybeSingle();

  if (inviteError) throw new Error(getErrorMessage(inviteError));
  if (!invite) throw new Error('INVITE_INVALID: Invite not found.');

  const status = normalizeInviteStatus((invite as any).status);
  if (!['PENDING', 'SENT', 'FAILED'].includes(status)) {
    throw new Error('INVITE_INVALID: Invite is no longer active.');
  }

  const expires = new Date((invite as any).expires_at);
  if (!Number.isNaN(expires.getTime()) && expires <= new Date()) {
    throw new Error('INVITE_EXPIRED: This invitation has expired.');
  }

  const companyId = (invite as any).company_id as UUID;
  const role = (invite as any).role as CompanyRole;

  const seatLimit = await getSeatLimitForCompany(companyId);
  const seatsUsed = await countActiveMembers(companyId);
  if (seatLimit > 0 && seatsUsed >= seatLimit) {
    throw new Error('SEATS_FULL: This organization has reached its seat limit. Contact your admin.');
  }

  const { data: existingMembership } = await insforge.database
    .from('company_memberships')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', input.userId)
    .maybeSingle();

  let membership: CompanyMembership;
  if (existingMembership) {
    const membershipPatch: Record<string, unknown> = {
      role,
      status: 'ACTIVE',
      department_id: (invite as any).department_id ?? null,
      site_id: (invite as any).site_id ?? null,
      invited_by_user_id: (invite as any).created_by_user_id ?? null,
      consultant_scope: (invite as any).consultant_scope ?? null
    };
    const { data: updatedMembership, error: membershipUpdateError } = await insforge.database
      .from('company_memberships')
      .update(membershipPatch)
      .eq('id', (existingMembership as any).id)
      .eq('company_id', companyId)
      .eq('user_id', input.userId)
      .select('*')
      .single();
    if (membershipUpdateError || !updatedMembership) throw new Error(getErrorMessage(membershipUpdateError));
    membership = updatedMembership as CompanyMembership;
  } else {
    membership = await createMembership({
      companyId,
      userId: input.userId,
      role,
      departmentId: (invite as any).department_id ?? null,
      siteId: (invite as any).site_id ?? null,
      invitedByUserId: (invite as any).created_by_user_id ?? null,
      consultantScope: (invite as any).consultant_scope ?? null
    });
  }

  const acceptedAt = new Date().toISOString();
  const { error: updateInviteError } = await insforge.database
    .from('company_invites')
    .update({
      accepted_at: acceptedAt,
      accepted_user_id: input.userId,
      status: 'ACCEPTED'
    })
    .eq('id', input.inviteId);

  if (updateInviteError) throw new Error(getErrorMessage(updateInviteError));

  await createActivityLog({
    companyId,
    actorUserId: input.userId,
    action: 'company_invites.accept',
    entityType: 'company_invite',
    entityId: input.inviteId
  });

  return membership;
}

export async function acceptInviteByToken(input: { token: string; userId: UUID }): Promise<CompanyMembership> {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/invites/accept', {
    method: 'POST',
    headers,
    body: JSON.stringify({ token: input.token })
  });
  const data = await response.json().catch(() => null as any);
  if (!response.ok || !data?.ok) {
    const reason = String(data?.reason ?? '').toLowerCase();
    if (reason === 'expired') throw new Error('INVITE_EXPIRED: This invitation has expired.');
    if (reason === 'accepted') throw new Error('INVITE_ACCEPTED: This invitation has already been accepted.');
    if (reason === 'revoked') throw new Error('INVITE_REVOKED: This invitation was revoked.');
    throw new Error(`INVITE_INVALID: ${data?.error || 'Invalid invite token.'}`);
  }

  return {
    id: '' as UUID,
    company_id: data.orgId as UUID,
    user_id: input.userId,
    role: data.role as CompanyRole,
    status: 'ACTIVE',
    created_at: new Date().toISOString()
  } as CompanyMembership;
}

export async function resendInvite(input: { inviteId: UUID; actorUserId: UUID }): Promise<CompanyInvite> {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/invites/resend', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      inviteId: input.inviteId,
      sendEmail: true
    })
  });
  const data = await response.json().catch(() => null as any);
  if (!response.ok || !data?.ok || !data?.invite) {
    throw new Error(data?.error || 'Failed to resend invite.');
  }
  return data.invite as CompanyInvite;
}

export async function getInviteLinkForInviteId(input: { inviteId: UUID }): Promise<string> {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/invites/resend', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      inviteId: input.inviteId,
      sendEmail: false
    })
  });
  const data = await response.json().catch(() => null as any);
  if (!response.ok || !data?.ok || !data?.inviteLink) {
    throw new Error(data?.error || 'Could not generate invite link.');
  }
  return String(data.inviteLink);
}

export async function cancelInvite(input: { inviteId: UUID; actorUserId: UUID }): Promise<void> {
  await ensureInsforgeSession();
  const { data: invite, error } = await insforge.database
    .from('company_invites')
    .update({ status: 'CANCELLED' })
    .eq('id', input.inviteId)
    .select('company_id')
    .single();

  if (error) throw new Error(getErrorMessage(error));

  await createActivityLog({
    companyId: (invite as any).company_id as UUID,
    actorUserId: input.actorUserId,
    action: 'company_invites.cancel',
    entityType: 'company_invite',
    entityId: input.inviteId
  });
}

export function getInviteIdByToken(token: string): Promise<UUID | null> {
  const cleanToken = token.trim();
  if (!cleanToken) return Promise.resolve(null);

  return fetch(`/api/invites/validate?token=${encodeURIComponent(cleanToken)}`)
    .then(async (response) => {
      const data = await response.json().catch(() => null as any);
      if (!response.ok || !data?.ok || !data?.invite?.id) return null;
      return data.invite.id as UUID;
    });
}

export function getInviteAcceptanceLink(token: string): string {
  return `${window.location.origin}/invite/accept?token=${encodeURIComponent(token)}`;
}

export function toUserInviteMessage(message: string): string {
  const code = mapInviteErrorCode(message);
  switch (code) {
    case 'INVITE_EXPIRED':
      return 'This invitation has expired. Ask your admin to resend it.';
    case 'INVITE_INVALID':
      return 'This invitation link is invalid.';
    case 'INVITE_ACCEPTED':
      return 'This invitation has already been accepted. Please log in.';
    case 'INVITE_REVOKED':
      return 'This invitation has been revoked. Request a new invite.';
    case 'SEATS_FULL':
      return 'This organization has reached its seat limit. Contact your admin.';
    case 'ALREADY_MEMBER':
      return 'You are already a member of this organization.';
    case 'ALREADY_INVITED':
      return 'This user already has an active invitation.';
    default:
      return message;
  }
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
    default:
      return 4;
  }
}
