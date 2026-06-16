import { insforge, insforgeReady } from './client';
import {
  decodeJwtSession,
  isJwtExpired,
  readStoredAccessToken
} from './sessionState';

const AUTH_BOOTSTRAP_DEBUG = (import.meta as any)?.env?.VITE_AUTH_BOOTSTRAP_DEBUG === '1';

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

function getValidAttachedToken(headers: Record<string, unknown>): { accessToken: string; userId: string } | null {
  const raw = String(headers.Authorization ?? headers.authorization ?? '').trim();
  const match = raw.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim() || null;
  if (!token) return null;
  // Reject if it's just the anon key.
  const anonKey = String(((insforge.getHttpClient() as unknown) as { anonKey?: string }).anonKey ?? '').trim();
  if (anonKey && token === anonKey) return null;
  // Reject if expired.
  if (isJwtExpired(token)) return null;
  const userId = decodeJwtSession(token).sub;
  if (!userId) return null;
  return { accessToken: token, userId };
}

/**
 * Ensures the shared InsForge SDK client has a signed-in user's access token
 * set on its HTTP client before making RLS-protected database calls.
 *
 * Strategy (no refresh token calls):
 * 1. If a valid non-expired token is already attached — use it immediately.
 * 2. Ask the SDK for its current in-memory session.
 * 3. Fall back to the token persisted in localStorage by the SDK.
 * 4. Throw AUTH_SESSION_MISSING only if all three paths produce nothing valid.
 *
 * We intentionally never call the /api/auth/refresh proxy here.
 * Token refresh is handled by the SDK's persistSession mechanism on login.
 */
export async function ensureInsforgeSession(options: EnsureSessionOptions = {}): Promise<{ accessToken: string; userId: string }> {
  const reason = options.reason ?? 'unknown';

  // --- Fast path: valid token already on the HTTP client ---
  const existingHeaders = (() => {
    try { return insforge.getHttpClient().getHeaders(); } catch { return {}; }
  })();
  const attached = getValidAttachedToken(existingHeaders);
  if (attached) {
    debugAuthBootstrap('ensure-session:fast-path', { reason });
    return attached;
  }

  // --- Ask the SDK for its in-memory session (no network call when token is fresh) ---
  const sdkResult = await insforge.auth.getCurrentSession().catch(() => null);
  const sdkSession = (sdkResult as any)?.data?.session ?? null;
  const sdkToken = typeof sdkSession?.accessToken === 'string' && sdkSession.accessToken.trim()
    ? sdkSession.accessToken as string
    : null;
  if (sdkToken && !isJwtExpired(sdkToken)) {
    const userId = decodeJwtSession(sdkToken).sub
      ?? (typeof sdkSession?.user?.id === 'string' ? sdkSession.user.id : null);
    if (userId) {
      insforge.getHttpClient().setAuthToken(sdkToken);
      debugAuthBootstrap('ensure-session:sdk-session', { reason });
      return { accessToken: sdkToken, userId };
    }
  }

  // --- Fall back to token persisted in localStorage ---
  const storedToken = readStoredAccessToken();
  if (storedToken && !isJwtExpired(storedToken)) {
    const userId = decodeJwtSession(storedToken).sub;
    if (userId) {
      insforge.getHttpClient().setAuthToken(storedToken);
      debugAuthBootstrap('ensure-session:stored-token', { reason });
      return { accessToken: storedToken, userId };
    }
  }

  debugAuthBootstrap('ensure-session:no-valid-session', { reason });
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
