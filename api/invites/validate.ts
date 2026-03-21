import { getServerInsforge } from '../_insforge';
import { logStructuredLine, sendAlertWebhook } from '../_observability';
import { hashInviteToken, mapInvalidReason, normalizeInviteStatus } from './_shared';

const MODULE = 'api.invites.validate';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const token = String(req.query?.token ?? '').trim();
  if (!token) {
    return res.status(400).json({ ok: false, reason: 'not_found', error: 'Missing token' });
  }

  try {
    const insforge = getServerInsforge();
    const tokenHash = hashInviteToken(token);

    const { data, error } = await insforge.database
      .from('company_invites')
      .select('id, company_id, organization_name, email, role, status, expires_at, companies(name)')
      .or(`token_hash.eq.${tokenHash},token.eq.${token}`)
      .limit(1)
      .maybeSingle();

    if (error) {
      logStructuredLine({
        module: MODULE,
        level: 'error',
        message: String((error as { message?: string }).message || error),
        organization_id: null
      });
      sendAlertWebhook({
        kind: 'invite_api',
        module: MODULE,
        message: 'Database error validating invite'
      });
      return res.status(500).json({ ok: false, reason: 'not_found', error: 'Could not validate invite' });
    }

    if (!data) {
      return res.status(404).json({ ok: false, reason: 'not_found' });
    }

    const status = normalizeInviteStatus((data as any).status);
    const expiresAt = (data as any).expires_at ? new Date((data as any).expires_at) : null;
    const isExpired = !!expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt <= new Date();

    if (isExpired && status === 'PENDING') {
      await insforge.database
        .from('company_invites')
        .update({ status: 'EXPIRED' })
        .eq('company_id', String((data as any).company_id))
        .eq('id', (data as any).id);
      return res.status(410).json({ ok: false, reason: 'expired' });
    }

    if (status !== 'PENDING' && status !== 'SENT' && status !== 'FAILED') {
      return res.status(409).json({ ok: false, reason: mapInvalidReason(status) });
    }

    return res.status(200).json({
      ok: true,
      invite: {
        id: (data as any).id,
        orgId: (data as any).company_id,
        email: (data as any).email,
        role: (data as any).role,
        orgName: (data as any).organization_name || (data as any).companies?.name || 'Organization',
        status,
        expiresAt: (data as any).expires_at
      }
    });
  } catch (err: any) {
    const msg = String(err?.message || err);
    logStructuredLine({ module: MODULE, level: 'error', message: msg, organization_id: null });
    sendAlertWebhook({ kind: 'invite_api', module: MODULE, message: msg });
    return res.status(500).json({ ok: false, reason: 'not_found', error: msg });
  }
}
