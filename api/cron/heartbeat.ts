import { readBearerToken } from '../_insforge';
import { logStructuredLine, recordOperationalEvent, sendAlertWebhook } from '../_observability';

const MODULE = 'api.cron.heartbeat';

function authorizeCron(req: any): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = readBearerToken(req);
  if (bearer && bearer === secret) return true;
  const q = String(req.query?.secret ?? '');
  if (q && q === secret) return true;
  return false;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  if (!authorizeCron(req)) {
    logStructuredLine({ module: MODULE, level: 'warn', message: 'Unauthorized heartbeat request' });
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const postBody =
    req.method === 'POST' && req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const statusParam = String(
    req.query?.status ?? (postBody as { status?: string }).status ?? 'ok'
  ).toLowerCase();
  const isOk = statusParam === 'ok' || statusParam === 'success';
  const detailMsg =
    String(req.query?.message ?? (postBody as { message?: string }).message ?? '').slice(0, 2000) ||
    (isOk ? 'Heartbeat OK' : 'Heartbeat reported error');

  if (isOk) {
    logStructuredLine({ module: MODULE, level: 'info', message: detailMsg });
    recordOperationalEvent({
      event_type: 'cron.heartbeat',
      status: 'success',
      module: MODULE,
      message: detailMsg,
      details: { source: 'vercel_or_external' }
    });
    return res.status(200).json({ ok: true });
  }

  logStructuredLine({ module: MODULE, level: 'error', message: detailMsg });
  recordOperationalEvent({
    event_type: 'cron.heartbeat',
    status: 'failure',
    module: MODULE,
    message: detailMsg,
    details: { source: 'vercel_or_external' }
  });
  sendAlertWebhook({
    kind: 'cron_heartbeat',
    module: MODULE,
    message: detailMsg
  });
  return res.status(200).json({ ok: true, reported: 'failure' });
}
