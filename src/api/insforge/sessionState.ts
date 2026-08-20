export type JwtSessionClaims = {
  sub: string | null;
  expMs: number | null;
};

export type RefreshSessionResult =
  | { ok: true; accessToken: string; userId: string | null; user?: unknown }
  | { ok: false; reason: 'invalid_session' | 'refresh_unavailable' | 'transient_failure'; status?: number; error?: unknown };

const AUTH_TOKEN_KEY = 'insforge-auth-token';
const AUTH_USER_KEY = 'insforge-auth-user';
const CSRF_TOKEN_COOKIE = 'insforge_csrf_token';

export function decodeJwtSession(token: string | null | undefined): JwtSessionClaims {
  if (!token) return { sub: null, expMs: null };
  try {
    const [, payload] = token.split('.');
    if (!payload) return { sub: null, expMs: null };
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`;
    const parsed = JSON.parse(atob(padded)) as { sub?: unknown; exp?: unknown };
    const sub = typeof parsed.sub === 'string' && parsed.sub.trim() ? parsed.sub : null;
    const exp = Number(parsed.exp);
    return {
      sub,
      expMs: Number.isFinite(exp) && exp > 0 ? exp * 1000 : null
    };
  } catch {
    return { sub: null, expMs: null };
  }
}

export function isJwtExpired(token: string | null | undefined, leewayMs = 0): boolean {
  const { expMs } = decodeJwtSession(token);
  return !!expMs && expMs <= Date.now() + leewayMs;
}

export function readBearerTokenFromHeaders(headers: Record<string, unknown>): string | null {
  const raw = String(headers.Authorization ?? headers.authorization ?? '').trim();
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function readStoredAccessToken(): string | null {
  try {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    return token?.trim() || null;
  } catch {
    return null;
  }
}

export function saveStoredSession(accessToken: string, user?: unknown): void {
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, accessToken);
    if (user && typeof user === 'object') {
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    }
  } catch {
    // ignore storage errors
  }
}

function clearCsrfTokenCookie(): void {
  if (typeof document === 'undefined') return;
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${CSRF_TOKEN_COOKIE}=; path=/; max-age=0; SameSite=Lax${secure}`;
}

/**
 * Mirrors the SDK's own setCsrfToken() (see @insforge/sdk token-manager.ts). The CSRF
 * token is rotated by the backend on every /api/auth/refresh response — if we don't
 * re-persist it here, the *next* refresh call (proactive or reactive) resends the
 * stale, already-invalidated token, gets rejected as invalid_session, and the user's
 * session dies at the next access-token expiry even though the refresh token itself
 * was still good. This was the root cause of sessions ending after ~15 minutes
 * (the access token TTL) instead of lasting for the 7-day refresh token's lifetime.
 */
function setCsrfTokenCookie(token: string): void {
  if (typeof document === 'undefined' || !token) return;
  const maxAge = 7 * 24 * 60 * 60;
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${CSRF_TOKEN_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; SameSite=Lax${secure}`;
}

function readCsrfTokenCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split(';').find((cookie) => cookie.trim().startsWith(`${CSRF_TOKEN_COOKIE}=`));
  const raw = match?.split('=')[1];
  return raw ? decodeURIComponent(raw) : null;
}

export function clearAuthStorage(): void {
  try {
    const localKeysToClear: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      const normalized = key.toLowerCase();
      if (
        normalized.includes('insforge') ||
        normalized.includes('supabase') ||
        normalized.includes('auth') ||
        normalized.includes('token') ||
        normalized.includes('session')
      ) {
        localKeysToClear.push(key);
      }
    }
    localKeysToClear.push('sca_session_v1', 'sca_active_company_id_v3');
    for (const key of [...new Set(localKeysToClear)]) localStorage.removeItem(key);
  } catch {
    // ignore storage errors
  }
  clearCsrfTokenCookie();
}


export function getAuthStatusCode(error: unknown): number {
  const raw = Number((error as any)?.statusCode ?? (error as any)?.status ?? 0);
  return Number.isFinite(raw) ? raw : 0;
}

export function isInvalidSessionError(error: unknown): boolean {
  const statusCode = getAuthStatusCode(error);
  if (statusCode === 401 || statusCode === 403) return true;
  const message = String(
    (error as any)?.code ??
      (error as any)?.error ??
      (error as any)?.message ??
      ''
  ).toLowerCase();
  return (
    message.includes('invalid token') ||
    message.includes('invalid or expired session') ||
    message.includes('session expired') ||
    message.includes('refresh_unauthorized') ||
    message.includes('refresh_forbidden') ||
    message.includes('missing_refresh_cookie') ||
    message.includes('invalid refresh token') ||
    message.includes('unauthorized')
  );
}

function parseRefreshPayload(payload: unknown): { accessToken: string | null; userId: string | null; user?: unknown; csrfToken: string | null } {
  const accessToken =
    typeof (payload as any)?.accessToken === 'string' && (payload as any).accessToken.trim()
      ? (payload as any).accessToken
      : typeof (payload as any)?.data?.session?.accessToken === 'string' && (payload as any).data.session.accessToken.trim()
        ? (payload as any).data.session.accessToken
        : null;
  const user = (payload as any)?.user ?? (payload as any)?.data?.session?.user ?? null;
  const userId =
    typeof user?.id === 'string' && user.id.trim()
      ? user.id
      : decodeJwtSession(accessToken).sub;
  const csrfToken =
    typeof (payload as any)?.csrfToken === 'string' && (payload as any).csrfToken.trim()
      ? (payload as any).csrfToken
      : typeof (payload as any)?.data?.csrfToken === 'string' && (payload as any).data.csrfToken.trim()
        ? (payload as any).data.csrfToken
        : null;
  return { accessToken, userId, user, csrfToken };
}

export async function refreshSessionThroughProxy(input: {
  baseUrl: string;
  fetch: typeof fetch;
}): Promise<RefreshSessionResult> {
  const csrfToken = readCsrfTokenCookie();
  const headers: HeadersInit = csrfToken ? { 'X-CSRF-Token': csrfToken } : {};
  let response: Response;
  try {
    response = await input.fetch(new URL('/api/auth/refresh', input.baseUrl).toString(), {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers
    });
  } catch (error) {
    return { ok: false, reason: 'transient_failure', error };
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      return { ok: false, reason: 'invalid_session', status: response.status, error: payload };
    }
    if (response.status === 404 || response.status === 405) {
      return { ok: false, reason: 'refresh_unavailable', status: response.status, error: payload };
    }
    return { ok: false, reason: 'transient_failure', status: response.status, error: payload };
  }

  const parsed = parseRefreshPayload(payload);
  if (!parsed.accessToken) {
    return { ok: false, reason: 'transient_failure', status: response.status, error: payload };
  }
  saveStoredSession(parsed.accessToken, parsed.user);
  // The backend rotates the CSRF token on every refresh; persist the new one so the
  // *next* refresh (proactive or reactive) doesn't send a stale, already-invalidated
  // token and get rejected as invalid_session.
  if (parsed.csrfToken) setCsrfTokenCookie(parsed.csrfToken);
  return { ok: true, accessToken: parsed.accessToken, userId: parsed.userId, user: parsed.user };
}

