import { getServerInsforge, nowIso, readBearerToken, resolveServerUser } from '../../api/_insforge.js';
import { logStructuredLine, sendAlertWebhook } from '../../api/_observability.js';
import { applyNoStoreHeaders } from '../../api/_response.js';
import { normalizeInviteStatus } from '../../api/invites/_shared.js';
import { resolveInviteToken } from './resolver.js';

const MODULE = 'api.invites.accept';
const PENDING_INVITE_STATUSES = ['PENDING', 'SENT'];

function normalizeRole(role: unknown): string {
  return String(role ?? '').trim().toLowerCase();
}

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
    const insforge = getServerInsforge(authToken);
    const actor = await resolveServerUser(insforge, authToken);
    const userId = actor.userId;
    const userEmail = String(actor.email || '').trim().toLowerCase();
    if (!userId || !userEmail) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    logUserId = String(userId);

    const invitesRes = await insforge.database
      .from('company_invites')
      .select('*')
      .eq('email', userEmail)
      .in('status', PENDING_INVITE_STATUSES)
      .order('created_at', { ascending: false })
      .limit(10);

    if (invitesRes.error) {
      return res.status(500).json({ ok: false, reason: 'backend_unavailable', error: 'Could not find pending invites.' });
    }

    const now = new Date();
    const invite = (invitesRes.data || []).find((row: any) => {
      const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
      return !expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt > now;
    });
    if (!invite) {
      return res.status(404).json({ ok: false, reason: 'no_pending_invite', error: 'No pending invite found.' });
    }

    logOrgId = String((invite as any).company_id || '') || null;
    const result = await acceptResolvedInvite({ insforge, invite, userId, userEmail });
    return res.status(200).json({ ok: true, ...result });
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
    const insforge = getServerInsforge(authToken);
    const actor = await resolveServerUser(insforge, authToken);
    const userId = actor.userId;
    const userEmail = String(actor.email || '').trim().toLowerCase();
    if (!userId || !userEmail) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    logUserId = String(userId);

    const inviteResult = await resolveInviteToken(insforge, token);
    if (inviteResult.ok === false) {
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
    return res.status(500).json({ ok: false, error: msg });
  }
}
