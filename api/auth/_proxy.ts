import { logStructuredLine } from '../_observability.js';
import {
  buildForwardHeaders,
  buildUpstreamUrl,
  getProxyBody,
  startProxy,
  writeUpstreamResponse
} from '../_insforge-proxy/_shared.js';

const AUTH_PROXY_TIMEOUT_MS = 15_000;
const REFRESH_SESSION_MESSAGE = 'Invalid or expired session';
const REFRESH_TEMPORARY_FAILURE_MESSAGE = 'Unable to refresh session right now. Please try again.';

function getAuthStatusCode(error: unknown): number {
  const raw = Number((error as any)?.statusCode ?? (error as any)?.status ?? 0);
  return Number.isFinite(raw) ? raw : 0;
}

async function readResponseSnippet(response: Response): Promise<string | null> {
  try {
    const text = await response.text();
    const trimmed = text.trim();
    return trimmed ? trimmed.slice(0, 300) : null;
  } catch {
    return null;
  }
}

function sendRefreshUnauthorized(res: any, requestId: string, code: string, statusCode = 401): void {
  res.status(statusCode).json({
    ok: false,
    error: REFRESH_SESSION_MESSAGE,
    code,
    data: {},
    requestId
  });
}

function sendRefreshTemporaryFailure(res: any, requestId: string, code: string, statusCode = 503): void {
  res.status(statusCode).json({
    ok: false,
    error: REFRESH_TEMPORARY_FAILURE_MESSAGE,
    code,
    data: {},
    requestId
  });
}

export async function proxyAuthRequest(req: any, res: any, upstreamPath: string, moduleName: string): Promise<void> {
  const started = startProxy(req, res, moduleName);
  if (!started) return;

  const method = String(req?.method ?? 'GET').toUpperCase();
  const isRefreshRequest = method === 'POST' && upstreamPath === '/api/auth/refresh';
  const upstreamUrl = buildUpstreamUrl(started.upstreamOrigin, upstreamPath, req);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTH_PROXY_TIMEOUT_MS);

  try {
    const cookieHeader = String(req?.headers?.cookie ?? '').trim();
    const csrfHeader = String(req?.headers?.['x-csrf-token'] ?? '').trim();

    if (isRefreshRequest && !cookieHeader) {
      logStructuredLine({
        module: moduleName,
        level: 'warn',
        message: 'Refresh request missing auth cookies',
        extra: { requestId: started.requestId, hasCsrfHeader: !!csrfHeader }
      });
      sendRefreshUnauthorized(res, started.requestId, 'missing_refresh_cookie');
      return;
    }

    const headers = buildForwardHeaders(req, {
      'x-safecloud-request-id': started.requestId
    });
    if (isRefreshRequest) {
      // Refresh relies on HttpOnly cookies + CSRF, not a possibly expired bearer token.
      headers.delete('authorization');
      headers.delete('content-type');
    }

    const upstreamRes = await fetch(upstreamUrl, {
      method,
      headers,
      body: getProxyBody(req),
      signal: controller.signal
    });

    if (isRefreshRequest && (upstreamRes.status === 401 || upstreamRes.status === 403)) {
      logStructuredLine({
        module: moduleName,
        level: 'warn',
        message: 'Refresh rejected by upstream',
        extra: {
          requestId: started.requestId,
          upstreamStatus: upstreamRes.status,
          hasCookieHeader: !!cookieHeader,
          hasCsrfHeader: !!csrfHeader
        }
      });
      sendRefreshUnauthorized(
        res,
        started.requestId,
        upstreamRes.status === 401 ? 'refresh_unauthorized' : 'refresh_forbidden'
      );
      return;
    }

    if (isRefreshRequest && upstreamRes.status >= 500) {
      const snippet = await readResponseSnippet(upstreamRes);
      logStructuredLine({
        module: moduleName,
        level: 'error',
        message: 'Refresh upstream returned 5xx',
        extra: {
          requestId: started.requestId,
          upstreamStatus: upstreamRes.status,
          hasCookieHeader: !!cookieHeader,
          hasCsrfHeader: !!csrfHeader,
          upstreamSnippet: snippet
        }
      });
      sendRefreshTemporaryFailure(res, started.requestId, 'refresh_upstream_error');
      return;
    }

    if (method === 'POST' && upstreamPath === '/api/auth/refresh' && upstreamRes.status === 405) {
      logStructuredLine({
        module: moduleName,
        level: 'warn',
        message: 'Upstream does not allow auth refresh; mapping 405->404 for SDK fallback',
        extra: { requestId: started.requestId, upstreamStatus: upstreamRes.status }
      });
      res.status(404).json({
        ok: false,
        error: 'Refresh not supported',
        code: 'refresh_not_supported',
        data: {},
        requestId: started.requestId
      });
      return;
    }

    await writeUpstreamResponse(res, upstreamRes, method);
  } catch (err: any) {
    const statusCode = getAuthStatusCode(err);
    const message = String(err?.name === 'AbortError' ? 'Upstream request timed out' : err?.message ?? err);
    logStructuredLine({
      module: moduleName,
      level: 'error',
      message: 'Auth proxy request failed',
      extra: { requestId: started.requestId, method, error: message, upstreamPath, statusCode }
    });
    if (isRefreshRequest && (statusCode === 401 || statusCode === 403)) {
      sendRefreshUnauthorized(
        res,
        started.requestId,
        statusCode === 401 ? 'refresh_unauthorized' : 'refresh_forbidden'
      );
      return;
    }
    if (isRefreshRequest) {
      sendRefreshTemporaryFailure(
        res,
        started.requestId,
        err?.name === 'AbortError' ? 'refresh_timeout' : 'refresh_failed'
      );
      return;
    }
    res.status(503).json({
      ok: false,
      error: 'Service temporarily unavailable. Please try again.',
      requestId: started.requestId
    });
  } finally {
    clearTimeout(timeout);
  }
}
