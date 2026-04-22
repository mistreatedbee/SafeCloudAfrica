import { getServerInsforge, nowIso, readBearerToken, resolveServerUser } from '../_insforge.js';
import { logStructuredLine, sendAlertWebhook } from '../_observability.js';
import { applyNoStoreHeaders } from '../_response.js';
import {
  hashInviteToken,
  isSignedInviteToken,
  normalizeInviteStatus,
  parseSignedInviteToken,
  verifyInviteToken
} from './_shared.js';

const MODULE = 'api.invites.accept';

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

    let inviteRes: any;
    if (isSignedInviteToken(token)) {
      const parsed = parseSignedInviteToken(token);
      if (!parsed) return res.status(404).json({ ok: false, reason: 'not_found', error: 'Invalid invite link.' });
      inviteRes = await insforge.database.from('company_invites').select('*').eq('id', parsed.inviteId).maybeSingle();
      if (inviteRes.data && !verifyInviteToken(token, inviteRes.data)) {
        return res.status(404).json({ ok: false, reason: 'not_found', error: 'Invalid invite link.' });
      }
    } else {
      const tokenHash = hashInviteToken(token);
      inviteRes = await insforge.database
        .from('company_invites')
        .select('*')
        .or(`token_hash.eq.${tokenHash},token.eq.${token}`)
        .limit(1)
        .maybeSingle();
    }

    if (inviteRes.error || !inviteRes.data) {
      return res.status(404).json({ ok: false, reason: 'not_found', error: 'Invalid invite link.' });
    }

    const invite = inviteRes.data as any;
    logOrgId = String(invite.company_id || '') || null;
    const status = normalizeInviteStatus(invite.status);
    const expiresAt = invite.expires_at ? new Date(invite.expires_at) : null;
    const expired = !!expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt <= new Date();

    if (expired && (status === 'PENDING' || status === 'SENT' || status === 'FAILED')) {
      await insforge.database
        .from('company_invites')
        .update({ status: 'EXPIRED' })
        .eq('company_id', String(invite.company_id))
        .eq('id', invite.id);
      return res.status(410).json({ ok: false, reason: 'expired', error: 'Invite expired. Request a new invite.' });
    }

    if (status === 'ACCEPTED') return res.status(409).json({ ok: false, reason: 'accepted', error: 'Invite already used. Please log in.' });
    if (status === 'CANCELLED') return res.status(409).json({ ok: false, reason: 'revoked', error: 'Invite revoked. Request a new invite.' });
    if (!['PENDING', 'SENT', 'FAILED'].includes(status)) return res.status(409).json({ ok: false, reason: 'not_found', error: 'Invalid invite link.' });

    const inviteEmail = String(invite.email || '').trim().toLowerCase();
    if (!inviteEmail || inviteEmail !== userEmail) {
      return res.status(403).json({ ok: false, error: 'Invite email does not match authenticated account.' });
    }

    const companyId = String(invite.company_id);

    const [companyRes, activeBillableMembers, existingMembershipRes] = await Promise.all([
      insforge.database.from('companies').select('employee_limit, license_user_limit').eq('id', companyId).maybeSingle(),
      countBillableActiveMembers(insforge, companyId),
      insforge.database.from('company_memberships').select('*').eq('company_id', companyId).eq('user_id', userId).maybeSingle()
    ]);

    if (companyRes.error || !companyRes.data) {
      return res.status(404).json({ ok: false, error: 'Organization not found' });
    }

    const seatLimit = await getEffectiveSeatLimit(insforge, companyId, companyRes.data);
    if (seatLimit > 0 && !existingMembershipRes.data && activeBillableMembers >= seatLimit) {
      return res.status(409).json({ ok: false, error: 'No seats available, contact admin', code: 'SEATS_FULL' });
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
        return res.status(500).json({ ok: false, error: 'Failed to update membership' });
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
        return res.status(500).json({ ok: false, error: 'Failed to create membership' });
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
      return res.status(500).json({ ok: false, error: 'Failed to finalize invite acceptance' });
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

    return res.status(200).json({
      ok: true,
      orgId: (inviteUpdate.data as any).company_id,
      role: normalizeRole((inviteUpdate.data as any).role)
    });
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
