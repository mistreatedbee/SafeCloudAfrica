import { getServerInsforge, getServiceInsforge, nowIso, readBearerToken, resolveServerUser } from '../../api/_insforge.js';
import { logStructuredLine, sendAlertWebhook } from '../../api/_observability.js';
import { applyNoStoreHeaders } from '../../api/_response.js';
import { normalizeInviteStatus } from '../../api/invites/_shared.js';
import { resolveInviteToken } from './resolver.js';

const MODULE = 'api.invites.accept';
const PENDING_INVITE_STATUSES = ['PENDING', 'SENT'];
const EXPECTED_TOKEN_MISS_REASONS = new Set(['not_found', 'malformed']);

function getInviteServiceClient(): any {
  const service = getServiceInsforge();
  if (!service) {
    const err = new Error('Invite acceptance is not configured. Missing service role key.');
    (err as any).status = 500;
    (err as any).reason = 'service_role_missing';
    (err as any).code = 'SERVICE_ROLE_MISSING';
    throw err;
  }
  return service;
}

function normalizeRole(role: unknown): string {
  return String(role ?? '').trim().toLowerCase();
}

function normalizeEmail(email: unknown): string {
  return String(email || '').trim().toLowerCase();
}

type PendingInviteAcceptResult =
  | { ok: true; orgId: string; role: string; inviteId: string }
  | { ok: false; reason: 'no_pending_invite' | 'backend_unavailable'; error: string };

async function getEffectiveSeatLimit(insforge: any, companyId: string, company: any): Promise<number> {
  const rpcRes = await insforge.database.rpc('get_company_seat_limit', { p_company_id: companyId });
  if (!rpcRes.error && rpcRes.data != null) {
    return Number(rpcRes.data || 0);
  }
  return Number(company?.license_user_limit || company?.employee_limit || 0);
}

async function countBillableActiveMembers(insforge: any, companyId: string): Promise<number> {
  const rpcRes = await insforge.database.rpc('count_billable_seats', { p_company_id: companyId });
  if (!rpcRes.error && rpcRes.data != null) {
    return Number(rpcRes.data || 0);
  }

  const membersRes = await insforge.database
    .from('company_memberships')
    .select('role, status, seat_exempt')
    .eq('company_id', companyId);
  if (membersRes.error) throw membersRes.error;

  return (membersRes.data || []).filter((member: any) => {
    const status = normalizeInviteStatus(member.status || 'ACTIVE');
    if (status !== 'ACTIVE') return false;
    const role = normalizeRole(member.role);
    const seatExempt = Boolean(member.seat_exempt);
    return !((role === 'consultant' || role === 'auditor') && seatExempt);
  }).length;
}

export async function acceptResolvedInvite(input: {
  insforge: any;
  invite: any;
  userId: string;
  userEmail: string;
}): Promise<{ orgId: string; role: string }> {
  const { insforge, invite, userId } = input;
  const userEmail = String(input.userEmail || '').trim().toLowerCase();
  const inviteEmail = String(invite.email || '').trim().toLowerCase();
  if (!inviteEmail || inviteEmail !== userEmail) {
    const err = new Error('Invite email does not match authenticated account.');
    (err as any).status = 403;
    throw err;
  }

  const status = normalizeInviteStatus(invite.status);
  if (!PENDING_INVITE_STATUSES.includes(status)) {
    const err = new Error('Invite is no longer active.');
    (err as any).status = status === 'ACCEPTED' ? 409 : 404;
    (err as any).reason = status === 'ACCEPTED' ? 'accepted' : 'revoked';
    throw err;
  }

  const expiresAt = invite.expires_at ? new Date(invite.expires_at) : null;
  if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt <= new Date()) {
    await insforge.database
      .from('company_invites')
      .update({ status: 'EXPIRED' })
      .eq('id', invite.id);
    const err = new Error('Invite expired. Request a new invite.');
    (err as any).status = 410;
    (err as any).reason = 'expired';
    throw err;
  }

  const companyId = String(invite.company_id);

  const [companyRes, activeBillableMembers, existingMembershipRes] = await Promise.all([
    insforge.database.from('companies').select('employee_limit, license_user_limit').eq('id', companyId).maybeSingle(),
    countBillableActiveMembers(insforge, companyId),
    insforge.database.from('company_memberships').select('*').eq('company_id', companyId).eq('user_id', userId).maybeSingle()
  ]);

  if (companyRes.error || !companyRes.data) {
    const err = new Error('Organization not found');
    (err as any).status = 404;
    throw err;
  }

  const seatLimit = await getEffectiveSeatLimit(insforge, companyId, companyRes.data);
  if (seatLimit > 0 && !existingMembershipRes.data && activeBillableMembers >= seatLimit) {
    const err = new Error('No seats available, contact admin');
    (err as any).status = 409;
    (err as any).code = 'SEATS_FULL';
    throw err;
  }

  const membershipPatch: Record<string, any> = {
    role: normalizeRole(invite.role),
    status: 'ACTIVE',
    department_id: invite.department_id ?? null,
    site_id: invite.site_id ?? null,
    invited_by_user_id: invite.created_by_user_id ?? null,
    consultant_scope: invite.consultant_scope ?? null
  };

  if (existingMembershipRes.data) {
    const updateMembership = await insforge.database
      .from('company_memberships')
      .update(membershipPatch)
      .eq('id', (existingMembershipRes.data as any).id)
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .select('*')
      .single();
    if (updateMembership.error || !updateMembership.data) {
      throw new Error('Failed to update membership');
    }
  } else {
    const insertMembership = await insforge.database
      .from('company_memberships')
      .insert({
        company_id: companyId,
        user_id: userId,
        ...membershipPatch
      })
      .select('*')
      .single();
    if (insertMembership.error || !insertMembership.data) {
      throw new Error('Failed to create membership');
    }
  }

  const acceptedAt = nowIso();
  const inviteUpdate = await insforge.database
    .from('company_invites')
    .update({
      status: 'ACCEPTED',
      accepted_at: acceptedAt,
      accepted_user_id: userId,
      error_message: null
    })
    .eq('id', invite.id)
    .select('id, company_id, role')
    .single();

  if (inviteUpdate.error || !inviteUpdate.data) {
    throw new Error('Failed to finalize invite acceptance');
  }

  try {
    await insforge.database.from('activity_logs').insert({
      company_id: companyId,
      actor_user_id: userId,
      action: 'company_invites.accept',
      entity_type: 'company_invite',
      entity_id: invite.id,
      metadata: { email: userEmail }
    });
  } catch {
    // no-op
  }

  return {
    orgId: (inviteUpdate.data as any).company_id,
    role: normalizeRole((inviteUpdate.data as any).role)
  };
}

async function findNewestValidPendingInviteForEmail(insforge: any, userEmail: string): Promise<any | null> {
  const normalizedEmail = normalizeEmail(userEmail);
  if (!normalizedEmail) return null;

  const query = insforge.database
    .from('company_invites')
    .select('*');
  const emailQuery = typeof query.ilike === 'function'
    ? query.ilike('email', normalizedEmail)
    : query.eq('email', normalizedEmail);
  const invitesRes = await emailQuery
    .order('created_at', { ascending: false })
    .limit(20);

  if (invitesRes.error) {
    const err = new Error('Could not find pending invites.');
    (err as any).reason = 'backend_unavailable';
    throw err;
  }

  const now = new Date();
  return (invitesRes.data || []).find((row: any) => {
    if (normalizeEmail(row.email) !== normalizedEmail) return false;
    if (!PENDING_INVITE_STATUSES.includes(normalizeInviteStatus(row.status))) return false;
    const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
    return !expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt > now;
  }) ?? null;
}

async function acceptNewestPendingInviteForEmail(input: {
  insforge: any;
  userId: string;
  userEmail: string;
}): Promise<PendingInviteAcceptResult> {
  try {
    const invite = await findNewestValidPendingInviteForEmail(input.insforge, input.userEmail);
    if (!invite) {
      return { ok: false, reason: 'no_pending_invite', error: 'No pending invite found.' };
    }

    const result = await acceptResolvedInvite({
      insforge: input.insforge,
      invite,
      userId: input.userId,
      userEmail: input.userEmail
    });
    return { ok: true, ...result, inviteId: String(invite.id || '') };
  } catch (err: any) {
    if (err?.reason === 'backend_unavailable') {
      return { ok: false, reason: 'backend_unavailable', error: String(err?.message || 'Could not find pending invites.') };
    }
    throw err;
  }
}

export async function acceptPendingInviteHandler(req: any, res: any) {
  applyNoStoreHeaders(res);
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const authToken = readBearerToken(req);
  if (!authToken) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  let logUserId: string | null = null;
  let logOrgId: string | null = null;

  try {
    const authInsforge = getServerInsforge(authToken);
    const actor = await resolveServerUser(authInsforge, authToken);
    const userId = actor.userId;
    const userEmail = String(actor.email || '').trim().toLowerCase();
    if (!userId || !userEmail) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    logUserId = String(userId);
    const insforge = getInviteServiceClient();
    const result = await acceptNewestPendingInviteForEmail({ insforge, userId, userEmail });
    if (!result.ok) {
      logStructuredLine({
        module: 'api.invites.accept-pending',
        level: result.reason === 'backend_unavailable' ? 'error' : 'info',
        message: result.reason === 'no_pending_invite' ? 'no_pending_invite_for_email' : result.error,
        user_id: logUserId,
        organization_id: null
      });
      const status = result.reason === 'backend_unavailable' ? 500 : 200;
      return res.status(status).json({ ok: false, reason: result.reason, error: result.error });
    }

    logOrgId = result.orgId;
    return res.status(200).json({ ok: true, orgId: result.orgId, role: result.role });
  } catch (err: any) {
    const msg = String(err?.message || err);
    logStructuredLine({
      module: 'api.invites.accept-pending',
      level: 'error',
      message: msg,
      user_id: logUserId,
      organization_id: logOrgId
    });
    sendAlertWebhook({
      kind: 'invite_api',
      module: 'api.invites.accept-pending',
      message: msg,
      user_id: logUserId,
      organization_id: logOrgId
    });
    return res.status(Number(err?.status || 500)).json({
      ok: false,
      reason: err?.reason,
      code: err?.code,
      error: msg
    });
  }
}

export default async function handler(req: any, res: any) {
  applyNoStoreHeaders(res);
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const authToken = readBearerToken(req);
  if (!authToken) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const token = String(req.body?.token ?? '').trim();
  if (!token) return res.status(400).json({ ok: false, error: 'token is required' });

  let logUserId: string | null = null;
  let logOrgId: string | null = null;

  try {
    const authInsforge = getServerInsforge(authToken);
    const actor = await resolveServerUser(authInsforge, authToken);
    const userId = actor.userId;
    const userEmail = String(actor.email || '').trim().toLowerCase();
    if (!userId || !userEmail) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    logUserId = String(userId);
    const insforge = getInviteServiceClient();

    const inviteResult = await resolveInviteToken(insforge, token);
    if (inviteResult.ok === false) {
      if (EXPECTED_TOKEN_MISS_REASONS.has(inviteResult.reason)) {
        const fallback = await acceptNewestPendingInviteForEmail({ insforge, userId, userEmail });
        if (fallback.ok) {
          logStructuredLine({
            module: MODULE,
            level: 'info',
            message: 'token_not_found_email_fallback_accepted',
            user_id: logUserId,
            organization_id: fallback.orgId
          });
          return res.status(200).json({ ok: true, orgId: fallback.orgId, role: fallback.role });
        }

        logStructuredLine({
          module: MODULE,
          level: fallback.reason === 'backend_unavailable' ? 'error' : 'info',
          message: fallback.reason === 'no_pending_invite' ? 'token_not_found_no_pending_invite_for_email' : fallback.error,
          user_id: logUserId,
          organization_id: null
        });
        const status = fallback.reason === 'backend_unavailable' ? 500 : 200;
        return res.status(status).json({
          ok: false,
          reason: fallback.reason === 'no_pending_invite' ? inviteResult.reason : fallback.reason,
          error: fallback.reason === 'no_pending_invite' ? inviteResult.error : fallback.error
        });
      }

      return res.status(inviteResult.status).json({
        ok: false,
        reason: inviteResult.reason,
        error: inviteResult.error
      });
    }

    const invite = inviteResult.invite as any;
    logOrgId = String(invite.company_id || '') || null;
    const result = await acceptResolvedInvite({ insforge, invite, userId, userEmail });
    return res.status(200).json({ ok: true, ...result });
  } catch (err: any) {
    const msg = String(err?.message || err);
    logStructuredLine({
      module: MODULE,
      level: 'error',
      message: msg,
      user_id: logUserId,
      organization_id: logOrgId
    });
    sendAlertWebhook({
      kind: 'invite_api',
      module: MODULE,
      message: msg,
      user_id: logUserId,
      organization_id: logOrgId
    });
    return res.status(Number(err?.status || 500)).json({
      ok: false,
      reason: err?.reason,
      code: err?.code,
      error: msg
    });
  }
}
