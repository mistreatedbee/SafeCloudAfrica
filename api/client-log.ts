import { resolveRequestActor } from './_insforge';
import { logStructuredLine, recordOperationalEvent } from './_observability';

const MODULE = 'api.client-log';
const MAX_BODY_CHARS = 24_000;

type ClientLogBody = {
  module?: string;
  message?: string;
  stack?: string;
  organization_id?: string;
  componentStack?: string;
  url?: string;
  userAgent?: string;
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const raw = (req.body ?? {}) as ClientLogBody;
  try {
    if (JSON.stringify(raw).length > MAX_BODY_CHARS) {
      return res.status(413).json({ ok: false, error: 'Payload too large' });
    }
  } catch {
    return res.status(400).json({ ok: false, error: 'Invalid payload' });
  }

  const clientModule = String(raw.module ?? 'client').trim() || 'client';
  const message = String(raw.message ?? '').trim() || 'Client error';
  const orgHint = raw.organization_id != null && String(raw.organization_id).trim() ? String(raw.organization_id).trim() : null;

  const actor = await resolveRequestActor(req, orgHint ? { organizationId: orgHint } : {});
  const organization_id = actor.organizationId ?? orgHint;

  logStructuredLine({
    module: MODULE,
    level: 'error',
    message,
    user_id: actor.userId,
    organization_id,
    extra: {
      clientModule,
      stack: raw.stack ? String(raw.stack).slice(0, 8000) : undefined,
      componentStack: raw.componentStack ? String(raw.componentStack).slice(0, 4000) : undefined,
      url: raw.url ? String(raw.url).slice(0, 2000) : undefined,
      userAgent: raw.userAgent ? String(raw.userAgent).slice(0, 500) : undefined
    }
  });

  recordOperationalEvent({
    event_type: 'client.error',
    status: 'failure',
    module: clientModule,
    message,
    user_id: actor.userId,
    organization_id,
    details: {
      url: raw.url ?? null,
      stack: raw.stack ? String(raw.stack).slice(0, 4000) : null
    }
  });

  return res.status(200).json({ ok: true });
}
