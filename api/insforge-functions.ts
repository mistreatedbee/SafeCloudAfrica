import { logStructuredLine } from './_observability.js';
import {
  buildForwardHeaders,
  buildUpstreamUrl,
  getProxyBody,
  startProxy,
  writeUpstreamResponse
} from './_insforge-proxy/_shared.js';

const MODULE = 'api.insforge-proxy.functions';
const UPSTREAM_TIMEOUT_MS = 20_000;

function parsePath(req: any): string {
  const raw = req?.query?.path;
  if (Array.isArray(raw)) return raw.map((part) => String(part)).filter(Boolean).join('/');
  return String(raw ?? '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/');
}

export default async function handler(req: any, res: any) {
  const started = startProxy(req, res, MODULE);
  if (!started) return;

  const method = String(req?.method ?? 'POST').toUpperCase();
  const joined = parsePath(req);
  const upstreamUrl = buildUpstreamUrl(started.upstreamOrigin, `/api/functions/invoke/${joined}`, req);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

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
    const message = String(err?.name === 'AbortError' ? 'Upstream request timed out' : err?.message ?? err);
    logStructuredLine({
      module: MODULE,
      level: 'error',
      message: 'Upstream request failed',
      extra: { requestId: started.requestId, method, error: message }
    });
    res.status(503).json({
      ok: false,
      error: 'Service temporarily unavailable. Please try again.',
      requestId: started.requestId
    });
  } finally {
    clearTimeout(timeout);
  }
}
