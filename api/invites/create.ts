import { addDaysIso, getServerInsforge, nowIso, readBearerToken, resolveServerUser } from '../_insforge.js';
import { logStructuredLine, sendAlertWebhook } from '../_observability.js';
import { applyNoStoreHeaders } from '../_response.js';
import { sendTransactionalEmail } from '../email/_shared.js';
import {
  buildInviteLink,
  generateRawInviteToken,
  getInviteSigningSecret,
  hashInviteToken,
  resolvePublicOrigin,
  signInviteToken,
  toInviteEmailHtml
} from './_shared.js';

const MODULE = 'api.invites.create';

function normalizeRole(role: unknown): string {
  return String(role ?? '').trim().toLowerCase();
}

function normalizeStatus(status: unknown): string {
  return String(status ?? '').trim().toUpperCase();
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
    const status = normalizeStatus(member.status || 'ACTIVE');
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
  if (!authToken) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const body = req.body ?? {};
  const companyId = String(body.companyId ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const role = normalizeRole(body.role);
  const departmentId = body.departmentId ? String(body.departmentId) : null;
  const siteId = body.siteId ? String(body.siteId) : null;
  const modulesScope = Array.isArray(body.modulesScope) ? body.modulesScope : [];

  if (!companyId || !email || !role) {
    return res.status(400).json({ ok: false, error: 'companyId, email and role are required' });
  }

  let logUserId: string | null = null;
  const logOrgId: string | null = companyId;

  try {
    const insforge = getServerInsforge(authToken);
    const actor = await resolveServerUser(insforge, authToken);
    const userId = actor.userId;
    const userEmail = actor.email || 'no-reply@safecloudafrica.com';
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    logUserId = String(userId);

    const [companyRes, membershipRes] = await Promise.all([
      insforge.database.from('companies').select('id, name, primary_admin_user_id, employee_limit, license_user_limit').eq('id', companyId).maybeSingle(),
      insforge.database.from('company_memberships').select('role, status').eq('company_id', companyId).eq('user_id', userId).maybeSingle()
    ]);

    if (companyRes.error || !companyRes.data) {
      return res.status(404).json({ ok: false, error: 'Organization not found' });
    }

    const isOwner = String((companyRes.data as any).primary_admin_user_id || '') === String(userId);
    const isAdmin = normalizeRole((membershipRes.data as any)?.role) === 'admin' && normalizeStatus((membershipRes.data as any)?.status || 'ACTIVE') === 'ACTIVE';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ ok: false, error: 'Only Owner/Admin can invite users' });
    }

    const [seatLimit, activeBillableMembers, existingInvitesRes] = await Promise.all([
      getEffectiveSeatLimit(insforge, companyId, companyRes.data),
      countBillableActiveMembers(insforge, companyId),
      insforge.database.from('company_invites').select('id').eq('company_id', companyId).eq('email', email).in('status', ['PENDING', 'SENT'])
    ]);

    if (seatLimit > 0 && activeBillableMembers >= seatLimit) {
      return res.status(409).json({ ok: false, error: 'No seats available, contact admin', code: 'SEATS_FULL' });
    }

    if (existingInvitesRes.data && existingInvitesRes.data.length > 0) {
      await insforge.database
        .from('company_invites')
        .update({ status: 'CANCELLED', error_message: 'Superseded by newer invitation.' })
        .in('id', existingInvitesRes.data.map((i: any) => i.id));
    }

    const expiresAt = addDaysIso(7);
    const hasSignedTokens = !!getInviteSigningSecret();
    let inviteToken = '';
    let tokenHash = '';
    if (!hasSignedTokens) {
      inviteToken = generateRawInviteToken();
      tokenHash = hashInviteToken(inviteToken);
    } else {
      tokenHash = hashInviteToken(generateRawInviteToken());
    }

    const consultantScope = role === 'consultant' || role === 'auditor'
      ? {
          allowedModules: Array.from(new Set(modulesScope.map((item: any) => String(item)))),
          allowedDepartments: departmentId ? [departmentId] : [],
          allowedSites: siteId ? [siteId] : []
        }
      : null;

    const insertPayload: Record<string, any> = {
      company_id: companyId,
      organization_name: (companyRes.data as any).name,
      email,
      role,
      created_by_user_id: userId,
      invited_by_user_id: userId,
      token_hash: tokenHash,
      token: null,
      status: 'PENDING',
      expires_at: expiresAt,
      sent_at: null,
      last_sent_at: null,
      send_count: 0,
      error_message: null,
      consultant_scope: consultantScope
    };
    if (departmentId) insertPayload.department_id = departmentId;
    if (siteId) insertPayload.site_id = siteId;

    const insertRes = await insforge.database.from('company_invites').insert(insertPayload).select('*').single();
    if (insertRes.error || !insertRes.data) {
      logStructuredLine({
        module: MODULE,
        level: 'error',
        message: String(insertRes.error?.message || insertRes.error || 'insert failed'),
        user_id: logUserId,
        organization_id: logOrgId
      });
      return res.status(500).json({ ok: false, error: 'Failed to create invite' });
    }

    if (hasSignedTokens) {
      try {
        inviteToken = signInviteToken({
          inviteId: String((insertRes.data as any).id),
          companyId,
          email,
          role,
          expiresAtIso: expiresAt
        });
        tokenHash = hashInviteToken(inviteToken);
        await insforge.database
          .from('company_invites')
          .update({ token_hash: tokenHash })
          .eq('id', (insertRes.data as any).id);
      } catch {
        inviteToken = generateRawInviteToken();
        tokenHash = hashInviteToken(inviteToken);
        await insforge.database
          .from('company_invites')
          .update({ token_hash: tokenHash })
          .eq('id', (insertRes.data as any).id);
      }
    }

    const inviteLink = buildInviteLink(inviteToken, resolvePublicOrigin(req));
    const profileRes = await insforge.database
      .from('user_profiles')
      .select('full_name, email')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .maybeSingle();

    const inviterName = (profileRes.data as any)?.full_name || userEmail;
    const inviterEmail = (profileRes.data as any)?.email || userEmail;

    const emailContent = toInviteEmailHtml({
      orgName: (companyRes.data as any).name || 'Organization',
      inviterName,
      inviterEmail,
      role,
      inviteLink,
      expiresAtIso: expiresAt
    });

    let emailSent = false;
    let emailError: string | null = null;
    try {
      const emailResult = await sendTransactionalEmail({
        actor: { userId: logUserId, organizationId: logOrgId },
        body: {
          to: email,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
          meta: { orgId: companyId, inviteId: (insertRes.data as any).id, role }
        }
      });
      if (!emailResult.ok) throw new Error(emailResult.error);

      emailSent = true;
      await insforge.database
        .from('company_invites')
        .update({
          status: 'SENT',
          sent_at: nowIso(),
          last_sent_at: nowIso(),
          send_count: 1,
          error_message: null
        })
        .eq('id', (insertRes.data as any).id);
    } catch (emailErr: any) {
      const message = String(emailErr?.message || emailErr);
      emailError = message;
      await insforge.database
        .from('company_invites')
        .update({ status: 'FAILED', error_message: message })
        .eq('id', (insertRes.data as any).id);
    }

    return res.status(200).json({
      ok: true,
      emailSent,
      emailError,
      invite: {
        ...(insertRes.data as any),
        status: emailSent ? 'SENT' : 'FAILED',
        error_message: emailSent ? null : emailError
      },
      inviteLink
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
