import { applyNoStoreHeaders } from '../_response.js';
import { logStructuredLine, recordOperationalEvent } from '../_observability.js';
import { resolveInsforgeOrigin } from '../_insforge-origin.js';

const MODULE = 'api.health.insforge-db';
const DB_HEALTH_TIMEOUT_MS = 8_000;

function getUpstreamOrigin(): string {
  return resolveInsforgeOrigin({ allowViteEnv: true, allowLinkedProjectFallback: true });
}

function getAnonKey(): string {
  return (process.env.INSFORGE_ANON_KEY ?? process.env.VITE_INSFORGE_ANON_KEY ?? '').trim();
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DB_HEALTH_TIMEOUT_MS);

  try {
    const upstreamRes = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${anonKey}`,
        'Cache-Control': 'no-store'
      },
      signal: controller.signal
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
      message: err?.name === 'AbortError' ? 'Upstream request timed out' : 'Upstream request failed',
      details: { elapsedMs }
    });
    return res.status(503).json({
      ok: false,
      error: err?.name === 'AbortError' ? 'Service temporarily unavailable (timeout)' : 'Service temporarily unavailable'
    });
  } finally {
    clearTimeout(timeout);
  }
}
