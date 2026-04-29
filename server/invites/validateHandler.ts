import { getServerInsforge, getServiceInsforge } from '../../api/_insforge.js';
import { logStructuredLine, sendAlertWebhook } from '../../api/_observability.js';
import { applyNoStoreHeaders } from '../../api/_response.js';
import { resolveInviteToken, toPublicInvitePayload } from './resolver.js';

const MODULE = 'api.invites.validate';

export async function validateInviteHandler(req: any, res: any, tokenValue?: string) {
  applyNoStoreHeaders(res);
  if (req.method !== 'GET') {
    return res.status(405).json({ valid: false, reason: 'method_not_allowed', error: 'Method not allowed' });
  }

  const token = String(tokenValue ?? req.query?.token ?? '').trim();

  try {
    const insforge = getServiceInsforge() ?? getServerInsforge();
    const result = await resolveInviteToken(insforge, token);
    if (!result.ok) {
      if (result.reason === 'backend_unavailable') {
        logStructuredLine({
          module: MODULE,
          level: 'error',
          message: result.error,
          organization_id: null
        });
        sendAlertWebhook({
          kind: 'invite_api',
          module: MODULE,
          message: 'Database error validating invite'
        });
      }
      return res.status(result.status).json({ valid: false, reason: result.reason, error: result.error });
    }

    return res.status(200).json({
      valid: true,
      invite: toPublicInvitePayload(result.invite)
    });
  } catch (err: any) {
    const msg = String(err?.message || err);
    logStructuredLine({ module: MODULE, level: 'error', message: msg, organization_id: null });
    sendAlertWebhook({ kind: 'invite_api', module: MODULE, message: msg });
    return res.status(500).json({ valid: false, reason: 'backend_unavailable', error: 'Could not validate invite.' });
  }
}
