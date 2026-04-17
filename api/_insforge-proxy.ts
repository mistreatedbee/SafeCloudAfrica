import { logStructuredLine } from './_observability.js';
import {
  buildForwardHeaders,
  buildUpstreamUrl,
  getProxyBody,
  startProxy,
  writeUpstreamResponse
} from './_insforge-proxy/_shared.js';

const MODULE = 'api.insforge-proxy.api';
const UPSTREAM_TIMEOUT_MS = 15_000;

function parsePath(req: any): string {
  const raw = req?.query?.path;
  if (Array.isArray(raw)) return raw.map((p) => String(p)).filter(Boolean).join('/');
  return String(raw ?? '')
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean)
    .join('/');
}

export default async function handler(req: any, res: any) {
  const started = startProxy(req, res, MODULE);
  if (!started) return;

  const method = String(req?.method ?? 'GET').toUpperCase();
  const joined = parsePath(req);

  const upstreamUrl = buildUpstreamUrl(started.upstreamOrigin, `/api/${joined}`, req);

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const headers = buildForwardHeaders(req, {
      'x-safecloud-request-id': started.requestId
    });

    const upstreamRes = await fetch(upstreamUrl, {
      method,
      headers,
      body: getProxyBody(req),
      signal: controller.signal
    });

    // Some InsForge tenants/backends may not support the hosted cookie refresh endpoint.
    // The JS SDK treats a 404 here as “fallback to storage mode”, but treats 405 as fatal.
    if (method === 'POST' && joined === 'auth/refresh' && upstreamRes.status === 405) {
      logStructuredLine({
        module: MODULE,
        level: 'warn',
        message: 'Upstream does not allow auth refresh; mapping 405->404 for SDK fallback',
        extra: { requestId: started.requestId, upstreamStatus: upstreamRes.status }
      });
      res.status(404).json({
        error: 'not_found',
        message: 'Refresh not supported'
      });
      return;
    }

    if (method === 'HEAD' && upstreamRes.status === 405) {
      const getRes = await fetch(upstreamUrl, {
        method: 'GET',
        headers,
        signal: controller.signal
      });
      await writeUpstreamResponse(res, getRes, 'HEAD');
      return;
    }

    if (upstreamRes.status >= 500) {
      logStructuredLine({
        module: MODULE,
        level: 'error',
        message: 'Upstream returned 5xx',
        extra: { requestId: started.requestId, upstreamStatus: upstreamRes.status, method, path: joined }
      });
      res.status(502).json({
        ok: false,
        error: 'Service temporarily unavailable. Please try again.',
        requestId: started.requestId
      });
      return;
    }

    await writeUpstreamResponse(res, upstreamRes, method);
  } catch (err: any) {
    const msg = String(err?.name === 'AbortError' ? 'Upstream request timed out' : err?.message ?? err);
    logStructuredLine({
      module: MODULE,
      level: 'error',
      message: 'Upstream request failed',
      extra: { requestId: started.requestId, method, error: msg }
    });
    res.status(503).json({
      ok: false,
      error: 'Service temporarily unavailable. Please try again.',
      requestId: started.requestId
    });
  } finally {
    clearTimeout(t);
  }
}
