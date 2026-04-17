import { logStructuredLine } from '../_observability.js';
import {
  buildForwardHeaders,
  buildUpstreamUrl,
  getProxyBody,
  startProxy,
  writeUpstreamResponse
} from './_shared.js';

const MODULE = 'api.insforge-proxy.api';
const UPSTREAM_TIMEOUT_MS = 15_000;

function normalizePathParts(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((v) => String(v)).filter(Boolean);
  if (raw == null) return [];
  const s = String(raw).trim();
  return s ? [s] : [];
}

export default async function handler(req: any, res: any) {
  const started = startProxy(req, res, MODULE);
  if (!started) return;

  const method = String(req?.method ?? 'GET').toUpperCase();
  const parts = normalizePathParts(req?.query?.path);
  const joined = parts.join('/');

  // Forward to InsForge REST API under `/api/*`.
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

    // If the upstream doesn't implement HEAD, fall back to GET and return headers only.
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
