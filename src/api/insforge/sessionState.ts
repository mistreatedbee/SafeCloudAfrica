export type JwtSessionClaims = {
  sub: string | null;
  expMs: number | null;
};

export type AuthSessionSnapshot = {
  accessToken: string | null;
  userId: string | null;
  user?: unknown;
};

export type RefreshSessionResult =
  | { ok: true; accessToken: string; userId: string | null; user?: unknown }
  | { ok: false; reason: 'invalid_session' | 'refresh_unavailable' | 'transient_failure'; status?: number; error?: unknown };

const AUTH_TOKEN_KEY = 'insforge-auth-token';
const AUTH_USER_KEY = 'insforge-auth-user';
const CSRF_TOKEN_COOKIE = 'insforge_csrf_token';
const SESSION_EXPIRED_KEY = 'sca_session_expired';
const SESSION_EXPIRED_MESSAGE_KEY = 'sca_session_expired_message';
const USER_SIGNED_OUT_KEY = 'sca_user_signed_out';
const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please log in again.';

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

export function readAuthSessionResult(result: unknown): AuthSessionSnapshot {
  const session = (result as any)?.data?.session;
  // SDK 1.2.x can return raw response in data: { data: { accessToken, user } }.
  const dataToken = (result as any)?.data?.accessToken;
  const dataUser = (result as any)?.data?.user;
  const topLevelToken = (result as any)?.accessToken;
  const topLevelUser = (result as any)?.user;
  const accessToken =
    typeof session?.accessToken === 'string' && session.accessToken.trim()
      ? session.accessToken
      : typeof dataToken === 'string' && dataToken.trim()
        ? dataToken
        : typeof topLevelToken === 'string' && topLevelToken.trim()
          ? topLevelToken
          : null;
  const user = session?.user ?? dataUser ?? topLevelUser ?? null;
  const userId =
    typeof user?.id === 'string' && user.id.trim()
      ? user.id
      : decodeJwtSession(accessToken).sub;
  return { accessToken, userId, user };
}

export function hasMalformedAuthSessionResult(result: unknown): boolean {
  if (!result || typeof result !== 'object') return true;
  if (
    !('data' in (result as Record<string, unknown>)) &&
    !('error' in (result as Record<string, unknown>)) &&
    !('accessToken' in (result as Record<string, unknown>))
  ) {
    return true;
  }
  const data = (result as any)?.data;
  if (data == null) return false;
  return typeof data !== 'object';
}

export function getAuthResultError(result: unknown): unknown {
  return (result as any)?.error ?? null;
}

export function getCurrentAuthSession(auth: {
  getCurrentSession?: () => Promise<unknown>;
  getCurrentUser: () => Promise<unknown>;
}): Promise<unknown> {
  if (typeof auth.getCurrentSession === 'function') return auth.getCurrentSession.call(auth);
  return auth.getCurrentUser.call(auth);
}

function clearCsrfTokenCookie(): void {
  if (typeof document === 'undefined') return;
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${CSRF_TOKEN_COOKIE}=; path=/; max-age=0; SameSite=Lax${secure}`;
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

export function markSessionExpired(message = SESSION_EXPIRED_MESSAGE): void {
  try {
    sessionStorage.setItem(SESSION_EXPIRED_KEY, '1');
    sessionStorage.setItem(SESSION_EXPIRED_MESSAGE_KEY, message);
    sessionStorage.removeItem(USER_SIGNED_OUT_KEY);
  } catch {
    // ignore storage errors
  }
}

export function emitAuthFailure(error: unknown): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('sca:auth-failure', {
      detail: { message: String((error as any)?.message ?? error ?? 'Authentication failed') }
    })
  );
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

function parseRefreshPayload(payload: unknown): { accessToken: string | null; userId: string | null; user?: unknown } {
  return readAuthSessionResult(payload);
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
  return { ok: true, accessToken: parsed.accessToken, userId: parsed.userId, user: parsed.user };
}
