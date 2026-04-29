import { applyNoStoreHeaders } from '../_response.js';
import { logStructuredLine } from '../_observability.js';
import {
  buildForwardHeaders,
  buildUpstreamUrl,
  getProxyBody,
  startProxy,
  writeUpstreamResponse
} from '../_insforge-proxy/_shared.js';

const MODULE = 'api.auth.refresh';
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
    const upstreamUrl = buildUpstreamUrl(started.upstreamOrigin, '/api/auth/refresh', req);
    const upstreamRes = await fetchWithTimeout(upstreamUrl, {
      method: 'POST',
      headers,
      body: getProxyBody(req)
    });

    // The InsForge SDK treats refresh 404 as "legacy storage mode available".
    // Convert unsupported hosted-cookie refresh responses into that expected fallback.
    if ([401, 403, 405].includes(upstreamRes.status)) {
      logStructuredLine({
        module: MODULE,
        level: 'warn',
        message: 'Upstream auth refresh unavailable; mapping to SDK fallback response',
        extra: { requestId: started.requestId, method, upstreamStatus: upstreamRes.status }
      });
      applyNoStoreHeaders(res);
      res.status(404).json({
        error: 'not_found',
        message: 'Refresh not supported'
      });
      return;
    }

    await writeUpstreamResponse(res, upstreamRes, method);
  } catch (err: any) {
    const msg = String(err?.name === 'AbortError' ? 'Upstream request timed out' : err?.message ?? err);
    logStructuredLine({
      module: MODULE,
      level: 'error',
      message: 'Auth refresh request failed',
      extra: { requestId: started.requestId, method, error: msg }
    });
    res.status(503).json({
      ok: false,
      error: 'Login service is temporarily unavailable.',
      requestId: started.requestId
    });
  }
}
