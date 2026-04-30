import { applyNoStoreHeaders } from '../../_response.js';
import { logStructuredLine } from '../../_observability.js';
import {
  buildForwardHeaders,
  buildUpstreamUrl,
  startProxy,
  writeUpstreamResponse
} from '../../_insforge-proxy/_shared.js';
import { normalizeLegacyAuthPayload } from '../../_insforge-proxy/auth-compat.js';

const MODULE = 'api.auth.sessions.current';
const UPSTREAM_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

export default async function handler(req: any, res: any) {
  const started = startProxy(req, res, MODULE);
  if (!started) return;

  const method = String(req?.method ?? 'GET').toUpperCase();

  if (method !== 'GET' && method !== 'HEAD') {
    applyNoStoreHeaders(res);
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).json({
      ok: false,
      error: 'Method not allowed'
    });
    return;
  }

  try {
    const headers = buildForwardHeaders(req, {
      'x-safecloud-request-id': started.requestId
    });
    const upstreamUrl = buildUpstreamUrl(started.upstreamOrigin, '/api/auth/sessions/current', req);
    const upstreamRes = await fetchWithTimeout(upstreamUrl, {
      method,
      headers
    });

    if (upstreamRes.status === 404 || upstreamRes.status === 405) {
      logStructuredLine({
        module: MODULE,
        level: 'warn',
        message: 'Falling back to legacy auth me endpoint',
        extra: { requestId: started.requestId, method, upstreamStatus: upstreamRes.status }
      });
      const legacyUrl = buildUpstreamUrl(started.upstreamOrigin, '/api/auth/me', req);
      const legacyRes = await fetchWithTimeout(legacyUrl, {
        method,
        headers
      });

      if (legacyRes.ok) {
        const contentType = legacyRes.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
          const payload = await legacyRes.json();
          applyNoStoreHeaders(res);
          res.status(legacyRes.status).json(normalizeLegacyAuthPayload(payload));
          return;
        }
      }

      await writeUpstreamResponse(res, legacyRes, method);
      return;
    }

    if (upstreamRes.status === 405) {
      logStructuredLine({
        module: MODULE,
        level: 'warn',
        message: 'Passing through upstream sessions/current 405 response',
        extra: { requestId: started.requestId, method, upstreamStatus: upstreamRes.status }
      });
    }

    await writeUpstreamResponse(res, upstreamRes, method);
  } catch (err: any) {
    const msg = String(err?.name === 'AbortError' ? 'Upstream request timed out' : err?.message ?? err);
    logStructuredLine({
      module: MODULE,
      level: 'error',
      message: 'Auth sessions/current request failed',
      extra: { requestId: started.requestId, method, error: msg }
    });
    res.status(503).json({
      ok: false,
      error: 'Login service is temporarily unavailable.',
      requestId: started.requestId
    });
  }
}
