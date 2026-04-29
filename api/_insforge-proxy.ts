import { logStructuredLine } from './_observability.js';
import { applyNoStoreHeaders } from './_response.js';
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
    const proxyBody = getProxyBody(req);

    const upstreamRes = await fetch(upstreamUrl, {
      method,
      headers,
      body: proxyBody,
      signal: controller.signal
    });

    const tryLegacyAuthFallback = async (): Promise<boolean> => {
      const isMethodMismatch = upstreamRes.status === 405 || upstreamRes.status === 404;
      if (!isMethodMismatch) return false;

      if (method === 'POST' && joined === 'auth/sessions') {
        const legacyUrl = buildUpstreamUrl(started.upstreamOrigin, '/api/auth/login', req);
        const legacyRes = await fetch(legacyUrl, {
          method: 'POST',
          headers,
          body: proxyBody,
          signal: controller.signal
        });
        await writeUpstreamResponse(res, legacyRes, method);
        return true;
      }

      if (method === 'GET' && joined === 'auth/sessions/current') {
        const legacyUrl = buildUpstreamUrl(started.upstreamOrigin, '/api/auth/me', req);
        const legacyRes = await fetch(legacyUrl, {
          method: 'GET',
          headers,
          signal: controller.signal
        });

        if (legacyRes.ok) {
          const contentType = legacyRes.headers.get('content-type') ?? '';
          if (contentType.includes('application/json')) {
            const payload = await legacyRes.json();
            const normalized =
              payload && typeof payload === 'object' && 'user' in payload ? payload : { user: payload };
            applyNoStoreHeaders(res);
            res.status(legacyRes.status).json(normalized);
            return true;
          }
        }

        await writeUpstreamResponse(res, legacyRes, method);
        return true;
      }

      if (method === 'POST' && joined === 'auth/logout') {
        const legacyUrl = buildUpstreamUrl(started.upstreamOrigin, '/api/auth/logout', req);
        const legacyRes = await fetch(legacyUrl, {
          method: 'POST',
          headers,
          body: proxyBody,
          signal: controller.signal
        });
        await writeUpstreamResponse(res, legacyRes, method);
        return true;
      }

      return false;
    };

    if (await tryLegacyAuthFallback()) {
      return;
    }

    // Some InsForge tenants/backends may not support the hosted cookie refresh endpoint.
    // The JS SDK treats a 404 here as “fallback to storage mode”, but treats 405 as fatal.
    if (method === 'POST' && joined === 'auth/refresh' && [401, 403, 405].includes(upstreamRes.status)) {
      logStructuredLine({
        module: MODULE,
        level: 'warn',
        message: 'Upstream auth refresh unavailable; mapping to 404 for SDK fallback',
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
