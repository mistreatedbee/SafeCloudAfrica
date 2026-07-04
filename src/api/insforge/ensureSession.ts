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

/**
 * Thrown when a proxy refresh attempt failed for a reason that is NOT evidence
 * the session is actually invalid (network error, unexpected 5xx, malformed
 * refresh response). Deliberately NOT a subclass of InsforgeAuthBootstrapError —
 * callers that gate on `instanceof InsforgeAuthBootstrapError` to force a
 * logout/redirect must not match this, so a transient blip doesn't log the
 * user out of an otherwise-valid session.
 */
export class InsforgeTransientSessionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'InsforgeTransientSessionError';
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

type ProxyRefreshOutcome =
  | { ok: true; accessToken: string; userId: string }
  | { ok: false; reason: 'invalid_session' | 'refresh_unavailable' | 'transient_failure' };

/**
 * One cookie-based refresh against the same /api/auth/refresh route the SDK itself
 * uses internally for its own request-level 401 retries. Failures here are non-fatal —
 * the caller falls through to AUTH_SESSION_MISSING, which only triggers a re-login
 * prompt, not a forced logout of an otherwise-valid session.
 */
async function tryProxyRefresh(reason: string): Promise<ProxyRefreshOutcome> {
  const httpClient = insforge.getHttpClient() as { baseUrl: string; setAuthToken: (token: string | null) => void };
  const refreshed = await refreshSessionThroughProxy({
    baseUrl: httpClient.baseUrl,
    fetch: globalThis.fetch.bind(globalThis)
  }).catch(() => null);
  if (!refreshed) return { ok: false, reason: 'transient_failure' };
  if (!refreshed.ok) return { ok: false, reason: refreshed.reason };
  if (!refreshed.accessToken) return { ok: false, reason: 'transient_failure' };
  const userId = refreshed.userId ?? decodeJwtSession(refreshed.accessToken).sub;
  if (!userId) return { ok: false, reason: 'transient_failure' };
  httpClient.setAuthToken(refreshed.accessToken);
  debugAuthBootstrap('ensure-session:proxy-refresh', { reason });
  return { ok: true, accessToken: refreshed.accessToken, userId };
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
    const outcome = await tryProxyRefresh(reason);
    if (outcome.ok) return { accessToken: outcome.accessToken, userId: outcome.userId };
    if (outcome.reason === 'transient_failure') {
      debugAuthBootstrap('ensure-session:transient-refresh-failure', { reason });
      throw new InsforgeTransientSessionError(
        'We could not refresh your session right now. Please try again in a moment.'
      );
    }
    // outcome.reason is 'invalid_session' or 'refresh_unavailable' — genuinely no
    // usable session; fall through to the definitive logout below.
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

// ---------- Proactive background refresh ----------
// Refreshes the access token shortly before it actually expires, so an
// actively-used session never hits the reactive expiry path in
// ensureInsforgeSession() above at all. This is a hardening layer on top of
// the reactive refresh, not a replacement for it — reactive refresh still
// handles the case where the tab was backgrounded/asleep past this timer.
const PROACTIVE_REFRESH_LEAD_MS = 5 * 60 * 1000;
const PROACTIVE_REFRESH_MIN_DELAY_MS = 5_000;
const PROACTIVE_REFRESH_RETRY_DELAY_MS = 60_000;

let proactiveRefreshTimeout: ReturnType<typeof setTimeout> | null = null;

export function stopProactiveSessionRefresh(): void {
  if (proactiveRefreshTimeout) {
    clearTimeout(proactiveRefreshTimeout);
    proactiveRefreshTimeout = null;
  }
}

function scheduleProactiveRefresh(delayMs: number): void {
  stopProactiveSessionRefresh();
  proactiveRefreshTimeout = setTimeout(() => {
    void runProactiveRefresh();
  }, Math.max(delayMs, PROACTIVE_REFRESH_MIN_DELAY_MS));
}

async function runProactiveRefresh(): Promise<void> {
  const outcome = await tryProxyRefresh('proactive-refresh');
  if (outcome.ok) {
    debugAuthBootstrap('proactive-refresh:success', {});
    const expMs = decodeJwtSession(outcome.accessToken).expMs;
    if (expMs) scheduleProactiveRefresh(expMs - Date.now() - PROACTIVE_REFRESH_LEAD_MS);
    return;
  }
  if (outcome.reason === 'transient_failure') {
    debugAuthBootstrap('proactive-refresh:transient-failure-retry', {});
    scheduleProactiveRefresh(PROACTIVE_REFRESH_RETRY_DELAY_MS);
    return;
  }
  // invalid_session / refresh_unavailable — genuinely nothing to refresh.
  // The reactive path in ensureInsforgeSession will surface the real logout
  // the next time the app makes an authenticated call; don't reschedule.
  debugAuthBootstrap('proactive-refresh:stopped', { reason: outcome.reason });
}

/**
 * Starts the proactive refresh timer for the current session, if one exists.
 * Safe to call multiple times (e.g. on remount) — each call replaces any
 * previously scheduled timer rather than stacking them.
 */
export function startProactiveSessionRefresh(): void {
  void (async () => {
    try {
      const { accessToken } = await ensureInsforgeSession({ reason: 'proactive-refresh:init' });
      const expMs = decodeJwtSession(accessToken).expMs;
      if (expMs) scheduleProactiveRefresh(expMs - Date.now() - PROACTIVE_REFRESH_LEAD_MS);
    } catch (err) {
      if (err instanceof InsforgeTransientSessionError) {
        scheduleProactiveRefresh(PROACTIVE_REFRESH_RETRY_DELAY_MS);
      }
      // AUTH_SESSION_MISSING or anything else: no valid session to schedule around.
    }
  })();
}
