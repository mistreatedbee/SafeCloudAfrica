import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@insforge/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { insforge } from '../api/insforge/client';
import { SESSION_EXPIRED_KEY, SESSION_EXPIRED_MESSAGE_KEY, USER_SIGNED_OUT_KEY } from '../auth/AuthSessionListener';
import { useDraftManager } from './DraftManagerProvider';
import { computeInactivityDecision } from './inactivityDecision';

const WARNING_TIMEOUT_MS = 45 * 60 * 1000;
const LOGOUT_TIMEOUT_MS = 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 15 * 1000;
const REFRESH_LEEWAY_MS = 5 * 60 * 1000;
const REFRESH_RETRY_MS = 12 * 1000;
const MAX_REFRESH_RETRIES = 2;
const EXPIRES_PARSE_THROTTLE_MS = 5 * 60 * 1000;
const SESSION_DEBUG = (import.meta as any)?.env?.VITE_SESSION_DEBUG === '1';
function debugSession(...args: unknown[]) {
  if (!SESSION_DEBUG) return;
  // Using console.debug so devtools can filter these separately from warnings/errors.
  console.debug('[session-debug]', ...args);
}

type SessionManagerContextValue = {
  continueSession: () => Promise<void>;
  registerActivity: () => void;
};

const SessionManagerContext = createContext<SessionManagerContextValue | null>(null);

function decodeTokenExpiryMs(token: string | null | undefined): number | null {
  if (!token) return null;
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    // JWT uses base64url encoding, which may omit '=' padding; `atob` expects padded base64.
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
  const raw = Number((error as any)?.statusCode ?? (error as any)?.status ?? 0);
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
    return typeof parsed.sub === 'string' && parsed.sub.trim() ? parsed.sub : null;
  } catch {
    return null;
  }
}

function readClientAuthToken(): string | null {
  try {
    const headers = insforge.getHttpClient().getHeaders();
    const authHeader = String(headers.Authorization ?? headers.authorization ?? '').trim();
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
  return {
    accessToken,
    userId
  };
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
      ''
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

function clearClientSessionState(): void {
  try {
    insforge.getHttpClient().setAuthToken(null);
  } catch {
    // ignore client cleanup errors
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
    // ignore storage cleanup errors
  }
}

export function SessionManagerProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const { flushAllDrafts } = useDraftManager();
  const [showWarning, setShowWarning] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const showWarningRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const refreshRetryCountRef = useRef(0);
  const lastExpiresParseFallbackAttemptRef = useRef<number>(0);
  const isLoggingOutRef = useRef(false);
  const hasNavigatedToLoginRef = useRef(false);

  useEffect(() => {
    showWarningRef.current = showWarning;
  }, [showWarning]);

  useEffect(() => {
    if (!isSignedIn) return;
    isLoggingOutRef.current = false;
    hasNavigatedToLoginRef.current = false;
  }, [isSignedIn]);

  // Passive activity should not dismiss the inactivity warning modal; users must explicitly choose "Continue Session".
  const registerPassiveActivity = useCallback(() => {
    if (isLoggingOutRef.current) return;
    if (showWarningRef.current) return;
    lastActivityRef.current = Date.now();
    setRemainingMs(LOGOUT_TIMEOUT_MS);
  }, []);

  const registerActivity = useCallback(() => {
    if (isLoggingOutRef.current) return;
    lastActivityRef.current = Date.now();
    setRemainingMs(LOGOUT_TIMEOUT_MS);
    if (showWarningRef.current) setShowWarning(false);
  }, []);

  const markSessionExpiredAndLogout = useCallback(async (reason: 'inactivity' | 'refresh_failure') => {
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;
    console.warn('[session] session expired; reason:', reason);
    debugSession('markSessionExpiredAndLogout', {
      reason,
      refreshRetryCount: refreshRetryCountRef.current
    });
    try {
      sessionStorage.setItem(SESSION_EXPIRED_KEY, '1');
      const message =
        reason === 'inactivity'
          ? 'Your session expired due to inactivity. Please log in again.'
          : 'Your session expired. Please log in again.';
      sessionStorage.setItem(SESSION_EXPIRED_MESSAGE_KEY, message);
      sessionStorage.removeItem(USER_SIGNED_OUT_KEY);
    } catch {
      // ignore storage access errors
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
      const redirect = encodeURIComponent(location.pathname + location.search);
      navigate(`/login?redirect=${redirect}`, { replace: true });
    }
  }, [flushAllDrafts, location.pathname, location.search, navigate, signOut]);

  const refreshSessionIfNeeded = useCallback(async () => {
    if (isLoggingOutRef.current) return false;
    if (refreshInFlightRef.current) return true;
    refreshInFlightRef.current = true;
    let lastKnownToken: string | null = null;
    let lastKnownExpiresAtMs: number | null = null;
    try {
      const current = await insforge.auth.getCurrentSession();
      const existingClientToken = readClientAuthToken();
      const existingClientTokenExpiresAtMs = decodeTokenExpiryMs(existingClientToken);
      if (hasMalformedAuthResponse(current)) {
        refreshRetryCountRef.current = MAX_REFRESH_RETRIES + 1;
        console.warn('[session] malformed current session response', current);
        return false;
      }
      const currentError = current.error ?? null;
      const { accessToken: token, userId: currentUserId } = readAuthSession(current);
      lastKnownToken = token;
      lastKnownExpiresAtMs = decodeTokenExpiryMs(token);
      if (currentError) {
        if (isInvalidSessionError(currentError)) {
          insforge.getHttpClient().setAuthToken(null);
          refreshRetryCountRef.current = MAX_REFRESH_RETRIES + 1;
          console.warn('[session] current session rejected', currentError);
          return false;
        }
        const existingTokenStillValid = !!existingClientToken && !!existingClientTokenExpiresAtMs && existingClientTokenExpiresAtMs > Date.now();
        if (existingTokenStillValid) {
          insforge.getHttpClient().setAuthToken(existingClientToken);
          refreshRetryCountRef.current = 0;
          console.warn('[session] current session unavailable; keeping existing client token', currentError);
          return true;
        }
      }
      if (!token || !currentUserId) {
        const existingTokenStillValid = !!existingClientToken && !!existingClientTokenExpiresAtMs && existingClientTokenExpiresAtMs > Date.now();
        if (existingTokenStillValid) {
          insforge.getHttpClient().setAuthToken(existingClientToken);
          refreshRetryCountRef.current = 0;
          console.warn('[session] current session missing required data; keeping existing client token', current);
          return true;
        }
        refreshRetryCountRef.current = MAX_REFRESH_RETRIES + 1;
        console.warn('[session] current session missing required data', current);
        return false;
      }
      const now = Date.now();
      if (lastKnownExpiresAtMs && lastKnownExpiresAtMs - now > REFRESH_LEEWAY_MS) {
        refreshRetryCountRef.current = 0;
        return true;
      }
      const authApi = insforge.auth as any;
      if (typeof authApi.refreshSession === 'function') {
        // If we cannot parse the JWT expiry, we can't reliably know if it's safe to wait.
        // Use a conservative throttle to keep refreshes silent and not overly frequent.
        if (!lastKnownExpiresAtMs) {
          const sinceLast = now - lastExpiresParseFallbackAttemptRef.current;
          if (sinceLast < EXPIRES_PARSE_THROTTLE_MS) {
            refreshRetryCountRef.current = 0;
            return true;
          }
          lastExpiresParseFallbackAttemptRef.current = now;
        }
        try {
          const refreshed = await authApi.refreshSession();
          if (hasMalformedAuthResponse(refreshed)) {
            insforge.getHttpClient().setAuthToken(null);
            refreshRetryCountRef.current = MAX_REFRESH_RETRIES + 1;
            console.warn('[session] malformed refresh response', refreshed);
            return false;
          }
          const { accessToken: refreshedToken, userId: refreshedUserId } = readAuthSession(refreshed);
          if (refreshedToken && refreshedUserId) {
            insforge.getHttpClient().setAuthToken(refreshedToken);
            refreshRetryCountRef.current = 0;
            console.info('[session] refresh success');
            return true;
          }
          if (isInvalidSessionError(refreshed?.error)) {
            insforge.getHttpClient().setAuthToken(null);
            refreshRetryCountRef.current = MAX_REFRESH_RETRIES + 1;
            console.warn('[session] refresh rejected', refreshed?.error);
            return false;
          }
          insforge.getHttpClient().setAuthToken(null);
          refreshRetryCountRef.current = MAX_REFRESH_RETRIES + 1;
          console.warn('[session] refresh returned no usable session', refreshed);
          return false;
        } catch (error) {
          if (isInvalidSessionError(error)) {
            insforge.getHttpClient().setAuthToken(null);
            refreshRetryCountRef.current = MAX_REFRESH_RETRIES + 1;
            console.warn('[session] refresh rejected', error);
            return false;
          }
          // If refresh fails but the existing token is still valid, don't force a logout.
          // Network hiccups should not interrupt the user session while the JWT is alive.
          const tokenStillValid = !!lastKnownExpiresAtMs && lastKnownExpiresAtMs > Date.now();
          if (tokenStillValid && lastKnownToken) {
            insforge.getHttpClient().setAuthToken(lastKnownToken);
            refreshRetryCountRef.current = 0;
            return true;
          }
          refreshRetryCountRef.current += 1;
          console.warn('[session] refresh failed', error);
          return false;
        }
      }

      // Fallback path if SDK only supports getCurrentSession auto-refresh internally.
      if (token) {
        // If we can't decode expiry, prefer to rely on SDK behavior rather than forcing logout.
        const tokenStillValid = !lastKnownExpiresAtMs || lastKnownExpiresAtMs > Date.now();
        insforge.getHttpClient().setAuthToken(token);
        refreshRetryCountRef.current = tokenStillValid ? 0 : (refreshRetryCountRef.current + 1);
        return tokenStillValid;
      }

      throw new Error('No session token available after refresh attempt.');
    } catch (error) {
      if (isInvalidSessionError(error)) {
        insforge.getHttpClient().setAuthToken(null);
        refreshRetryCountRef.current = MAX_REFRESH_RETRIES + 1;
        console.warn('[session] refresh rejected', error);
        return false;
      }
      // If we have enough info to tell the token hasn't expired yet, treat refresh errors as non-fatal.
      const tokenStillValid = !!lastKnownExpiresAtMs && lastKnownExpiresAtMs > Date.now();
      if (lastKnownToken && tokenStillValid) {
        insforge.getHttpClient().setAuthToken(lastKnownToken);
        refreshRetryCountRef.current = 0;
        return true;
      }

      refreshRetryCountRef.current += 1;
      console.warn('[session] refresh failed', error);
      return false;
    } finally {
      refreshInFlightRef.current = false;
    }
  }, []);

  const continueSession = useCallback(async () => {
    if (isLoggingOutRef.current) return;
    registerActivity();
    const ok = await refreshSessionIfNeeded();
    if (!ok && refreshRetryCountRef.current > MAX_REFRESH_RETRIES) {
      await markSessionExpiredAndLogout('refresh_failure');
      return;
    }
    setShowWarning(false);
  }, [markSessionExpiredAndLogout, refreshSessionIfNeeded, registerActivity]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (isLoggingOutRef.current) return;
    const onActivity = () => registerPassiveActivity();
    // Activity signals: track meaningful user interaction to reset inactivity timers.
    // Keep listeners at the document/window level so they work across all routes.
    const windowEvents = [
      'mousemove',
      'mousedown',
      'click',
      'keydown',
      'scroll',
      'wheel',
      'touchstart',
      'touchmove',
      'touchend'
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
        // Background tabs can throttle timers; when returning to the app,
        // immediately enforce inactivity rules instead of treating this as activity.
        const idleMs = Date.now() - lastActivityRef.current;
        const { shouldShowWarning, shouldLogout } = computeInactivityDecision({
          idleMs,
          warningTimeoutMs: WARNING_TIMEOUT_MS,
          logoutTimeoutMs: LOGOUT_TIMEOUT_MS
        });
        const remaining = Math.max(0, LOGOUT_TIMEOUT_MS - idleMs);
        setRemainingMs(remaining);

        if (shouldLogout) {
          void markSessionExpiredAndLogout('inactivity');
          return;
        }

        if (shouldShowWarning) {
          setShowWarning(true);
          return;
        }

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
  }, [isLoaded, isSignedIn, registerPassiveActivity, markSessionExpiredAndLogout, refreshSessionIfNeeded]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    const interval = window.setInterval(() => {
      if (isLoggingOutRef.current) return;
      const idleMs = Date.now() - lastActivityRef.current;
      const { shouldShowWarning, shouldLogout } = computeInactivityDecision({
        idleMs,
        warningTimeoutMs: WARNING_TIMEOUT_MS,
        logoutTimeoutMs: LOGOUT_TIMEOUT_MS
      });
      const remaining = Math.max(0, LOGOUT_TIMEOUT_MS - idleMs);
      setRemainingMs(remaining);

      if (shouldLogout) {
        void markSessionExpiredAndLogout('inactivity');
        return;
      }

      if (shouldShowWarning) {
        if (!showWarningRef.current) {
          console.info('[session] inactivity warning shown');
        }
        setShowWarning(true);
      } else if (showWarningRef.current) {
        setShowWarning(false);
      }

      void (async () => {
        const ok = await refreshSessionIfNeeded();
        if (!ok && refreshRetryCountRef.current <= MAX_REFRESH_RETRIES) {
          window.setTimeout(() => {
            void refreshSessionIfNeeded();
          }, REFRESH_RETRY_MS);
        } else if (!ok) {
          await markSessionExpiredAndLogout('refresh_failure');
        }
      })();
    }, CHECK_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [isLoaded, isSignedIn, markSessionExpiredAndLogout, refreshSessionIfNeeded]);

  const value = useMemo<SessionManagerContextValue>(
    () => ({
      continueSession,
      registerActivity
    }),
    [continueSession, registerActivity]
  );

  return (
    <SessionManagerContext.Provider value={value}>
      {children}
      {showWarning && (
        <SessionInactivityModal
          remainingMs={remainingMs}
          onContinue={() => void continueSession()}
          onLogout={() => void markSessionExpiredAndLogout('inactivity')}
        />
      )}
    </SessionManagerContext.Provider>
  );
}

export function useSessionManager(): SessionManagerContextValue {
  const context = useContext(SessionManagerContext);
  if (!context) throw new Error('useSessionManager must be used within SessionManagerProvider.');
  return context;
}

function SessionInactivityModal(props: { remainingMs: number | null; onContinue: () => void; onLogout: () => void }) {
  const minutes = Math.max(0, Math.ceil((props.remainingMs ?? 0) / 60000));
  const modalRef = useRef<HTMLDivElement | null>(null);
  const continueButtonRef = useRef<HTMLButtonElement | null>(null);
  const logoutButtonRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    // Focus the primary action for immediate keyboard users.
    const raf = window.requestAnimationFrame(() => {
      continueButtonRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(raf);
      const el = previouslyFocusedRef.current;
      if (el && typeof el.focus === 'function') el.focus();
    };
  }, []);

  function onDialogKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab') return;

    const continueBtn = continueButtonRef.current;
    const logoutBtn = logoutButtonRef.current;
    if (!continueBtn || !logoutBtn) return;

    const focusables = [continueBtn, logoutBtn];
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;

    const isActiveInside = !!(active && modalRef.current?.contains(active));

    if (e.shiftKey) {
      // Shift+Tab cycles backward from the first button.
      if (!isActiveInside || active === first) {
        e.preventDefault();
        last.focus();
      }
      return;
    }

    // Tab cycles forward from the last button.
    if (!isActiveInside || active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" />
      <div
        ref={modalRef}
        className="relative w-full max-w-md rounded-2xl border border-surface-300 bg-white p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-expiring-title"
        aria-describedby="session-expiring-description session-expiring-time"
        onKeyDown={onDialogKeyDown}
      >
        <h2 id="session-expiring-title" className="text-lg font-semibold text-charcoal">
          Session Expiring Soon
        </h2>
        <p id="session-expiring-description" className="mt-2 text-sm text-charcoal-600">
          Your session is about to expire due to inactivity. Would you like to continue working?
        </p>
        <p id="session-expiring-time" className="mt-1 text-xs text-charcoal-500">
          Time remaining: about {minutes} minute(s).
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            ref={continueButtonRef}
            type="button"
            onClick={props.onContinue}
            className="min-h-[44px] rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-600"
          >
            Continue Session
          </button>
          <button
            type="button"
            onClick={props.onLogout}
            className="min-h-[44px] rounded-lg border border-surface-300 px-4 py-2 text-sm font-medium text-charcoal hover:bg-surface-50"
            ref={logoutButtonRef}
          >
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
}
