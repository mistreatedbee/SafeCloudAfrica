import {
  hashInviteToken,
  isSignedInviteToken,
  normalizeInviteStatus,
  parseSignedInviteToken,
  verifyInviteToken
} from '../../api/invites/_shared.js';

export type InviteValidationReason =
  | 'malformed'
  | 'not_found'
  | 'expired'
  | 'accepted'
  | 'revoked'
  | 'backend_unavailable';

export type ResolvedInvite = {
  id: string;
  company_id: string;
  organization_name: string | null;
  email: string;
  role: string;
  status: string;
  expires_at: string | null;
  accepted_at?: string | null;
  accepted_user_id?: string | null;
  created_by_user_id?: string | null;
  department_id?: string | null;
  site_id?: string | null;
  consultant_scope?: Record<string, unknown> | null;
  companies?: { name?: string | null } | null;
};

export type InviteResolutionResult =
  | { ok: true; invite: ResolvedInvite }
  | { ok: false; reason: InviteValidationReason; status: number; error: string };

export function isMalformedInviteToken(token: string): boolean {
  const cleanToken = token.trim();
  return !cleanToken;
}

function invalidInvite(reason: InviteValidationReason, status: number, error: string): InviteResolutionResult {
  return { ok: false, reason, status, error };
}

async function fetchInviteByToken(insforge: any, token: string) {
  if (isSignedInviteToken(token)) {
    const parsed = parseSignedInviteToken(token);
    if (!parsed) return { data: null, error: null, malformed: true };

    const byId = await insforge.database
      .from('company_invites')
      .select('*, companies(name)')
      .eq('id', parsed.inviteId)
      .maybeSingle();

    if (byId.data && !verifyInviteToken(token, byId.data)) {
      return { data: null, error: null, malformed: false };
    }

    return { data: byId.data ?? null, error: byId.error ?? null, malformed: false };
  }

  const tokenHash = hashInviteToken(token);
  const byHash = await insforge.database
    .from('company_invites')
    .select('*, companies(name)')
    .or(`token_hash.eq.${tokenHash},token.eq.${token}`)
    .limit(1)
    .maybeSingle();

  return { data: byHash.data ?? null, error: byHash.error ?? null, malformed: false };
}

export function toPublicInvitePayload(invite: ResolvedInvite) {
  return {
    id: invite.id,
    email: invite.email,
    organisation_id: invite.company_id,
    company_id: invite.company_id,
    role: invite.role,
    expires_at: invite.expires_at,
    status: normalizeInviteStatus(invite.status),
    organization_name: invite.organization_name || invite.companies?.name || null
  };
}

export async function resolveInviteToken(insforge: any, rawToken: string): Promise<InviteResolutionResult> {
  const token = String(rawToken ?? '').trim();
  if (isMalformedInviteToken(token)) {
    return invalidInvite('malformed', 400, 'Malformed invite token.');
  }

  const fetched = await fetchInviteByToken(insforge, token);
  if (fetched.malformed) {
    return invalidInvite('malformed', 400, 'Malformed invite token.');
  }
  if (fetched.error) {
    return invalidInvite('backend_unavailable', 500, 'Could not validate invite.');
  }
  if (!fetched.data) {
    return invalidInvite('not_found', 404, 'Invalid invite link.');
  }

  const invite = fetched.data as ResolvedInvite;
  const status = normalizeInviteStatus(invite.status);
  const expiresAt = invite.expires_at ? new Date(invite.expires_at) : null;
  const isExpired = !!expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt <= new Date();

  if (isExpired && (status === 'PENDING' || status === 'SENT')) {
    await insforge.database
      .from('company_invites')
      .update({ status: 'EXPIRED' })
      .eq('company_id', String(invite.company_id))
      .eq('id', invite.id);
    return invalidInvite('expired', 410, 'Invite expired. Request a new invite.');
  }

  if (status === 'ACCEPTED') {
    return invalidInvite('accepted', 409, 'Invite already used.');
  }

  if (status === 'CANCELLED') {
    return invalidInvite('revoked', 409, 'Invite revoked.');
  }

  if (status !== 'PENDING' && status !== 'SENT') {
    return invalidInvite('not_found', 404, 'Invalid invite link.');
  }

  return { ok: true, invite: { ...invite, status } };
}
