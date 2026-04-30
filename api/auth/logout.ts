import { applyNoStoreHeaders } from '../_response.js';
import { logStructuredLine } from '../_observability.js';
import {
  buildForwardHeaders,
  buildUpstreamUrl,
  getProxyBody,
  startProxy,
  writeUpstreamResponse
} from '../_insforge-proxy/_shared.js';

const MODULE = 'api.auth.logout';
const UPSTREAM_TIMEOUT_MS = 15_000;
const IDEMPOTENT_LOGOUT_STATUSES = new Set([401, 403, 404, 405]);

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

  const method = String(req?.method ?? 'POST').toUpperCase();

  if (method !== 'POST') {
    applyNoStoreHeaders(res);
    res.setHeader('Allow', 'POST');
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
    const upstreamUrl = buildUpstreamUrl(started.upstreamOrigin, '/api/auth/logout', req);
    const upstreamRes = await fetchWithTimeout(upstreamUrl, {
      method: 'POST',
      headers,
      body: getProxyBody(req)
    });

    if (IDEMPOTENT_LOGOUT_STATUSES.has(upstreamRes.status)) {
      logStructuredLine({
        module: MODULE,
        level: 'warn',
        message: 'Treating unsupported or unauthenticated logout as local success',
        extra: { requestId: started.requestId, method, upstreamStatus: upstreamRes.status }
      });
      applyNoStoreHeaders(res);
      res.status(200).json({
        ok: true,
        message: 'Logged out'
      });
      return;
    }

    if (upstreamRes.status === 405) {
      logStructuredLine({
        module: MODULE,
        level: 'warn',
        message: 'Passing through upstream logout 405 response',
        extra: { requestId: started.requestId, method, upstreamStatus: upstreamRes.status }
      });
    }

    await writeUpstreamResponse(res, upstreamRes, method);
  } catch (err: any) {
    const msg = String(err?.name === 'AbortError' ? 'Upstream request timed out' : err?.message ?? err);
    logStructuredLine({
      module: MODULE,
      level: 'error',
      message: 'Auth logout request failed',
      extra: { requestId: started.requestId, method, error: msg }
    });
    res.status(503).json({
      ok: false,
      error: 'Login service is temporarily unavailable.',
      requestId: started.requestId
    });
  }
}
