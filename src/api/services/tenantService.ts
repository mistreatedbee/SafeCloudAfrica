import { insforge } from '../insforge/client';
import type { Company, CompanyInvite, CompanyMembership, UUID } from '../models/entities';
import type { CompanyRole, LicenseType, ModuleKey } from '../models/core';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';
import { ensureInsforgeSession } from '../insforge/ensureSession';

function normalizeInviteStatus(status: string | null | undefined): string {
  return String(status ?? '').trim().toUpperCase();
}

function isSeatExemptRole(role: string | null | undefined, seatExempt: boolean | null | undefined): boolean {
  const normalizedRole = String(role ?? '').trim().toLowerCase();
  return (normalizedRole === 'consultant' || normalizedRole === 'auditor') && Boolean(seatExempt);
}

function isRouteMissingError(status: number, data: any): boolean {
  return status === 404 || String(data?.error || '').toLowerCase().includes('not found');
}

function getInviteAcceptanceLinkForCurrentOrigin(token: string): string {
  return `${window.location.origin}/invite/accept?token=${encodeURIComponent(token)}`;
}

function generateRawInviteToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hashInviteToken(rawToken: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawToken.trim()));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function addDaysIso(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

async function getMembershipForActor(companyId: UUID, userId: UUID): Promise<CompanyMembership | null> {
  const { data, error } = await insforge.database
    .from('company_memberships')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(getErrorMessage(error));
  return (data as CompanyMembership) ?? null;
}

async function createInviteFallback(input: {
  company: Company;
  actorUserId: UUID;
  email: string;
  role: CompanyRole;
  departmentId?: UUID | null;
  siteId?: UUID | null;
  modulesScope?: ModuleKey[];
}): Promise<InviteCreateResult> {
  const [membership, seatLimit, seatsUsed, existingInvites] = await Promise.all([
    getMembershipForActor(input.company.id, input.actorUserId),
    getSeatLimitForCompany(input.company.id),
    countBillableActiveMembers(input.company.id),
    insforge.database
      .from('company_invites')
      .select('id')
      .eq('company_id', input.company.id)
      .eq('email', input.email.trim().toLowerCase())
      .in('status', ['PENDING', 'SENT'])
  ]);

  const normalizedRole = String(input.role).toLowerCase() as CompanyRole;
  const actorRole = String(membership?.role ?? '').toLowerCase();
  const actorStatus = normalizeInviteStatus(membership?.status);
  const isOwner = String(input.company.primary_admin_user_id) === String(input.actorUserId);
  const isAdmin = actorRole === 'admin' && actorStatus === 'ACTIVE';
  if (!isOwner && !isAdmin) {
    return {
      ok: false,
      status: 'FAILED',
      code: 'PERMISSION_DENIED',
      message: 'Only organization owners or admins can send invites.'
    };
  }

  if (seatLimit > 0 && seatsUsed >= seatLimit) {
    return {
      ok: false,
      status: 'FAILED',
      code: 'SEATS_FULL',
      message: 'Seat limit reached. Upgrade to invite more users.'
    };
  }

  if (existingInvites.error) throw new Error(getErrorMessage(existingInvites.error));

  if (existingInvites.data && existingInvites.data.length > 0) {
    const { error: cancelError } = await insforge.database
      .from('company_invites')
      .update({ status: 'CANCELLED', error_message: 'Superseded by newer invitation.' })
      .in('id', existingInvites.data.map((row: any) => row.id));
    if (cancelError) throw new Error(getErrorMessage(cancelError));
  }

  const rawToken = generateRawInviteToken();
  const tokenHash = await hashInviteToken(rawToken);
  const expiresAt = addDaysIso(7);
  const normalizedEmail = input.email.trim().toLowerCase();
  const consultantScope =
    normalizedRole === 'consultant' || normalizedRole === 'auditor'
      ? {
          allowedModules: Array.from(new Set((input.modulesScope ?? []).map((item) => String(item)))),
          allowedDepartments: input.departmentId ? [input.departmentId] : [],
          allowedSites: input.siteId ? [input.siteId] : []
        }
      : null;

  const payload: Record<string, unknown> = {
    company_id: input.company.id,
    organization_name: input.company.name,
    email: normalizedEmail,
    role: normalizedRole,
    created_by_user_id: input.actorUserId,
    invited_by_user_id: input.actorUserId,
    token: rawToken,
    token_hash: tokenHash,
    expires_at: expiresAt,
    // Manual-link fallback remains an active invite; delivery outcome is tracked separately.
    status: 'PENDING',
    sent_at: null,
    last_sent_at: null,
    send_count: 0,
    error_message: 'Invite email unavailable in this environment. Copy link and send manually.',
    consultant_scope: consultantScope
  };
  if (input.departmentId) payload.department_id = input.departmentId;
  if (input.siteId) payload.site_id = input.siteId;

  const { data, error } = await insforge.database.from('company_invites').insert(payload).select('*').single();
  if (error || !data) {
    const mapped = mapInviteCreateError(getErrorMessage(error));
    return { ok: false, status: 'FAILED', code: mapped.code, message: mapped.message };
  }

  return {
    ok: true,
    status: 'FAILED',
    invite: data as CompanyInvite,
    inviteLink: getInviteAcceptanceLinkForCurrentOrigin(rawToken),
    message: 'Invite created, but email is unavailable in this environment. Copy the invite link and send it manually.',
    emailError: 'Email is unavailable in this environment.'
  };
}

async function validateInvitationTokenFallback(token: string): Promise<InviteValidationResult> {
  const resolved = await resolveInviteTokenFallback(token);
  if (resolved.code === 'OK' && resolved.invite) {
    return {
      code: 'OK',
      invite: {
        id: resolved.invite.id,
        company_id: resolved.invite.company_id,
        organization_name: resolved.invite.company_name ?? null,
        email: resolved.invite.email,
        role: resolved.invite.role as CompanyRole,
        created_by_user_id: '' as UUID,
        created_at: '',
        accepted_at: null,
        accepted_user_id: null,
        token,
        expires_at: resolved.invite.expires_at ?? null,
        status: resolved.invite.status ?? 'PENDING',
        company_name: resolved.invite.company_name ?? null
      } as CompanyInvite & { company_name?: string | null }
    };
  }
  return { code: resolved.code, invite: null };
}

async function getInviteIdByTokenRpc(token: string): Promise<UUID | null> {
  const resolved = await resolveInviteTokenFallback(token);
  if (resolved.code === 'OK' && resolved.invite?.id) return resolved.invite.id as UUID;
  if (resolved.code === 'BACKEND_UNAVAILABLE') {
    throw new Error('INVITE_BACKEND_UNAVAILABLE: Invite validation is not configured correctly.');
  }
  return null;
}

async function resendInviteFallback(input: { inviteId: UUID; actorUserId: UUID }): Promise<InviteResendResult> {
  const invite = await getInviteById(input.inviteId);
  const company = await getCompanyById(invite.company_id);
  if (!company) throw new Error('Invite not found.');

  const membership = await getMembershipForActor(invite.company_id, input.actorUserId);
  const actorRole = String(membership?.role ?? '').toLowerCase();
  const actorStatus = normalizeInviteStatus(membership?.status);
  const isOwner = String(company.primary_admin_user_id) === String(input.actorUserId);
  const isAdmin = actorRole === 'admin' && actorStatus === 'ACTIVE';
  if (!isOwner && !isAdmin) {
    throw new Error('Only Owner/Admin can resend invites');
  }

  const rawToken = generateRawInviteToken();
  const tokenHash = await hashInviteToken(rawToken);
  const expiresAt = addDaysIso(7);

  const { data, error } = await insforge.database
    .from('company_invites')
    .update({
      token: rawToken,
      token_hash: tokenHash,
      expires_at: expiresAt,
      accepted_at: null,
      accepted_user_id: null,
      // Keep the invite active for manual-link validation/acceptance.
      status: 'PENDING',
      error_message: 'Invite email unavailable in this environment. Copy link and send manually.'
    })
    .eq('id', input.inviteId)
    .select('*')
    .single();

  if (error || !data) throw new Error(getErrorMessage(error));

  return {
    emailSent: false,
    invite: data as CompanyInvite,
    inviteLink: getInviteAcceptanceLinkForCurrentOrigin(rawToken),
    message: 'Invite updated, but email is unavailable in this environment. Copy the invite link and send it manually.',
    emailError: 'Email is unavailable in this environment.'
  };
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

  const seatLimit = await getSeatLimitForCompany(input.companyId);
  const memberCount = await countBillableActiveMembers(input.companyId);
  if (seatLimit > 0 && memberCount >= seatLimit && !isSeatExemptRole(input.role, false)) {
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

export async function countBillableActiveMembers(companyId: UUID): Promise<number> {
  const { data, error } = await insforge.database.rpc('count_billable_seats', { p_company_id: companyId });
  if (!error && data != null) return Number(data || 0);

  const { data: memberships, error: fallbackError } = await insforge.database
    .from('company_memberships')
    .select('role, status, seat_exempt')
    .eq('company_id', companyId);
  if (fallbackError) throw new Error(getErrorMessage(fallbackError));

  return (memberships ?? []).filter((row: any) => {
    const status = String(row.status ?? 'ACTIVE').toUpperCase();
    return status === 'ACTIVE' && !isSeatExemptRole(row.role, row.seat_exempt);
  }).length;
}

export async function countPendingInvites(companyId: UUID): Promise<number> {
  const { count, error } = await insforge.database
    .from('company_invites')
    .select('*', { count: 'planned', head: true })
    .eq('company_id', companyId)
    .in('status', ['PENDING', 'SENT']);
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
}

export async function getSeatLimitForCompany(companyId: UUID): Promise<number> {
  await ensureInsforgeSession({ reason: 'tenant-service:get-seat-limit' });
  const { data, error } = await insforge.database.rpc('get_company_seat_limit', { p_company_id: companyId });
  if (!error && data != null) return Number(data || 0);
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
      emailError?: string | null;
    }
  | {
      ok: false;
      status: 'FAILED';
      code: InviteCreateErrorCode;
      message: string;
    };

export type InviteValidationCode = 'INVITE_INVALID' | 'INVITE_EXPIRED' | 'INVITE_ACCEPTED' | 'BACKEND_UNAVAILABLE' | 'OK';

export type InviteValidationResult = {
  code: InviteValidationCode;
  invite: (CompanyInvite & { company_name?: string | null }) | null;
};

function formatInviteEmailFailureMessage(prefix: string, emailError?: string | null): string {
  const detail = String(emailError ?? '').trim();
  if (!detail) return `${prefix} Copy the invite link and send it manually.`;
  return `${prefix} ${detail} Copy the invite link and send it manually.`;
}

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

function mapInviteErrorCode(message: string): 'INVITE_EXPIRED' | 'INVITE_INVALID' | 'INVITE_ACCEPTED' | 'INVITE_BACKEND_UNAVAILABLE' | 'SEATS_FULL' | 'ALREADY_MEMBER' | 'ALREADY_INVITED' | 'UNKNOWN' {
  const lowered = message.toLowerCase();
  if (lowered.includes('invite_expired')) return 'INVITE_EXPIRED';
  if (lowered.includes('invite_invalid')) return 'INVITE_INVALID';
  if (lowered.includes('invite_accepted')) return 'INVITE_ACCEPTED';
  if (lowered.includes('invite_backend_unavailable') || lowered.includes('validation is not configured') || lowered.includes('rpc')) {
    return 'INVITE_BACKEND_UNAVAILABLE';
  }
  if (lowered.includes('seats_full') || lowered.includes('seat limit')) return 'SEATS_FULL';
  if (lowered.includes('already_member')) return 'ALREADY_MEMBER';
  if (lowered.includes('already_invited')) return 'ALREADY_INVITED';
  return 'UNKNOWN';
}

type InviteResolverRow = {
  invite_id?: UUID | null;
  company_id?: UUID | null;
  company_name?: string | null;
  email?: string | null;
  role?: string | null;
  status?: string | null;
  expires_at?: string | null;
  resolution_code?: string | null;
};

type InviteResolverResult = {
  code: InviteValidationCode;
  invite: (InviteResolverRow & { id?: UUID | null }) | null;
};

function mapInviteResolutionCode(code: string | null | undefined): InviteValidationCode {
  const normalized = String(code ?? '').trim().toLowerCase();
  if (normalized === 'ok') return 'OK';
  if (normalized === 'expired') return 'INVITE_EXPIRED';
  if (normalized === 'accepted') return 'INVITE_ACCEPTED';
  if (normalized === 'cancelled') return 'INVITE_INVALID';
  return 'INVITE_INVALID';
}

function normalizeResolvedInvite(row: InviteResolverRow | null | undefined): (InviteResolverRow & { id?: UUID | null }) | null {
  if (!row) return null;
  return {
    ...row,
    id: row.invite_id ?? null
  };
}

async function resolveInviteTokenFallback(token: string): Promise<InviteResolverResult> {
  const cleanToken = token.trim();
  if (!cleanToken) return { code: 'INVITE_INVALID', invite: null };

  const resolverRpc = await insforge.database.rpc('resolve_invitation_token', { p_token: cleanToken });
  if (!resolverRpc.error) {
    const row = normalizeResolvedInvite(Array.isArray(resolverRpc.data) ? resolverRpc.data[0] : resolverRpc.data);
    if (!row) return { code: 'INVITE_INVALID', invite: null };
    return {
      code: mapInviteResolutionCode(row.resolution_code),
      invite: row
    };
  }

  const validationRpc = await insforge.database.rpc('validate_invitation_token', { p_token: cleanToken });
  if (!validationRpc.error) {
    const row = normalizeResolvedInvite(Array.isArray(validationRpc.data) ? validationRpc.data[0] : validationRpc.data);
    if (!row) return { code: 'INVITE_INVALID', invite: null };
    return { code: 'OK', invite: row };
  }

  const legacyIdRpc = await insforge.database.rpc('get_invite_id_by_token', { p_token: cleanToken });
  if (!legacyIdRpc.error) {
    const inviteId = (legacyIdRpc.data as UUID | null) ?? null;
    if (!inviteId) return { code: 'INVITE_INVALID', invite: null };
    return {
      code: 'OK',
      invite: {
        id: inviteId,
        invite_id: inviteId
      }
    };
  }

  return { code: 'BACKEND_UNAVAILABLE', invite: null };
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
      cache: 'no-store',
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
    if (isRouteMissingError(response.status, data)) {
      return await createInviteFallback(input);
    }
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
      message: emailSent
        ? 'Invite email sent successfully.'
        : formatInviteEmailFailureMessage('Invite created, but email failed.', data?.emailError || invite?.error_message),
      emailError: data?.emailError ? String(data.emailError) : (invite?.error_message ?? null)
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
    const response = await fetch(`/api/invites/validate?token=${encodeURIComponent(cleanToken)}`, {
      cache: 'no-store'
    });
    const data = await response.json().catch(() => null as any);
    if (isRouteMissingError(response.status, data)) {
      return await validateInvitationTokenFallback(cleanToken);
    }
    if (!response.ok || !data?.ok) {
      const reason = String(data?.reason ?? '').toLowerCase();
      if (reason === 'expired') return { code: 'INVITE_EXPIRED', invite: null };
      if (reason === 'accepted') return { code: 'INVITE_ACCEPTED', invite: null };
      if (response.status >= 500 || reason === 'backend_unavailable') return { code: 'BACKEND_UNAVAILABLE', invite: null };
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
        token: null,
        expires_at: invite.expiresAt ?? null,
        status: invite.status ?? 'PENDING',
        company_name: invite.orgName ?? null
      } as CompanyInvite & { company_name?: string | null }
    };
  } catch {
    return { code: 'BACKEND_UNAVAILABLE', invite: null };
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
  if (!['PENDING', 'SENT'].includes(status)) {
    throw new Error('INVITE_INVALID: Invite is no longer active.');
  }

  const expires = new Date((invite as any).expires_at);
  if (!Number.isNaN(expires.getTime()) && expires <= new Date()) {
    throw new Error('INVITE_EXPIRED: This invitation has expired.');
  }

  const companyId = (invite as any).company_id as UUID;
  const role = (invite as any).role as CompanyRole;

  const seatLimit = await getSeatLimitForCompany(companyId);
  const seatsUsed = await countBillableActiveMembers(companyId);
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
    cache: 'no-store',
    headers,
    body: JSON.stringify({ token: input.token })
  });
  const data = await response.json().catch(() => null as any);
  if (isRouteMissingError(response.status, data)) {
    const inviteId = await getInviteIdByTokenRpc(input.token);
    if (!inviteId) throw new Error('INVITE_INVALID: Invalid invite token.');
    return await acceptInvite({ inviteId, userId: input.userId });
  }
  if (!response.ok || !data?.ok) {
    const reason = String(data?.reason ?? '').toLowerCase();
    if (reason === 'expired') throw new Error('INVITE_EXPIRED: This invitation has expired.');
    if (reason === 'accepted') throw new Error('INVITE_ACCEPTED: This invitation has already been accepted.');
    if (response.status >= 500 || reason === 'backend_unavailable') {
      throw new Error('INVITE_BACKEND_UNAVAILABLE: Invite validation is not configured correctly.');
    }
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

export type InviteResendResult = {
  emailSent: boolean;
  invite: CompanyInvite;
  inviteLink?: string;
  message?: string;
  emailError?: string | null;
};

export async function resendInvite(input: { inviteId: UUID; actorUserId: UUID }): Promise<InviteResendResult> {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/invites/resend', {
    method: 'POST',
    cache: 'no-store',
    headers,
    body: JSON.stringify({
      inviteId: input.inviteId,
      sendEmail: true
    })
  });
  const data = await response.json().catch(() => null as any);
  if (isRouteMissingError(response.status, data)) {
    return await resendInviteFallback(input);
  }
  if (!response.ok || !data?.ok || !data?.invite) {
    throw new Error(data?.error || 'Failed to resend invite.');
  }
  return {
    emailSent: !!data.emailSent,
    invite: data.invite as CompanyInvite,
    inviteLink: data.inviteLink ? String(data.inviteLink) : undefined,
    message: data.emailSent
      ? 'Invite resent successfully.'
      : formatInviteEmailFailureMessage('Invite updated, but email failed.', data?.emailError || data?.invite?.error_message),
    emailError: data?.emailError ? String(data.emailError) : (data?.invite?.error_message ? String(data.invite.error_message) : null)
  };
}

export async function getInviteLinkForInviteId(input: { inviteId: UUID }): Promise<string> {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/invites/resend', {
    method: 'POST',
    cache: 'no-store',
    headers,
    body: JSON.stringify({
      inviteId: input.inviteId,
      sendEmail: false
    })
  });
  const data = await response.json().catch(() => null as any);
  if (isRouteMissingError(response.status, data)) {
    const result = await resendInviteFallback({ inviteId: input.inviteId, actorUserId: (await ensureInsforgeSession()).userId as UUID });
    if (!result.inviteLink) throw new Error('Could not generate invite link.');
    return result.inviteLink;
  }
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

  return fetch(`/api/invites/validate?token=${encodeURIComponent(cleanToken)}`, {
    cache: 'no-store'
  })
    .then(async (response) => {
      const data = await response.json().catch(() => null as any);
      if (isRouteMissingError(response.status, data)) {
        return await getInviteIdByTokenRpc(cleanToken);
      }
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
    case 'INVITE_BACKEND_UNAVAILABLE':
      return 'Invite validation is not configured correctly yet. Please contact support or ask your admin to finish the latest invite migration.';
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
  actorUserId?: UUID;
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
  actorUserId?: UUID;
}): Promise<void> {
  const { error } = await insforge.database
    .from('company_memberships')
    .update({ status })
    .eq('company_id', input.companyId)
    .eq('id', input.membershipId);
  if (error) throw new Error(getErrorMessage(error));
}

export async function updateMembershipHrManagerFlag(input: {
  companyId: UUID;
  membershipId: UUID;
  isHrManager: boolean;
  actorUserId?: UUID;
}): Promise<void> {
  const { error } = await insforge.database
    .from('company_memberships')
    .update({ is_hr_manager: input.isHrManager })
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
