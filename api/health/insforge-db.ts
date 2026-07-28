import { applyNoStoreHeaders } from '../_response.js';
import { logStructuredLine, recordOperationalEvent } from '../_observability.js';
import { resolveInsforgeOrigin } from '../_insforge-origin.js';
import { trackPaaqEvent } from '../_paaq.js';

const MODULE = 'api.health.insforge-db';

function getUpstreamOrigin(): string {
  return resolveInsforgeOrigin({ allowViteEnv: false, allowLinkedProjectFallback: true });
}

function getAnonKey(): string {
  // Prefer server-side env; do not rely on VITE_ vars here.
  return (process.env.INSFORGE_ANON_KEY ?? '').trim();
}

export default async function handler(req: any, res: any) {
  applyNoStoreHeaders(res);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const upstream = getUpstreamOrigin();
  const anonKey = getAnonKey();
  if (!upstream) {
    logStructuredLine({
      module: MODULE,
      level: 'warn',
      message: 'Missing INSFORGE_BASE_URL and no linked InsForge project; cannot run DB health check'
    });
    return res.status(500).json({
      ok: false,
      error: 'Server configuration missing INSFORGE_BASE_URL'
    });
  }
  if (!anonKey) {
    logStructuredLine({
      module: MODULE,
      level: 'warn',
      message: 'Missing INSFORGE_ANON_KEY; cannot run DB health check'
    });
    return res.status(500).json({
      ok: false,
      error: 'Server configuration missing INSFORGE_ANON_KEY'
    });
  }

  const startedAt = Date.now();
  const url = `${upstream}/api/database/records/companies?select=id&limit=1`;

  try {
    const upstreamRes = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${anonKey}`,
        'Cache-Control': 'no-store'
      }
    });

    const elapsedMs = Date.now() - startedAt;
    const ok = upstreamRes.ok;
    const status = upstreamRes.status;

    if (!ok) {
      logStructuredLine({
        module: MODULE,
        level: status >= 500 ? 'error' : 'warn',
        message: 'InsForge DB health check failed',
        extra: { status, elapsedMs }
      });
      recordOperationalEvent({
        event_type: 'insforge.db.health',
        status: 'failure',
        module: MODULE,
        message: `Upstream responded ${status}`,
        details: { status, elapsedMs }
      });
      return res.status(503).json({
        ok: false,
        error: 'Service temporarily unavailable',
        status
      });
    }

    recordOperationalEvent({
      event_type: 'insforge.db.health',
      status: 'success',
      module: MODULE,
      message: 'Upstream OK',
      details: { elapsedMs }
    });
    // Report to PAAQ only on a real, successful round-trip to the database.
    trackPaaqEvent('database', 'db_health_check', { elapsedMs });
    return res.status(200).json({ ok: true, elapsedMs });
  } catch (err: any) {
    const elapsedMs = Date.now() - startedAt;
    logStructuredLine({
      module: MODULE,
      level: 'error',
      message: 'InsForge DB health check threw',
      extra: { elapsedMs, message: err?.message ? String(err.message) : String(err) }
    });
    recordOperationalEvent({
      event_type: 'insforge.db.health',
      status: 'failure',
      module: MODULE,
      message: 'Upstream request failed',
      details: { elapsedMs }
    });
    return res.status(503).json({ ok: false, error: 'Service temporarily unavailable' });
  }
}
