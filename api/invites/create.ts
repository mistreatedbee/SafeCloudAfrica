import { addDaysIso, getServerInsforge, nowIso, readBearerToken } from '../_insforge.js';
import { logStructuredLine, sendAlertWebhook } from '../_observability.js';
import { applyNoStoreHeaders } from '../_response.js';
import {
  buildInviteLink,
  generateRawInviteToken,
  hashInviteToken,
  resolvePublicOrigin,
  toInviteEmailHtml
} from './_shared.js';

const MODULE = 'api.invites.create';

function normalizeRole(role: unknown): string {
  return String(role ?? '').trim().toLowerCase();
}

function normalizeStatus(status: unknown): string {
  return String(status ?? '').trim().toUpperCase();
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
    const sessionResult = await insforge.auth.getCurrentSession();
    const userId = sessionResult.data?.session?.user?.id;
    const userEmail = sessionResult.data?.session?.user?.email || 'no-reply@safecloudafrica.com';
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

    const [membersCountRes, pendingCountRes, existingInvitesRes] = await Promise.all([
      insforge.database.from('company_memberships').select('id, status').eq('company_id', companyId),
      insforge.database.from('company_invites').select('id', { count: 'exact', head: true }).eq('company_id', companyId).in('status', ['PENDING', 'SENT', 'FAILED']),
      insforge.database.from('company_invites').select('id').eq('company_id', companyId).eq('email', email).in('status', ['PENDING', 'SENT', 'FAILED'])
    ]);

    const membersCount = (membersCountRes.data || []).filter((m: any) => normalizeStatus(m.status || 'ACTIVE') === 'ACTIVE').length;
    const pendingCount = pendingCountRes.count || 0;
    const seatLimit = Number((companyRes.data as any).license_user_limit || (companyRes.data as any).employee_limit || 0);
    if (seatLimit > 0 && membersCount + pendingCount >= seatLimit) {
      return res.status(409).json({ ok: false, error: 'No seats available, contact admin', code: 'SEATS_FULL' });
    }

    if (existingInvitesRes.data && existingInvitesRes.data.length > 0) {
      await insforge.database
        .from('company_invites')
        .update({ status: 'CANCELLED', error_message: 'Superseded by newer invitation.' })
        .in('id', existingInvitesRes.data.map((i: any) => i.id));
    }

    const rawToken = generateRawInviteToken();
    const tokenHash = hashInviteToken(rawToken);
    const expiresAt = addDaysIso(7);
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

    const inviteLink = buildInviteLink(rawToken, resolvePublicOrigin(req));
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
    try {
      const emailRes = await fetch(`${resolvePublicOrigin(req)}/api/email/send`, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          Pragma: 'no-cache',
          Expires: '0'
        },
        body: JSON.stringify({
          to: email,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
          meta: { orgId: companyId, inviteId: (insertRes.data as any).id, role }
        })
      });

      const emailBody = await emailRes.json().catch(() => null);
      if (!emailRes.ok || emailBody?.ok === false) {
        throw new Error(emailBody?.error || `${emailRes.status} ${emailRes.statusText}`);
      }

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
      await insforge.database
        .from('company_invites')
        .update({ status: 'FAILED', error_message: message })
        .eq('id', (insertRes.data as any).id);
    }

    return res.status(200).json({
      ok: true,
      emailSent,
      invite: {
        ...(insertRes.data as any),
        status: emailSent ? 'SENT' : 'FAILED'
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
