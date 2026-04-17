import { logStructuredLine } from '../_observability.js';
import {
  buildForwardHeaders,
  buildUpstreamUrl,
  getProxyBody,
  startProxy,
  writeUpstreamResponse
} from '../_insforge-proxy/_shared.js';

const AUTH_PROXY_TIMEOUT_MS = 15_000;

export async function proxyAuthRequest(req: any, res: any, upstreamPath: string, moduleName: string): Promise<void> {
  const started = startProxy(req, res, moduleName);
  if (!started) return;

  const method = String(req?.method ?? 'GET').toUpperCase();
  const upstreamUrl = buildUpstreamUrl(started.upstreamOrigin, upstreamPath, req);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTH_PROXY_TIMEOUT_MS);

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

    if (method === 'POST' && upstreamPath === '/api/auth/refresh' && upstreamRes.status === 405) {
      logStructuredLine({
        module: moduleName,
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

    await writeUpstreamResponse(res, upstreamRes, method);
  } catch (err: any) {
    const message = String(err?.name === 'AbortError' ? 'Upstream request timed out' : err?.message ?? err);
    logStructuredLine({
      module: moduleName,
      level: 'error',
      message: 'Auth proxy request failed',
      extra: { requestId: started.requestId, method, error: message, upstreamPath }
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
