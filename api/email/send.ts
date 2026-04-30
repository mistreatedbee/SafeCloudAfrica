import { resolveRequestActor } from '../_insforge.js';
import { applyNoStoreHeaders } from '../_response.js';
import { sendTransactionalEmail, type EmailRequest } from './_shared.js';

const MODULE = 'api.email.send';

export default async function handler(req: any, res: any) {
  applyNoStoreHeaders(res);
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const body = (req.body ?? {}) as EmailRequest;
  const actor = await resolveRequestActor(req, body as Record<string, unknown>);

  const result = await sendTransactionalEmail({
    actor: { userId: actor.userId, organizationId: actor.organizationId },
    body
  });

  if (result.ok === false) {
    return res.status(result.status).json({ ok: false, error: result.error, module: MODULE });
  }
  return res.status(200).json({ ok: true });
}
