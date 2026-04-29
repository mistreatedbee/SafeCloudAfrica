import { applyNoStoreHeaders } from '../_response.js';
import { logStructuredLine } from '../_observability.js';
import {
  buildForwardHeaders,
  buildUpstreamUrl,
  getProxyBody,
  startProxy,
  writeUpstreamResponse
} from '../_insforge-proxy/_shared.js';
import { normalizeLegacyAuthPayload } from '../_insforge-proxy/auth-compat.js';

const MODULE = 'api.auth.sessions';
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
  const headers = buildForwardHeaders(req, {
    'x-safecloud-request-id': started.requestId
  });

  try {
    if (method === 'POST') {
      const body = getProxyBody(req);
      const upstreamUrl = buildUpstreamUrl(started.upstreamOrigin, '/api/auth/sessions', req);
      const upstreamRes = await fetchWithTimeout(upstreamUrl, {
        method: 'POST',
        headers,
        body
      });

      if (upstreamRes.status === 404 || upstreamRes.status === 405) {
        logStructuredLine({
          module: MODULE,
          level: 'warn',
          message: 'Falling back to legacy auth login endpoint',
          extra: { requestId: started.requestId, method, upstreamStatus: upstreamRes.status }
        });
        const legacyUrl = buildUpstreamUrl(started.upstreamOrigin, '/api/auth/login', req);
        const legacyRes = await fetchWithTimeout(legacyUrl, {
          method: 'POST',
          headers,
          body
        });
        await writeUpstreamResponse(res, legacyRes, method);
        return;
      }

      await writeUpstreamResponse(res, upstreamRes, method);
      return;
    }

    if (method === 'GET') {
      const upstreamUrl = buildUpstreamUrl(started.upstreamOrigin, '/api/auth/sessions/current', req);
      const upstreamRes = await fetchWithTimeout(upstreamUrl, {
        method: 'GET',
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
          method: 'GET',
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

      await writeUpstreamResponse(res, upstreamRes, method);
      return;
    }

    applyNoStoreHeaders(res);
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({
      ok: false,
      error: 'Method not allowed'
    });
  } catch (err: any) {
    const msg = String(err?.name === 'AbortError' ? 'Upstream request timed out' : err?.message ?? err);
    logStructuredLine({
      module: MODULE,
      level: 'error',
      message: 'Auth sessions request failed',
      extra: { requestId: started.requestId, method, error: msg }
    });
    res.status(503).json({
      ok: false,
      error: 'Login service is temporarily unavailable.',
      requestId: started.requestId
    });
  }
}
