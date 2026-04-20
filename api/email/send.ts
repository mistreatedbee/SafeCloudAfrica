import { resolveRequestActor } from '../_insforge.js';
import { logStructuredLine, recordOperationalEvent, sendAlertWebhook } from '../_observability.js';
import { applyNoStoreHeaders } from '../_response.js';
import { sendTransactionalEmail, type EmailRequest } from './_shared.js';

const MODULE = 'api.email.send';

export default async function handler(req: any, res: any) {
  applyNoStoreHeaders(res);
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body = (req.body ?? {}) as EmailRequest;
    const actor = await resolveRequestActor(req, body as Record<string, unknown>);
    const result = await sendTransactionalEmail({
      actor: { userId: actor.userId, organizationId: actor.organizationId },
      body
    });

    if (!result.ok) {
      return res.status(result.status).json({ ok: false, error: result.error, module: MODULE });
    }
    return res.status(200).json({ ok: true });
  } catch (error: any) {
    const message = error?.message ? String(error.message) : 'Unhandled email route failure';
    logStructuredLine({
      module: MODULE,
      level: 'error',
      message
    });
    recordOperationalEvent({
      event_type: 'email.failed',
      status: 'failure',
      module: MODULE,
      message
    });
    sendAlertWebhook({
      kind: 'email_send',
      module: MODULE,
      message
    });
    return res.status(500).json({ ok: false, error: 'Internal Server Error', module: MODULE });
  }
}
