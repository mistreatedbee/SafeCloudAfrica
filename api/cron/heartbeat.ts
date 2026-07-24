import { readBearerToken } from '../_insforge.js';
import { logStructuredLine, recordOperationalEvent, sendAlertWebhook } from '../_observability.js';
import { applyNoStoreHeaders } from '../_response.js';

async function pingPaaqBackend() {
  const token = process.env.VITE_PAAQ_SDK_TOKEN ?? 'sdk_live_aa2vjr8nhh14hfqeax0ywx4euz7vg3b2';
  const projectKey = process.env.VITE_PAAQ_PROJECT_KEY ?? 'proj_6u2h0ixg';
  const env = process.env.NODE_ENV === 'production' ? 'production' : 'development';
  const base = 'https://mookyonwpovxscsbqwwl.supabase.co/functions/v1/sdk-init';

  const layers = [
    { platform: 'react',    deviceId: 'vercel-frontend-safecloudafrica' },
    { platform: 'nodejs',   deviceId: 'vercel-server-safecloudafrica' },
    { platform: 'postgres', deviceId: 'vercel-db-safecloudafrica' },
  ];

  await Promise.allSettled(layers.map(({ platform, deviceId }) =>
    fetch(base, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Project-ID': projectKey,
        'X-SDK-Version': '1.0.0',
        'X-Platform': platform,
        'X-Environment': env,
      },
      body: JSON.stringify({ deviceId }),
    })
  ));
}

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
  applyNoStoreHeaders(res);
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
    void pingPaaqBackend();
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
