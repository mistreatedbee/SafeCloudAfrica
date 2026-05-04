import { insforge, insforgeReady } from './client';

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

function readJwtSub(token: string | null | undefined): string | null {
  if (!token) return null;
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`;
    const parsed = JSON.parse(atob(padded)) as { sub?: string };
    return typeof parsed.sub === 'string' && parsed.sub.trim() ? parsed.sub : null;
  } catch {
    return null;
  }
}

function getAuthStatusCode(error: unknown): number {
  const raw = Number((error as any)?.statusCode ?? (error as any)?.status ?? 0);
  return Number.isFinite(raw) ? raw : 0;
}

function readBearerTokenFromHeaders(headers: Record<string, unknown>): string | null {
  const raw = String(headers.Authorization ?? headers.authorization ?? '').trim();
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function getAttachedUserToken(headers: Record<string, unknown>): string | null {
  const token = readBearerTokenFromHeaders(headers);
  if (!token) return null;
  const anonKey = String((insforge.getHttpClient() as { anonKey?: string }).anonKey ?? '').trim();
  if (anonKey && token === anonKey) return null;
  return token;
}

function getAttachedSession(headers: Record<string, unknown>): { accessToken: string; userId: string } | null {
  const token = getAttachedUserToken(headers);
  const userId = readJwtSub(token);
  if (!token || !userId) return null;
  return { accessToken: token, userId };
}

function isInvalidSessionError(error: unknown): boolean {
  const statusCode = getAuthStatusCode(error);
  if (statusCode === 401 || statusCode === 403) return true;
  const message = String(
    (error as any)?.code ??
      (error as any)?.error ??
      (error as any)?.message ??
      ''
  ).toLowerCase();
  return (
    message.includes('invalid or expired session') ||
    message.includes('session expired') ||
    message.includes('refresh_unauthorized') ||
    message.includes('refresh_forbidden') ||
    message.includes('missing_refresh_cookie') ||
    message.includes('invalid refresh token') ||
    message.includes('unauthorized')
  );
}

function debugAuthBootstrap(event: string, details?: Record<string, unknown>): void {
  if (!AUTH_BOOTSTRAP_DEBUG) return;
  console.debug('[auth-bootstrap]', event, details ?? {});
}

/**
 * Ensures the shared InsForge SDK client has a signed-in user's access token
 * set on its HTTP client before making RLS-protected database calls.
 *
 * Why: if the HTTP client falls back to the anon key, Postgres sees auth.uid() as null
 * and RLS policies (correctly) reject inserts/updates.
 */
export async function ensureInsforgeSession(options: EnsureSessionOptions = {}): Promise<{ accessToken: string; userId: string }> {
  const reason = options.reason ?? 'unknown';
  const existingHeaders = (() => {
    try {
      return insforge.getHttpClient().getHeaders();
    } catch {
      return {};
    }
  })();
  const hadAuthHeader = !!String((existingHeaders as any)?.Authorization ?? (existingHeaders as any)?.authorization ?? '').trim();
  debugAuthBootstrap('ensure-session:start', { reason, hadAuthHeader });

  const result = await insforge.auth.getCurrentSession().catch((error) => {
    const attachedSession = getAttachedSession(existingHeaders);
    if (attachedSession && !isInvalidSessionError(error)) {
      insforge.getHttpClient().setAuthToken(attachedSession.accessToken);
      debugAuthBootstrap('ensure-session:attached-token-fallback-after-error', {
        reason,
        hadAuthHeader,
        tokenAttached: true
      });
      return { data: { session: { accessToken: attachedSession.accessToken, user: { id: attachedSession.userId } } }, error: null };
    }
    debugAuthBootstrap('ensure-session:get-current-session-error', {
      reason,
      hadAuthHeader,
      invalidSession: isInvalidSessionError(error)
    });
    throw new InsforgeAuthBootstrapError(
      isInvalidSessionError(error) ? 'AUTH_SESSION_INVALID' : 'AUTH_SESSION_MISSING',
      'Your session is not available. Please sign in again.',
      { cause: error }
    );
  });
  if (!result || typeof result !== 'object') {
    const attachedSession = getAttachedSession(existingHeaders);
    if (attachedSession) return attachedSession;
    debugAuthBootstrap('ensure-session:missing-result', { reason, hadAuthHeader });
    throw new InsforgeAuthBootstrapError('AUTH_SESSION_MISSING', 'Your session is not available. Please sign in again.');
  }
  const { data, error } = result;
  if (error) {
    const attachedSession = getAttachedSession(existingHeaders);
    if (attachedSession && !isInvalidSessionError(error)) return attachedSession;
    debugAuthBootstrap('ensure-session:result-error', {
      reason,
      hadAuthHeader,
      invalidSession: isInvalidSessionError(error)
    });
    throw new InsforgeAuthBootstrapError(
      isInvalidSessionError(error) ? 'AUTH_SESSION_INVALID' : 'AUTH_SESSION_MISSING',
      'Your session is not available. Please sign in again.',
      { cause: error }
    );
  }

  const session = data?.session ?? null;
  const token =
    (typeof session?.accessToken === 'string' && session.accessToken.trim() ? session.accessToken : null) ??
    ((typeof (result as any)?.accessToken === 'string' && (result as any).accessToken.trim())
      ? (result as any).accessToken
      : null);
  const userId =
    (typeof session?.user?.id === 'string' && session.user.id.trim() ? session.user.id : null) ??
    ((typeof (result as any)?.user?.id === 'string' && (result as any).user.id.trim())
      ? (result as any).user.id
      : null) ??
    readJwtSub(token);

  if (!token || !userId) {
    const attachedSession = getAttachedSession(existingHeaders);
    if (attachedSession) return attachedSession;
    // Keep message user-friendly; UI can prompt a re-login.
    debugAuthBootstrap('ensure-session:missing-token-or-user', {
      reason,
      hadAuthHeader,
      hasToken: !!token,
      hasUserId: !!userId
    });
    throw new InsforgeAuthBootstrapError('AUTH_SESSION_MISSING', 'Your session is not available. Please sign in again.');
  }

  // Redundant but intentional: guarantees DB calls that follow are authenticated.
  insforge.getHttpClient().setAuthToken(token);
  debugAuthBootstrap('ensure-session:attached-token', {
    reason,
    hadAuthHeader,
    tokenAttached: true
  });

  return { accessToken: token, userId };
}

export async function withInsforgeSession<T>(reason: string, fn: () => Promise<T>): Promise<T> {
  await insforgeReady;
  await ensureInsforgeSession({ reason });
  return fn();
}
