import { logStructuredLine } from './_observability.js';
import { applyNoStoreHeaders } from './_response.js';
import {
  matchLegacyAuthRoute,
  normalizeLegacyAuthPayload,
  shouldMapRefreshToNotFound
} from './_insforge-proxy/auth-compat.js';
import {
  buildForwardHeaders,
  buildUpstreamUrl,
  getProxyBody,
  readRawProxyBody,
  startProxy,
  writeUpstreamResponse
} from './_insforge-proxy/_shared.js';

const MODULE = 'api.insforge-proxy.api';
const UPSTREAM_TIMEOUT_MS = 15_000;
const AUTH_UPSTREAM_TIMEOUT_MS = 30_000;
const AUTH_RETRY_PATHS = new Set(['auth/sessions', 'auth/sessions/current', 'auth/refresh']);

function isAuthPath(path: string): boolean {
  return AUTH_RETRY_PATHS.has(path);
}

function getUpstreamTimeoutMs(path: string): number {
  return isAuthPath(path) ? AUTH_UPSTREAM_TIMEOUT_MS : UPSTREAM_TIMEOUT_MS;
}

async function fetchUpstream(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

async function fetchUpstreamWithRetry(
  url: string,
  init: RequestInit,
  options: { timeoutMs: number; retryOn5xx: boolean }
): Promise<Response> {
  let response = await fetchUpstream(url, init, options.timeoutMs);
  if (options.retryOn5xx && response.status >= 500) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    response = await fetchUpstream(url, init, options.timeoutMs);
  }
  return response;
}

export const config = {
  api: {
    bodyParser: false
  }
};

function normalizeRawPathValue(rawValue: string): string {
  const value = rawValue.trim();
  const routeValue = value.includes('/')
    ? value
    : (() => {
        try {
          return decodeURIComponent(value);
        } catch {
          return value;
        }
      })();

  return routeValue
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean)
    .join('/');
}

function getRawPathFromUrl(req: any): string | null {
  const url: string = typeof req?.url === 'string' ? req.url : '';
  const idx = url.indexOf('?');
  if (idx < 0) return null;

  const query = url.slice(idx + 1);
  for (const part of query.split('&')) {
    if (!part) continue;
    const eqIdx = part.indexOf('=');
    const rawKey = eqIdx >= 0 ? part.slice(0, eqIdx) : part;
    if (rawKey !== 'path') continue;
    const rawValue = eqIdx >= 0 ? part.slice(eqIdx + 1) : '';
    return normalizeRawPathValue(rawValue);
  }

  return null;
}

function parsePath(req: any): string {
  const rawFromUrl = getRawPathFromUrl(req);
  if (rawFromUrl) return rawFromUrl;

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
  const upstreamTimeoutMs = getUpstreamTimeoutMs(joined);
  const retryAuthUpstream = isAuthPath(joined);

  try {
    const headers = buildForwardHeaders(req, {
      'x-safecloud-request-id': started.requestId
    });
    const proxyBody = getProxyBody(req) ?? await readRawProxyBody(req);

    const upstreamRes = await fetchUpstreamWithRetry(
      upstreamUrl,
      {
        method,
        headers,
        body: proxyBody as BodyInit | undefined
      },
      { timeoutMs: upstreamTimeoutMs, retryOn5xx: retryAuthUpstream }
    );

    const legacyRoute = matchLegacyAuthRoute({
      method,
      path: joined,
      upstreamStatus: upstreamRes.status
    });

    if (legacyRoute) {
      logStructuredLine({
        module: MODULE,
        level: 'warn',
        message: 'Falling back to legacy auth endpoint',
        extra: {
          requestId: started.requestId,
          method,
          path: joined,
          upstreamStatus: upstreamRes.status,
          legacyMethod: legacyRoute.legacyMethod,
          legacyPath: legacyRoute.legacyPath
        }
      });

      const legacyUrl = buildUpstreamUrl(started.upstreamOrigin, legacyRoute.legacyPath, req);
      const legacyRes = await fetchUpstreamWithRetry(
        legacyUrl,
        {
          method: legacyRoute.legacyMethod,
          headers,
          body: legacyRoute.legacyMethod === 'GET' ? undefined : proxyBody as BodyInit | undefined
        },
        { timeoutMs: upstreamTimeoutMs, retryOn5xx: retryAuthUpstream }
      );

      if (legacyRoute.responseTransform === 'normalize-user-payload' && legacyRes.ok) {
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

    // Some InsForge tenants/backends may not support the hosted cookie refresh endpoint.
    // The JS SDK treats a 404 here as "fallback to storage mode", but treats 405 as fatal.
    if (shouldMapRefreshToNotFound({ method, path: joined, upstreamStatus: upstreamRes.status })) {
      logStructuredLine({
        module: MODULE,
        level: 'warn',
        message: 'Upstream auth refresh unavailable; mapping to 404 for SDK fallback',
        extra: { requestId: started.requestId, method, path: joined, upstreamStatus: upstreamRes.status }
      });
      res.status(404).json({
        error: 'not_found',
        message: 'Refresh not supported'
      });
      return;
    }

    if (method === 'HEAD' && upstreamRes.status === 405) {
      const getRes = await fetchUpstreamWithRetry(
        upstreamUrl,
        {
          method: 'GET',
          headers
        },
        { timeoutMs: upstreamTimeoutMs, retryOn5xx: retryAuthUpstream }
      );
      await writeUpstreamResponse(res, getRes, 'HEAD');
      return;
    }

    if (upstreamRes.status === 405) {
      logStructuredLine({
        module: MODULE,
        level: 'warn',
        message: 'Passing through upstream 405 response',
        extra: { requestId: started.requestId, method, path: joined, upstreamStatus: upstreamRes.status }
      });
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
  }
}
