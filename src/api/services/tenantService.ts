import { insforge } from '../insforge/client';
import type { Company, CompanyInvite, CompanyMembership, UUID } from '../models/entities';
import type { CompanyRole, LicenseType, ModuleKey } from '../models/core';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';
import { ensureInsforgeSession } from '../insforge/ensureSession';
import { sendOrganizationInviteEmail } from './emailService';

function generateInviteToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function normalizeInviteStatus(status: string | null | undefined): string {
  return String(status ?? '').trim().toUpperCase();
}

function addDaysIso(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
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
}): Promise<Company> {
  await ensureInsforgeSession();
  const patch: Record<string, unknown> = {};
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
      status: 'SENT';
      invite: CompanyInvite;
    }
  | {
      ok: false;
      status: 'FAILED';
      code: InviteCreateErrorCode;
      message: string;
    };

export type InviteValidationCode = 'INVITE_INVALID' | 'INVITE_EXPIRED' | 'INVITE_ACCEPTED' | 'OK';

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

function mapInviteErrorCode(message: string): 'INVITE_EXPIRED' | 'INVITE_INVALID' | 'SEATS_FULL' | 'ALREADY_MEMBER' | 'ALREADY_INVITED' | 'UNKNOWN' {
  const lowered = message.toLowerCase();
  if (lowered.includes('invite_expired')) return 'INVITE_EXPIRED';
  if (lowered.includes('invite_invalid')) return 'INVITE_INVALID';
  if (lowered.includes('seats_full') || lowered.includes('seat limit')) return 'SEATS_FULL';
  if (lowered.includes('already_member')) return 'ALREADY_MEMBER';
  if (lowered.includes('already_invited')) return 'ALREADY_INVITED';
  return 'UNKNOWN';
}

async function getInviterInfo(companyId: UUID, actorUserId: UUID): Promise<{ inviterName: string; inviterEmail: string }> {
  const profile = await insforge.database
    .from('user_profiles')
    .select('full_name, email')
    .eq('company_id', companyId)
    .eq('user_id', actorUserId)
    .maybeSingle();

  const fallback = await insforge.auth.getCurrentSession();
  const inviterEmail = (profile.data as any)?.email || fallback.data?.session?.user?.email || 'no-reply@safecloudafrica.com';
  const inviterName = (profile.data as any)?.full_name || inviterEmail;
  return { inviterName, inviterEmail };
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
  const expiresAtIso = addDaysIso(7);
  const isScopedExternalRole = input.role === 'consultant' || input.role === 'auditor';
  const scope = isScopedExternalRole
    ? {
        allowedModules: Array.from(new Set(input.modulesScope ?? [])),
        allowedDepartments: input.departmentId ? [input.departmentId] : [],
        allowedSites: input.siteId ? [input.siteId] : []
      }
    : null;

  try {
    const [inviterMembershipRes, companyRes] = await Promise.all([
      insforge.database
        .from('company_memberships')
        .select('role,status')
        .eq('company_id', input.company.id)
        .eq('user_id', input.actorUserId)
        .maybeSingle(),
      insforge.database
        .from('companies')
        .select('primary_admin_user_id')
        .eq('id', input.company.id)
        .maybeSingle()
    ]);

    const inviterRole = normalizeInviteStatus((inviterMembershipRes.data as any)?.role);
    const inviterStatus = normalizeInviteStatus((inviterMembershipRes.data as any)?.status || 'ACTIVE');
    const isOwner = String((companyRes.data as any)?.primary_admin_user_id ?? '') === String(input.actorUserId);
    const isAdmin = inviterRole === 'ADMIN' && inviterStatus === 'ACTIVE';

    if (!isOwner && !isAdmin) {
      return {
        ok: false,
        status: 'FAILED',
        code: 'PERMISSION_DENIED',
        message: 'Only organization owners or admins can send invites.'
      };
    }

    const { data: activeInvites } = await insforge.database
      .from('company_invites')
      .select('id, status')
      .eq('company_id', input.company.id)
      .eq('email', normalizedEmail)
      .in('status', ['PENDING', 'SENT'])
      .order('created_at', { ascending: false });

    if (activeInvites && activeInvites.length > 0) {
      const ids = activeInvites.map((row: any) => row.id as UUID);
      await insforge.database
        .from('company_invites')
        .update({
          status: 'CANCELLED',
          error_message: 'Superseded by newer invitation.'
        })
        .in('id', ids);
    }

    const { data: existingUserProfile } = await insforge.database
      .from('user_profiles')
      .select('user_id')
      .eq('company_id', input.company.id)
      .eq('email', normalizedEmail)
      .limit(1)
      .maybeSingle();

    if (existingUserProfile?.user_id) {
      const { data: existingMembership } = await insforge.database
        .from('company_memberships')
        .select('id,status')
        .eq('company_id', input.company.id)
        .eq('user_id', (existingUserProfile as any).user_id)
        .maybeSingle();

      if (existingMembership && normalizeInviteStatus((existingMembership as any).status || 'ACTIVE') === 'ACTIVE') {
        return {
          ok: false,
          status: 'FAILED',
          code: 'ALREADY_MEMBER',
          message: 'This user is already a member of this organization.'
        };
      }
    }

    const [seatLimit, seatsUsed, pendingInvites] = await Promise.all([
      getSeatLimitForCompany(input.company.id),
      countActiveMembers(input.company.id),
      countPendingInvites(input.company.id)
    ]);

    if (seatLimit > 0 && seatsUsed + pendingInvites >= seatLimit) {
      return {
        ok: false,
        status: 'FAILED',
        code: 'SEATS_FULL',
        message: 'Seat limit reached. Upgrade to invite more users.'
      };
    }

    const payload: Record<string, unknown> = {
      company_id: input.company.id,
      organization_name: input.company.name,
      email: normalizedEmail,
      role: input.role,
      created_by_user_id: input.actorUserId,
      token: generateInviteToken(),
      expires_at: expiresAtIso,
      status: 'PENDING',
      consultant_scope: scope,
      error_message: null
    };

    if (input.departmentId) payload.department_id = input.departmentId;
    if (input.siteId) payload.site_id = input.siteId;

    let insertResult = await insforge.database.from('company_invites').insert(payload).select('*').single();

    if (insertResult.error && getErrorMessage(insertResult.error).toLowerCase().includes('column') && getErrorMessage(insertResult.error).toLowerCase().includes('does not exist')) {
      delete payload.department_id;
      delete payload.site_id;
      insertResult = await insforge.database.from('company_invites').insert(payload).select('*').single();
    }

    if (insertResult.error || !insertResult.data) {
      const mapped = mapInviteCreateError(getErrorMessage(insertResult.error));
      return { ok: false, status: 'FAILED', code: mapped.code, message: mapped.message };
    }

    const invite = insertResult.data as CompanyInvite;

    try {
      const inviter = await getInviterInfo(input.company.id, input.actorUserId);
      await sendOrganizationInviteEmail({
        to: normalizedEmail,
        orgName: input.company.name,
        role: input.role,
        inviterName: inviter.inviterName,
        inviterEmail: inviter.inviterEmail,
        inviteToken: invite.token,
        expiresAtIso: invite.expires_at
      });
      const sentAt = new Date().toISOString();
      const { data: sentInvite } = await insforge.database
        .from('company_invites')
        .update({
          status: 'SENT',
          sent_at: sentAt,
          error_message: null
        })
        .eq('id', invite.id)
        .select('*')
        .single();
      if (sentInvite) {
        invite.status = 'SENT';
        invite.sent_at = sentAt;
      }
    } catch (emailErr: any) {
      await insforge.database
        .from('company_invites')
        .update({ status: 'FAILED', error_message: getErrorMessage(emailErr) })
        .eq('id', invite.id);
      return {
        ok: false,
        status: 'FAILED',
        code: 'INVITE_CREATE_FAILED',
        message: 'Email failed to send, try again.'
      };
    }

    try {
      await createActivityLog({
        companyId: input.company.id,
        actorUserId: input.actorUserId,
        action: 'company_invites.create',
        entityType: 'company_invite',
        entityId: invite.id,
        metadata: { email: normalizedEmail, role: input.role }
      });
    } catch {
      // no-op
    }

    return { ok: true, status: 'SENT', invite };
  } catch (err: any) {
    const mapped = mapInviteCreateError(getErrorMessage(err));
    return { ok: false, status: 'FAILED', code: mapped.code, message: mapped.message };
  }
}

export async function validateInvitationToken(token: string): Promise<InviteValidationResult> {
  const cleanToken = token.trim();
  if (!cleanToken) return { code: 'INVITE_INVALID', invite: null };

  const { data, error } = await insforge.database.rpc('validate_invitation_token', { p_token: cleanToken });
  if (error) return { code: 'INVITE_INVALID', invite: null };

  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.invite_id) return { code: 'INVITE_INVALID', invite: null };

  return {
    code: 'OK',
    invite: {
      id: row.invite_id,
      company_id: row.company_id,
      organization_name: row.company_name ?? null,
      email: row.email,
      role: row.role,
      created_by_user_id: '' as UUID,
      created_at: '',
      accepted_at: null,
      accepted_user_id: null,
      token: cleanToken,
      expires_at: row.expires_at,
      status: row.status,
      company_name: row.company_name ?? null
    } as CompanyInvite & { company_name?: string | null }
  };
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
  const validation = await validateInvitationToken(input.token);
  if (validation.code === 'INVITE_EXPIRED') throw new Error('INVITE_EXPIRED: This invitation has expired.');
  if (validation.code !== 'OK' || !validation.invite?.id) throw new Error('INVITE_INVALID: Invalid invite token.');
  return acceptInvite({ inviteId: validation.invite.id, userId: input.userId });
}

export async function resendInvite(input: { inviteId: UUID; actorUserId: UUID }): Promise<CompanyInvite> {
  await ensureInsforgeSession();

  const { data: invite, error } = await insforge.database
    .from('company_invites')
    .select('*, companies(*)')
    .eq('id', input.inviteId)
    .single();

  if (error || !invite) throw new Error(getErrorMessage(error) || 'Invite not found.');

  const expiresAtIso = addDaysIso(7);
  const token = generateInviteToken();

  const { data: updated, error: updateError } = await insforge.database
    .from('company_invites')
    .update({
      token,
      expires_at: expiresAtIso,
      status: 'SENT',
      sent_at: new Date().toISOString(),
      error_message: null
    })
    .eq('id', input.inviteId)
    .select('*')
    .single();

  if (updateError || !updated) throw new Error(getErrorMessage(updateError));

  const inviter = await getInviterInfo((invite as any).company_id, input.actorUserId);
  try {
    await sendOrganizationInviteEmail({
      to: (updated as any).email,
      orgName: (invite as any).companies?.name ?? 'Organization',
      role: (updated as any).role,
      inviterName: inviter.inviterName,
      inviterEmail: inviter.inviterEmail,
      inviteToken: token,
      expiresAtIso
    });
  } catch (emailErr: any) {
    await insforge.database
      .from('company_invites')
      .update({ status: 'FAILED', error_message: getErrorMessage(emailErr) })
      .eq('id', input.inviteId);
    throw new Error('Invite updated, but email delivery failed. Use Copy link to share manually.');
  }

  await createActivityLog({
    companyId: (invite as any).company_id,
    actorUserId: input.actorUserId,
    action: 'company_invites.resend',
    entityType: 'company_invite',
    entityId: input.inviteId
  });

  return updated as CompanyInvite;
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

  return insforge.database
    .rpc('get_invite_id_by_token', { p_token: cleanToken })
    .then(({ data, error }) => {
      if (error) throw new Error(getErrorMessage(error));
      if (!data) return null;
      return data as UUID;
    });
}

export function getInviteAcceptanceLink(token: string): string {
  return `${window.location.origin}/accept-invite?token=${encodeURIComponent(token)}`;
}

export function toUserInviteMessage(message: string): string {
  const code = mapInviteErrorCode(message);
  switch (code) {
    case 'INVITE_EXPIRED':
      return 'This invitation has expired. Ask your admin to resend it.';
    case 'INVITE_INVALID':
      return 'This invitation link is invalid.';
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
