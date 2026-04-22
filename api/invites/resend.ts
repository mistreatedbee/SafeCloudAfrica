import { addDaysIso, getServerInsforge, nowIso, readBearerToken } from '../_insforge.js';
import { logStructuredLine, sendAlertWebhook } from '../_observability.js';
import { applyNoStoreHeaders } from '../_response.js';
import { sendTransactionalEmail } from '../email/_shared.js';
import {
  buildInviteLink,
  generateRawInviteToken,
  getInviteSigningSecret,
  hashInviteToken,
  normalizeInviteStatus,
  resolvePublicOrigin,
  signInviteToken,
  toInviteEmailHtml
} from './_shared.js';

const MODULE = 'api.invites.resend';

function normalizeRole(role: unknown): string {
  return String(role ?? '').trim().toLowerCase();
}

export default async function handler(req: any, res: any) {
  applyNoStoreHeaders(res);
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const authToken = readBearerToken(req);
  if (!authToken) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const inviteId = String(req.body?.inviteId ?? '').trim();
  const sendEmail = req.body?.sendEmail !== false;
  if (!inviteId) return res.status(400).json({ ok: false, error: 'inviteId is required' });

  let logUserId: string | null = null;
  let logOrgId: string | null = null;

  try {
    const insforge = getServerInsforge(authToken);
    const session = await insforge.auth.getCurrentSession();
    const userId = session.data?.session?.user?.id;
    const userEmail = session.data?.session?.user?.email || 'no-reply@safecloudafrica.com';
    if (!userId) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    logUserId = String(userId);

    const inviteRes = await insforge.database
      .from('company_invites')
      .select('*, companies(id, name, primary_admin_user_id)')
      .eq('id', inviteId)
      .maybeSingle();

    if (inviteRes.error || !inviteRes.data) {
      return res.status(404).json({ ok: false, error: 'Invite not found' });
    }

    const invite = inviteRes.data as any;
    const companyId = String(invite.company_id);
    logOrgId = companyId;

    const status = normalizeInviteStatus(invite.status);
    if (status === 'ACCEPTED') return res.status(409).json({ ok: false, error: 'Invite already accepted' });
    if (status === 'CANCELLED') return res.status(409).json({ ok: false, error: 'Invite revoked. Create a new invite.' });

    const membershipRes = await insforge.database
      .from('company_memberships')
      .select('role, status')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .maybeSingle();

    const isOwner = String(invite.companies?.primary_admin_user_id || '') === String(userId);
    const isAdmin = normalizeRole(membershipRes.data?.role) === 'admin' && normalizeInviteStatus(membershipRes.data?.status || 'ACTIVE') === 'ACTIVE';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ ok: false, error: 'Only Owner/Admin can resend invites' });
    }

    const hasSignedTokens = !!getInviteSigningSecret();

    if (!sendEmail) {
      if (hasSignedTokens) {
        const currentExpiresAt = String(invite.expires_at || '').trim();
        const expiresAtIso = currentExpiresAt || addDaysIso(7);
        if (!currentExpiresAt) {
          await insforge.database
            .from('company_invites')
            .update({ expires_at: expiresAtIso })
            .eq('id', inviteId);
          invite.expires_at = expiresAtIso;
        }
        const token = signInviteToken({
          inviteId: String(invite.id),
          companyId,
          email: String(invite.email || ''),
          role: String(invite.role || ''),
          expiresAtIso
        });
        const inviteLink = buildInviteLink(token, resolvePublicOrigin(req));
        return res.status(200).json({ ok: true, emailSent: false, invite, inviteLink });
      }

      const rawToken = generateRawInviteToken();
      const tokenHash = hashInviteToken(rawToken);
      const updateRes = await insforge.database
        .from('company_invites')
        .update({ token_hash: tokenHash, token: null })
        .eq('id', inviteId)
        .select('*')
        .single();
      if (updateRes.error || !updateRes.data) {
        return res.status(500).json({ ok: false, error: 'Failed to generate invite link' });
      }
      const inviteLink = buildInviteLink(rawToken, resolvePublicOrigin(req));
      return res.status(200).json({ ok: true, emailSent: false, invite: updateRes.data, inviteLink });
    }

    const expiresAt = addDaysIso(7);
    let inviteToken = '';
    let tokenHash = '';
    if (hasSignedTokens) {
      inviteToken = signInviteToken({
        inviteId: String(invite.id),
        companyId,
        email: String(invite.email || ''),
        role: String(invite.role || ''),
        expiresAtIso: expiresAt
      });
      tokenHash = hashInviteToken(inviteToken);
    } else {
      inviteToken = generateRawInviteToken();
      tokenHash = hashInviteToken(inviteToken);
    }

    const patch: Record<string, any> = {
      token_hash: tokenHash,
      token: null,
      status: 'PENDING',
      expires_at: expiresAt,
      accepted_at: null,
      accepted_user_id: null,
      error_message: null
    };

    const inviteLink = buildInviteLink(inviteToken, resolvePublicOrigin(req));
    const profileRes = await insforge.database
      .from('user_profiles')
      .select('full_name, email')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .maybeSingle();

    const inviterName = (profileRes.data as any)?.full_name || userEmail;
    const inviterEmail = (profileRes.data as any)?.email || userEmail;

    let emailSent = false;
    const emailContent = toInviteEmailHtml({
      orgName: invite.organization_name || invite.companies?.name || 'Organization',
      inviterName,
      inviterEmail,
      role: invite.role,
      inviteLink,
      expiresAtIso: expiresAt
    });

    try {
      const emailResult = await sendTransactionalEmail({
        actor: { userId: logUserId, organizationId: logOrgId },
        body: {
          to: invite.email,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
          meta: { orgId: companyId, inviteId, role: invite.role }
        }
      });
      if (!emailResult.ok) throw new Error(emailResult.error);

      emailSent = true;
      patch.status = 'SENT';
      patch.sent_at = nowIso();
      patch.last_sent_at = patch.sent_at;
      patch.send_count = Number(invite.send_count || 0) + 1;
    } catch (emailErr: any) {
      patch.status = 'FAILED';
      patch.error_message = String(emailErr?.message || emailErr);
    }

    const updateRes = await insforge.database
      .from('company_invites')
      .update(patch)
      .eq('id', inviteId)
      .select('*')
      .single();

    if (updateRes.error || !updateRes.data) {
      logStructuredLine({
        module: MODULE,
        level: 'error',
        message: String(updateRes.error?.message || updateRes.error || 'update failed'),
        user_id: logUserId,
        organization_id: logOrgId
      });
      return res.status(500).json({ ok: false, error: 'Failed to update invite' });
    }

    return res.status(200).json({ ok: true, emailSent, invite: updateRes.data, inviteLink });
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
