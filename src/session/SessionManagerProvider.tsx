import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { useAuth } from '@insforge/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { insforge } from '../api/insforge/client';
import {
  refreshSessionThroughProxy,
  saveStoredSession,
} from '../api/insforge/sessionState';
import {
  SESSION_EXPIRED_KEY,
  SESSION_EXPIRED_MESSAGE_KEY,
  USER_SIGNED_OUT_KEY,
} from '../auth/AuthSessionListener';
import { useDraftManager } from './DraftManagerProvider';

const CHECK_INTERVAL_MS = 60 * 1000;
const REFRESH_LEEWAY_MS = 5 * 60 * 1000;
const REFRESH_RETRY_MS = 30 * 1000;
const MAX_REFRESH_RETRIES = 10;
const EXPIRES_PARSE_THROTTLE_MS = 5 * 60 * 1000;
const SESSION_DEBUG = (import.meta as any)?.env?.VITE_SESSION_DEBUG === '1';

function debugSession(...args: unknown[]) {
  if (!SESSION_DEBUG) return;
  console.debug('[session-debug]', ...args);
}

type SessionManagerContextValue = {
  continueSession: () => Promise<void>;
  registerActivity: () => void;
};

const SessionManagerContext = createContext<SessionManagerContextValue | null>(
  null,
);

type RefreshSessionOutcome =
  | { ok: true }
  | { ok: false; shouldLogout: true; reason: 'invalid_session' }
  | { ok: false; shouldLogout: false; reason: 'transient_failure' };

function decodeTokenExpiryMs(token: string | null | undefined): number | null {
  if (!token) return null;
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`;
    const parsed = JSON.parse(atob(padded)) as { exp?: number };
    if (!parsed.exp) return null;
    return parsed.exp * 1000;
  } catch {
    return null;
  }
}

function getAuthStatusCode(error: unknown): number {
  const raw = Number(
    (error as any)?.statusCode ?? (error as any)?.status ?? 0,
  );
  return Number.isFinite(raw) ? raw : 0;
}

type AuthSessionShape = {
  accessToken: string | null;
  userId: string | null;
};

function readJwtSub(token: string | null | undefined): string | null {
  if (!token) return null;
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`;
    const parsed = JSON.parse(atob(padded)) as { sub?: string };
    return typeof parsed.sub === 'string' && parsed.sub.trim()
      ? parsed.sub
      : null;
  } catch {
    return null;
  }
}

function readClientAuthToken(): string | null {
  try {
    const headers = insforge.getHttpClient().getHeaders();
    const authHeader = String(
      headers.Authorization ?? headers.authorization ?? '',
    ).trim();
    if (!authHeader) return null;
    const [scheme, token] = authHeader.split(/\s+/, 2);
    if (scheme?.toLowerCase() !== 'bearer') return null;
    return token?.trim() || null;
  } catch {
    return null;
  }
}

function readAuthSession(result: unknown): AuthSessionShape {
  const session = (result as any)?.data?.session;
  const topLevelToken = (result as any)?.accessToken;
  const topLevelUserId = (result as any)?.user?.id;
  const accessToken =
    typeof session?.accessToken === 'string' && session.accessToken.trim()
      ? session.accessToken
      : typeof topLevelToken === 'string' && topLevelToken.trim()
        ? topLevelToken
        : null;
  const userId =
    typeof session?.user?.id === 'string' && session.user.id.trim()
      ? session.user.id
      : typeof topLevelUserId === 'string' && topLevelUserId.trim()
        ? topLevelUserId
        : readJwtSub(accessToken);
  return { accessToken, userId };
}

function hasMalformedAuthResponse(result: unknown): boolean {
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

function isInvalidSessionError(error: unknown): boolean {
  const statusCode = getAuthStatusCode(error);
  if (statusCode === 401 || statusCode === 403) return true;
  const message = String(
    (error as any)?.code ??
      (error as any)?.error ??
      (error as any)?.message ??
      '',
  ).toLowerCase();
  return (
    message.includes('invalid or expired session') ||
    message.includes('session expired') ||
    message.includes('refresh_unauthorized') ||
    message.includes('refresh_forbidden') ||
    message.includes('missing_refresh_cookie') ||
    message.includes('invalid refresh token')
  );
}

function refreshSucceeded(): RefreshSessionOutcome {
  return { ok: true };
}

function invalidSessionFailure(): RefreshSessionOutcome {
  return { ok: false, shouldLogout: true, reason: 'invalid_session' };
}

function transientRefreshFailure(): RefreshSessionOutcome {
  return { ok: false, shouldLogout: false, reason: 'transient_failure' };
}

function clearClientSessionState(): void {
  try {
    insforge.getHttpClient().setAuthToken(null);
  } catch {
    // ignore
  }
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
    for (const key of localKeysToClear) {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

export function SessionManagerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const { flushAllDrafts } = useDraftManager();
  const lastActivityRef = useRef<number>(Date.now());
  const refreshInFlightRef = useRef(false);
  const refreshRetryCountRef = useRef(0);
  const lastExpiresParseFallbackAttemptRef = useRef<number>(0);
  const isLoggingOutRef = useRef(false);
  const hasNavigatedToLoginRef = useRef(false);

  useEffect(() => {
    if (!isSignedIn) return;
    isLoggingOutRef.current = false;
    hasNavigatedToLoginRef.current = false;
    lastActivityRef.current = Date.now();
    refreshRetryCountRef.current = 0;
  }, [isSignedIn]);

  const registerActivity = useCallback(() => {
    if (isLoggingOutRef.current) return;
    lastActivityRef.current = Date.now();
  }, []);

  const markSessionExpiredAndLogout = useCallback(
    async (reason: 'refresh_failure') => {
      if (isLoggingOutRef.current) return;
      isLoggingOutRef.current = true;
      console.warn('[session] session expired; reason:', reason);
      debugSession('markSessionExpiredAndLogout', {
        reason,
        refreshRetryCount: refreshRetryCountRef.current,
      });
      try {
        sessionStorage.setItem(SESSION_EXPIRED_KEY, '1');
        sessionStorage.setItem(
          SESSION_EXPIRED_MESSAGE_KEY,
          'Your session has expired. Please log in again.',
        );
        sessionStorage.removeItem(USER_SIGNED_OUT_KEY);
      } catch {
        // ignore
      }
      clearClientSessionState();
      try {
        await flushAllDrafts();
      } catch {
        // best effort
      }
      try {
        await signOut();
      } catch {
        // continue to login redirect even if signOut throws
      }
      if (!hasNavigatedToLoginRef.current) {
        hasNavigatedToLoginRef.current = true;
        const redirect = encodeURIComponent(
          location.pathname + location.search,
        );
        navigate(`/login?redirect=${redirect}`, { replace: true });
      }
    },
    [flushAllDrafts, location.pathname, location.search, navigate, signOut],
  );

  const refreshSessionIfNeeded = useCallback(async (): Promise<RefreshSessionOutcome> => {
    if (isLoggingOutRef.current) return refreshSucceeded();
    if (refreshInFlightRef.current) return refreshSucceeded();
    refreshInFlightRef.current = true;
    const existingClientToken = readClientAuthToken();
    const existingClientTokenExpiresAtMs =
      decodeTokenExpiryMs(existingClientToken);
    let lastKnownToken: string | null = null;
    let lastKnownExpiresAtMs: number | null = null;
    try {
      const current = await insforge.auth.refreshSession();
      const existingTokenStillValid =
        !!existingClientToken &&
        !!existingClientTokenExpiresAtMs &&
        existingClientTokenExpiresAtMs > Date.now();

      if (hasMalformedAuthResponse(current)) {
        if (existingClientToken) {
          insforge.getHttpClient().setAuthToken(existingClientToken);
        }
        refreshRetryCountRef.current += 1;
        console.warn('[session] malformed current session response', current);
        return transientRefreshFailure();
      }

      const currentError = current.error ?? null;
      const { accessToken: token, userId: currentUserId } =
        readAuthSession(current);
      lastKnownToken = token;
      lastKnownExpiresAtMs = decodeTokenExpiryMs(token);

      if (currentError) {
        if (isInvalidSessionError(currentError)) {
          insforge.getHttpClient().setAuthToken(null);
          refreshRetryCountRef.current = MAX_REFRESH_RETRIES + 1;
          console.warn('[session] current session rejected', currentError);
          return invalidSessionFailure();
        }
        if (existingTokenStillValid) {
          insforge.getHttpClient().setAuthToken(existingClientToken);
          refreshRetryCountRef.current = 0;
          console.warn(
            '[session] current session unavailable; keeping existing client token',
            currentError,
          );
          return refreshSucceeded();
        }
        if (existingClientToken) {
          insforge.getHttpClient().setAuthToken(existingClientToken);
        }
        refreshRetryCountRef.current += 1;
        console.warn(
          '[session] current session unavailable; treating as transient failure',
          currentError,
        );
        return transientRefreshFailure();
      }

      if (!token || !currentUserId) {
        if (existingTokenStillValid) {
          insforge.getHttpClient().setAuthToken(existingClientToken);
          refreshRetryCountRef.current = 0;
          console.warn(
            '[session] current session missing required data; keeping existing client token',
            current,
          );
          return refreshSucceeded();
        }
        if (existingClientToken) {
          insforge.getHttpClient().setAuthToken(existingClientToken);
        }
        refreshRetryCountRef.current += 1;
        console.warn(
          '[session] current session missing required data; treating as transient failure',
          current,
        );
        return transientRefreshFailure();
      }

      const now = Date.now();
      if (
        lastKnownExpiresAtMs &&
        lastKnownExpiresAtMs - now > REFRESH_LEEWAY_MS
      ) {
        refreshRetryCountRef.current = 0;
        return refreshSucceeded();
      }

      if (!lastKnownExpiresAtMs) {
        const sinceLast = now - lastExpiresParseFallbackAttemptRef.current;
        if (sinceLast < EXPIRES_PARSE_THROTTLE_MS) {
          refreshRetryCountRef.current = 0;
          return refreshSucceeded();
        }
        lastExpiresParseFallbackAttemptRef.current = now;
      }

      const httpClient = insforge.getHttpClient() as { baseUrl: string };
      const refreshed = await refreshSessionThroughProxy({
        baseUrl: httpClient.baseUrl,
        fetch: globalThis.fetch.bind(globalThis),
      });

      if (refreshed.ok && refreshed.accessToken && refreshed.userId) {
        insforge.getHttpClient().setAuthToken(refreshed.accessToken);
        refreshRetryCountRef.current = 0;
        console.info('[session] refresh success');
        return refreshSucceeded();
      }

      if (!refreshed.ok && refreshed.reason === 'invalid_session') {
        insforge.getHttpClient().setAuthToken(null);
        refreshRetryCountRef.current = MAX_REFRESH_RETRIES + 1;
        console.warn('[session] refresh rejected', refreshed.error);
        return invalidSessionFailure();
      }

      const tokenStillValid =
        !!lastKnownExpiresAtMs && lastKnownExpiresAtMs > Date.now();
      const fallbackToken = existingClientToken ?? lastKnownToken;

      if (tokenStillValid && lastKnownToken) {
        insforge.getHttpClient().setAuthToken(lastKnownToken);
        refreshRetryCountRef.current = 0;
        return refreshSucceeded();
      }
      if (fallbackToken) {
        insforge.getHttpClient().setAuthToken(fallbackToken);
      }
<<<<<<< HEAD

      // SDK fallback: uses the persisted refresh token via a different endpoint
      const sdkResult1 = await insforge.auth
        .refreshSession()
        .catch(() => ({ data: null, error: null }));
      if (sdkResult1.data?.accessToken) {
        insforge.getHttpClient().setAuthToken(sdkResult1.data.accessToken);
        saveStoredSession(sdkResult1.data.accessToken, sdkResult1.data.user);
=======
      // refresh_unavailable means the endpoint does not exist for this tenant —
      // a permanent infrastructure fact, not a session error. Try SDK-level refresh
      // as a fallback (may succeed via cookies). Never count it as a retry failure
      // or drive a logout; reset the counter so it cannot accumulate towards MAX_REFRESH_RETRIES.
      if (!refreshed.ok && refreshed.reason === 'refresh_unavailable') {
>>>>>>> b78150e (Fix session expiry, add SHEQ features, and improve HR UX)
        refreshRetryCountRef.current = 0;
        try {
          const sdkRefreshed = await insforge.auth.refreshSession();
          const { accessToken: sdkToken, userId: sdkUserId } = readAuthSession(sdkRefreshed);
          if (sdkToken && sdkUserId) {
            insforge.getHttpClient().setAuthToken(sdkToken);
            refreshRetryCountRef.current = 0;
            console.info('[session] refresh_unavailable; SDK refresh fallback succeeded');
            return refreshSucceeded();
          }
        } catch {
          // SDK refresh also unavailable; fall through
        }
        console.info('[session] refresh endpoint not available for this tenant; keeping existing token');
        return transientRefreshFailure();
      }

      refreshRetryCountRef.current += 1;
      console.warn('[session] refresh failed', refreshed);
      return transientRefreshFailure();
    } catch (error) {
      // -----------------------------------------------------------
      // FIX: use the caught `error` instead of undefined `currentError`
      // -----------------------------------------------------------
      if (isInvalidSessionError(error)) {
        const existingTokenExpiry = decodeTokenExpiryMs(existingClientToken);
        if (
          existingClientToken &&
          existingTokenExpiry &&
          existingTokenExpiry > Date.now()
        ) {
          console.warn(
            '[session] Session validation failed but token remains valid.',
          );
          refreshRetryCountRef.current = 0;
          return refreshSucceeded();
        }

        insforge.getHttpClient().setAuthToken(null);
        refreshRetryCountRef.current = MAX_REFRESH_RETRIES + 1;
        return invalidSessionFailure();
      }

      // If we have enough info to tell the token hasn't expired yet,
      // treat refresh errors as non-fatal.
      const tokenStillValid =
        !!lastKnownExpiresAtMs && lastKnownExpiresAtMs > Date.now();
      if (lastKnownToken && tokenStillValid) {
        insforge.getHttpClient().setAuthToken(lastKnownToken);
        refreshRetryCountRef.current = 0;
        return refreshSucceeded();
      }
      if (existingClientToken) {
        insforge.getHttpClient().setAuthToken(existingClientToken);
      }
<<<<<<< HEAD

      // SDK fallback: same as proxy-failure branch above.
      const sdkResult2 = await insforge.auth
        .refreshSession()
        .catch(() => ({ data: null, error: null }));
      if (sdkResult2.data?.accessToken) {
        insforge.getHttpClient().setAuthToken(sdkResult2.data.accessToken);
        saveStoredSession(sdkResult2.data.accessToken, sdkResult2.data.user);
        refreshRetryCountRef.current = 0;
        console.info('[session] refresh via SDK fallback succeeded');
        return refreshSucceeded();
      }

=======
>>>>>>> b78150e (Fix session expiry, add SHEQ features, and improve HR UX)
      refreshRetryCountRef.current += 1;
      console.warn('[session] refresh failed', error);
      return transientRefreshFailure();
    } finally {
      refreshInFlightRef.current = false;
    }
  }, []);

  const continueSession = useCallback(async () => {
    if (isLoggingOutRef.current) return;
    registerActivity();
    const outcome = await refreshSessionIfNeeded();

    if (!outcome.ok && outcome.shouldLogout) {
      const token = readClientAuthToken();
      const expiry = decodeTokenExpiryMs(token);

      // Only skip forced logout if a *valid, non-expired* token is still present.
      // Otherwise (token missing or expired) we must log out.
      if (token && expiry && expiry > Date.now()) {
        console.warn(
          '[session] Refresh failed but a valid token is still present. Deferring logout.',
        );
      } else {
        await markSessionExpiredAndLogout('refresh_failure');
      }
    }
  }, [markSessionExpiredAndLogout, refreshSessionIfNeeded, registerActivity]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (isLoggingOutRef.current) return;
    const onActivity = () => registerActivity();
    // Activity is still recorded, though it no longer drives client-side auto-logout.
    const windowEvents = [
      'mousemove',
      'mousedown',
      'click',
      'keydown',
      'scroll',
      'wheel',
      'touchstart',
      'touchmove',
      'touchend',
    ];
    const documentEvents = ['input', 'change', 'submit', 'focusin'];

    for (const eventName of windowEvents) {
      window.addEventListener(eventName, onActivity, { passive: true });
    }
    for (const eventName of documentEvents) {
      document.addEventListener(eventName, onActivity);
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshSessionIfNeeded();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      for (const eventName of windowEvents) {
        window.removeEventListener(eventName, onActivity);
      }
      for (const eventName of documentEvents) {
        document.removeEventListener(eventName, onActivity);
      }
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [isLoaded, isSignedIn, refreshSessionIfNeeded, registerActivity]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    const interval = window.setInterval(() => {
      if (isLoggingOutRef.current) return;
      void (async () => {
        const outcome = await refreshSessionIfNeeded();
        if (!outcome.ok && outcome.shouldLogout) {
          const token = readClientAuthToken();
          const expiry = decodeTokenExpiryMs(token);

          if (token && expiry && expiry > Date.now()) {
            console.warn(
              '[session] Refresh failed but a valid token is still present. Deferring logout.',
            );
          } else {
            await markSessionExpiredAndLogout('refresh_failure');
          }
        } else if (
          !outcome.ok &&
          refreshRetryCountRef.current <= MAX_REFRESH_RETRIES
        ) {
          window.setTimeout(() => {
            void refreshSessionIfNeeded();
          }, REFRESH_RETRY_MS);
        }
      })();
    }, CHECK_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [isLoaded, isSignedIn, markSessionExpiredAndLogout, refreshSessionIfNeeded]);

  const value = useMemo<SessionManagerContextValue>(
    () => ({
      continueSession,
      registerActivity,
    }),
    [continueSession, registerActivity],
  );

  return (
    <SessionManagerContext.Provider value={value}>
      {children}
    </SessionManagerContext.Provider>
  );
}

export function useSessionManager(): SessionManagerContextValue {
  const context = useContext(SessionManagerContext);
  if (!context)
    throw new Error(
      'useSessionManager must be used within SessionManagerProvider.',
    );
  return context;
}
