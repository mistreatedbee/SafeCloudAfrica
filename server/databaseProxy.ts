import { applyNoStoreHeaders } from '../api/_response.js';
import { logStructuredLine } from '../api/_observability.js';
import {
  buildForwardHeaders,
  buildUpstreamUrl,
  getProxyBody,
  startProxy,
  writeUpstreamResponse
} from '../api/_insforge-proxy/_shared.js';

const UPSTREAM_TIMEOUT_MS = 15_000;
const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

function normalizeSegment(value: unknown): string {
  if (Array.isArray(value)) return value.map((part) => String(part).trim()).filter(Boolean).join('/');
  return String(value ?? '').trim();
}

export function getRouteSegment(req: any, key: string): string {
  const value = req?.query?.[key];
  return normalizeSegment(value)
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/');
}

export async function forwardDatabaseRoute(req: any, res: any, moduleName: string, upstreamPath: string): Promise<void> {
  const started = startProxy(req, res, moduleName);
  if (!started) return;

  const method = String(req?.method ?? 'GET').toUpperCase();

  if (!ALLOWED_METHODS.has(method)) {
    applyNoStoreHeaders(res);
    res.setHeader('Allow', Array.from(ALLOWED_METHODS).join(', '));
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
    const upstreamUrl = buildUpstreamUrl(started.upstreamOrigin, upstreamPath, req);
    const upstreamRes = await fetchWithTimeout(upstreamUrl, {
      method,
      headers,
      body: getProxyBody(req)
    });

    if (upstreamRes.status === 405) {
      logStructuredLine({
        module: moduleName,
        level: 'warn',
        message: 'Passing through upstream database 405 response',
        extra: { requestId: started.requestId, method, upstreamPath, upstreamStatus: upstreamRes.status }
      });
    }

    await writeUpstreamResponse(res, upstreamRes, method);
  } catch (err: any) {
    const msg = String(err?.name === 'AbortError' ? 'Upstream request timed out' : err?.message ?? err);
    logStructuredLine({
      module: moduleName,
      level: 'error',
      message: 'Database proxy request failed',
      extra: { requestId: started.requestId, method, upstreamPath, error: msg }
    });
    res.status(503).json({
      ok: false,
      error: 'Database service is temporarily unavailable.',
      requestId: started.requestId
    });
  }
}
