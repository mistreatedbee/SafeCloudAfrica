import { insforge, insforgeReady } from './client';
import {
  decodeJwtSession,
  emitAuthFailure,
  isJwtExpired,
  readStoredAccessToken,
  refreshSessionThroughProxy
} from './sessionState';

const AUTH_BOOTSTRAP_DEBUG = (import.meta as any)?.env?.VITE_AUTH_BOOTSTRAP_DEBUG === '1';

// Treat a token as needing refresh slightly before it actually expires, so the
// refresh attempt (or the clean AUTH_SESSION_MISSING failure below) happens
// proactively here instead of mid-request inside the SDK's own internal
// refresh-on-401 retry, which clears the in-memory session on failure.
const EXPIRY_LEEWAY_MS = 30_000;

type EnsureSessionFailureCode = 'AUTH_SESSION_MISSING' | 'AUTH_SESSION_INVALID';

type EnsureSessionOptions = {
  reason?: string;
};

export class InsforgeAuthBootstrapError extends Error {
  code: EnsureSessionFailureCode;

  constructor(code: EnsureSessionFailureCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'InsforgeAuthBootstrapError';
    this.code = code;
    if (options && 'cause' in options) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

function debugAuthBootstrap(event: string, details?: Record<string, unknown>): void {
  if (!AUTH_BOOTSTRAP_DEBUG) return;
  console.debug('[auth-bootstrap]', event, details ?? {});
}

function getNonAnonAttachedToken(headers: Record<string, unknown>): string | null {
  const raw = String(headers.Authorization ?? headers.authorization ?? '').trim();
  const match = raw.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim() || null;
  if (!token) return null;
  // Reject if it's just the anon key.
  const anonKey = String(((insforge.getHttpClient() as unknown) as { anonKey?: string }).anonKey ?? '').trim();
  if (anonKey && token === anonKey) return null;
  return token;
}

/**
 * One cookie-based refresh against the same /api/auth/refresh route the SDK itself
 * uses internally for its own request-level 401 retries. Failures here are non-fatal —
 * the caller falls through to AUTH_SESSION_MISSING, which only triggers a re-login
 * prompt, not a forced logout of an otherwise-valid session.
 */
async function tryProxyRefresh(reason: string): Promise<{ accessToken: string; userId: string } | null> {
  const httpClient = insforge.getHttpClient() as { baseUrl: string; setAuthToken: (token: string | null) => void };
  const refreshed = await refreshSessionThroughProxy({
    baseUrl: httpClient.baseUrl,
    fetch: globalThis.fetch.bind(globalThis)
  }).catch(() => null);
  if (!refreshed || !refreshed.ok || !refreshed.accessToken) return null;
  const userId = refreshed.userId ?? decodeJwtSession(refreshed.accessToken).sub;
  if (!userId) return null;
  httpClient.setAuthToken(refreshed.accessToken);
  debugAuthBootstrap('ensure-session:proxy-refresh', { reason });
  return { accessToken: refreshed.accessToken, userId };
}

/**
 * Ensures the shared InsForge SDK client has a signed-in user's access token
 * set on its HTTP client before making RLS-protected database calls.
 *
 * Strategy:
 * 1. If a valid non-expired token is already attached — use it immediately.
 * 2. Ask the SDK for its current in-memory session.
 * 3. Fall back to the token persisted in localStorage by the SDK.
 * 4. If a real (non-anon) token was found anywhere above but it had expired —
 *    e.g. the user has simply been logged in longer than the access token's
 *    lifetime — attempt one cookie-based refresh before giving up.
 * 5. Throw AUTH_SESSION_MISSING only if no real token candidate existed at all,
 *    or the refresh attempt also failed.
 */
export async function ensureInsforgeSession(options: EnsureSessionOptions = {}): Promise<{ accessToken: string; userId: string }> {
  const reason = options.reason ?? 'unknown';
  let hadExpiredCandidate = false;

  // --- Fast path: valid token already on the HTTP client ---
  const existingHeaders = (() => {
    try { return insforge.getHttpClient().getHeaders(); } catch { return {}; }
  })();
  const attachedToken = getNonAnonAttachedToken(existingHeaders);
  if (attachedToken) {
    if (!isJwtExpired(attachedToken, EXPIRY_LEEWAY_MS)) {
      const userId = decodeJwtSession(attachedToken).sub;
      if (userId) {
        debugAuthBootstrap('ensure-session:fast-path', { reason });
        return { accessToken: attachedToken, userId };
      }
    } else {
      hadExpiredCandidate = true;
    }
  }

  // --- Ask the SDK for its in-memory session (no network call when token is fresh) ---
  const sdkResult = await insforge.auth.getCurrentSession().catch(() => null);
  const sdkSession = (sdkResult as any)?.data?.session ?? null;
  const sdkToken = typeof sdkSession?.accessToken === 'string' && sdkSession.accessToken.trim()
    ? sdkSession.accessToken as string
    : null;
  if (sdkToken) {
    if (!isJwtExpired(sdkToken, EXPIRY_LEEWAY_MS)) {
      const userId = decodeJwtSession(sdkToken).sub
        ?? (typeof sdkSession?.user?.id === 'string' ? sdkSession.user.id : null);
      if (userId) {
        insforge.getHttpClient().setAuthToken(sdkToken);
        debugAuthBootstrap('ensure-session:sdk-session', { reason });
        return { accessToken: sdkToken, userId };
      }
    } else {
      hadExpiredCandidate = true;
    }
  }

  // --- Fall back to token persisted in localStorage ---
  const storedToken = readStoredAccessToken();
  if (storedToken) {
    if (!isJwtExpired(storedToken, EXPIRY_LEEWAY_MS)) {
      const userId = decodeJwtSession(storedToken).sub;
      if (userId) {
        insforge.getHttpClient().setAuthToken(storedToken);
        debugAuthBootstrap('ensure-session:stored-token', { reason });
        return { accessToken: storedToken, userId };
      }
    } else {
      hadExpiredCandidate = true;
    }
  }

  // --- A real session existed but its access token expired — try refreshing it once ---
  if (hadExpiredCandidate) {
    const refreshed = await tryProxyRefresh(reason);
    if (refreshed) return refreshed;
  }

  debugAuthBootstrap('ensure-session:no-valid-session', { reason });
  emitAuthFailure('Your session is not available. Please sign in again.');
  throw new InsforgeAuthBootstrapError(
    'AUTH_SESSION_MISSING',
    'Your session is not available. Please sign in again.'
  );
}

export async function withInsforgeSession<T>(reason: string, fn: () => Promise<T>): Promise<T> {
  await insforgeReady;
  await ensureInsforgeSession({ reason });
  return fn();
}
