import { addDaysIso, getServerInsforge, nowIso, readBearerToken } from '../_insforge';
import { buildInviteLink, generateRawInviteToken, hashInviteToken, normalizeInviteStatus, toInviteEmailHtml } from './_shared';

function normalizeRole(role: unknown): string {
  return String(role ?? '').trim().toLowerCase();
}

function getOrigin(req: any): string {
  const proto = req.headers?.['x-forwarded-proto'] || 'https';
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host || 'safe-cloud-africa.vercel.app';
  return `${proto}://${host}`;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const authToken = readBearerToken(req);
  if (!authToken) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const inviteId = String(req.body?.inviteId ?? '').trim();
  const sendEmail = req.body?.sendEmail !== false;
  if (!inviteId) return res.status(400).json({ ok: false, error: 'inviteId is required' });

  try {
    const insforge = getServerInsforge(authToken);
    const session = await insforge.auth.getCurrentSession();
    const userId = session.data?.session?.user?.id;
    const userEmail = session.data?.session?.user?.email || 'no-reply@safecloudafrica.com';
    if (!userId) return res.status(401).json({ ok: false, error: 'Unauthorized' });

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

    const rawToken = generateRawInviteToken();
    const tokenHash = hashInviteToken(rawToken);
    const expiresAt = addDaysIso(7);

    const patch: Record<string, any> = {
      token_hash: tokenHash,
      token: null,
      status: 'PENDING',
      expires_at: expiresAt,
      error_message: null
    };

    const inviteLink = buildInviteLink(rawToken, getOrigin(req));
    const profileRes = await insforge.database
      .from('user_profiles')
      .select('full_name, email')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .maybeSingle();

    const inviterName = (profileRes.data as any)?.full_name || userEmail;
    const inviterEmail = (profileRes.data as any)?.email || userEmail;

    let emailSent = false;
    if (sendEmail) {
      const emailContent = toInviteEmailHtml({
        orgName: invite.organization_name || invite.companies?.name || 'Organization',
        inviterName,
        inviterEmail,
        role: invite.role,
        inviteLink,
        expiresAtIso: expiresAt
      });

      try {
        const emailRes = await fetch(`${getOrigin(req)}/api/email/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: invite.email,
            subject: emailContent.subject,
            html: emailContent.html,
            text: emailContent.text,
            meta: { orgId: companyId, inviteId, role: invite.role }
          })
        });
        const emailBody = await emailRes.json().catch(() => null);
        if (!emailRes.ok || emailBody?.ok === false) {
          throw new Error(emailBody?.error || `${emailRes.status} ${emailRes.statusText}`);
        }

        emailSent = true;
        patch.status = 'SENT';
        patch.sent_at = nowIso();
        patch.last_sent_at = patch.sent_at;
        patch.send_count = Number(invite.send_count || 0) + 1;
      } catch (emailErr: any) {
        patch.status = 'FAILED';
        patch.error_message = String(emailErr?.message || emailErr);
      }
    }

    const updateRes = await insforge.database
      .from('company_invites')
      .update(patch)
      .eq('id', inviteId)
      .select('*')
      .single();

    if (updateRes.error || !updateRes.data) {
      console.error('INVITE_RESEND_ERROR', updateRes.error);
      return res.status(500).json({ ok: false, error: 'Failed to update invite' });
    }

    return res.status(200).json({ ok: true, emailSent, invite: updateRes.data, inviteLink });
  } catch (err: any) {
    console.error('INVITE_RESEND_ERROR', err);
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}
