import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@insforge/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { insforge } from '../api/insforge/client';
import { refreshSessionThroughProxy } from '../api/insforge/sessionState';
import { SESSION_EXPIRED_KEY, SESSION_EXPIRED_MESSAGE_KEY, USER_SIGNED_OUT_KEY } from '../auth/AuthSessionListener';
import { useDraftManager } from './DraftManagerProvider';
import { computeInactivityDecision } from './inactivityDecision';
import { useTenant } from '../tenant/TenantContext';
import { getSessionTimeoutMinutes } from '../api/services/securityService';

const DEFAULT_LOGOUT_TIMEOUT_MS = 8 * 60 * 60 * 1000;
const MIN_LOGOUT_TIMEOUT_MINUTES = 120;
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

type RefreshSessionOutcome =
  | { ok: true }
  | { ok: false; shouldLogout: true; reason: 'invalid_session' }
  | { ok: false; shouldLogout: false; reason: 'transient_failure' };

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
  const { activeCompanyId } = useTenant();
  const { flushAllDrafts } = useDraftManager();
  const [showWarning, setShowWarning] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [logoutTimeoutMs, setLogoutTimeoutMs] = useState(DEFAULT_LOGOUT_TIMEOUT_MS);
  const lastActivityRef = useRef<number>(Date.now());
  const showWarningRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const refreshRetryCountRef = useRef(0);
  const lastExpiresParseFallbackAttemptRef = useRef<number>(0);
  const isLoggingOutRef = useRef(false);
  const hasNavigatedToLoginRef = useRef(false);
  const warningTimeoutMs = useMemo(() => {
    const warningLeadMs = Math.min(15 * 60 * 1000, Math.max(60 * 1000, Math.floor(logoutTimeoutMs / 4)));
    return Math.max(60 * 1000, logoutTimeoutMs - warningLeadMs);
  }, [logoutTimeoutMs]);

  useEffect(() => {
    showWarningRef.current = showWarning;
  }, [showWarning]);

  useEffect(() => {
    let cancelled = false;
    if (!isSignedIn || !activeCompanyId) {
      setLogoutTimeoutMs(DEFAULT_LOGOUT_TIMEOUT_MS);
      return;
    }
    void (async () => {
      try {
        const minutes = await getSessionTimeoutMinutes(activeCompanyId);
        if (!cancelled) {
          const safeMinutes = Math.max(MIN_LOGOUT_TIMEOUT_MINUTES, Number(minutes) || 480);
          setLogoutTimeoutMs(safeMinutes * 60 * 1000);
        }
      } catch {
        if (!cancelled) setLogoutTimeoutMs(DEFAULT_LOGOUT_TIMEOUT_MS);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeCompanyId, isSignedIn]);

  useEffect(() => {
    if (!isSignedIn) return;
    isLoggingOutRef.current = false;
    hasNavigatedToLoginRef.current = false;
    lastActivityRef.current = Date.now();
    setRemainingMs(logoutTimeoutMs);
    setShowWarning(false);
    refreshRetryCountRef.current = 0;
  }, [isSignedIn, logoutTimeoutMs]);

  // Passive activity should not dismiss the inactivity warning modal; users must explicitly choose "Continue Session".
  const registerPassiveActivity = useCallback(() => {
    if (isLoggingOutRef.current) return;
    if (showWarningRef.current) return;
    lastActivityRef.current = Date.now();
    setRemainingMs(logoutTimeoutMs);
  }, [logoutTimeoutMs]);

  const registerActivity = useCallback(() => {
    if (isLoggingOutRef.current) return;
    lastActivityRef.current = Date.now();
    setRemainingMs(logoutTimeoutMs);
    if (showWarningRef.current) setShowWarning(false);
  }, [logoutTimeoutMs]);

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
          : 'Your session has expired. Please log in again.';
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

  const refreshSessionIfNeeded = useCallback(async (): Promise<RefreshSessionOutcome> => {
    if (isLoggingOutRef.current) return refreshSucceeded();
    if (refreshInFlightRef.current) return refreshSucceeded();
    refreshInFlightRef.current = true;
    const existingClientToken = readClientAuthToken();
    const existingClientTokenExpiresAtMs = decodeTokenExpiryMs(existingClientToken);
    let lastKnownToken: string | null = null;
    let lastKnownExpiresAtMs: number | null = null;
    try {
      const current = await insforge.auth.getCurrentSession();
      const existingTokenStillValid =
        !!existingClientToken && !!existingClientTokenExpiresAtMs && existingClientTokenExpiresAtMs > Date.now();
      if (hasMalformedAuthResponse(current)) {
        if (existingClientToken) {
          insforge.getHttpClient().setAuthToken(existingClientToken);
        }
        refreshRetryCountRef.current += 1;
        console.warn('[session] malformed current session response', current);
        return transientRefreshFailure();
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
          return invalidSessionFailure();
        }
        if (existingTokenStillValid) {
          insforge.getHttpClient().setAuthToken(existingClientToken);
          refreshRetryCountRef.current = 0;
          console.warn('[session] current session unavailable; keeping existing client token', currentError);
          return refreshSucceeded();
        }
        if (existingClientToken) {
          insforge.getHttpClient().setAuthToken(existingClientToken);
        }
        refreshRetryCountRef.current += 1;
        console.warn('[session] current session unavailable; treating as transient failure', currentError);
        return transientRefreshFailure();
      }
      if (!token || !currentUserId) {
        if (existingTokenStillValid) {
          insforge.getHttpClient().setAuthToken(existingClientToken);
          refreshRetryCountRef.current = 0;
          console.warn('[session] current session missing required data; keeping existing client token', current);
          return refreshSucceeded();
        }
        if (existingClientToken) {
          insforge.getHttpClient().setAuthToken(existingClientToken);
        }
        refreshRetryCountRef.current += 1;
        console.warn('[session] current session missing required data; treating as transient failure', current);
        return transientRefreshFailure();
      }
      const now = Date.now();
      if (lastKnownExpiresAtMs && lastKnownExpiresAtMs - now > REFRESH_LEEWAY_MS) {
        refreshRetryCountRef.current = 0;
        return refreshSucceeded();
      }
      // If we cannot parse the JWT expiry, we can't reliably know if it's safe to wait.
      // Use a conservative throttle to keep refreshes silent and not overly frequent.
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
        fetch: globalThis.fetch.bind(globalThis)
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
      const tokenStillValid = !!lastKnownExpiresAtMs && lastKnownExpiresAtMs > Date.now();
      const fallbackToken = existingClientToken ?? lastKnownToken;
      if (tokenStillValid && lastKnownToken) {
        insforge.getHttpClient().setAuthToken(lastKnownToken);
        refreshRetryCountRef.current = 0;
        return refreshSucceeded();
      }
      if (fallbackToken) {
        insforge.getHttpClient().setAuthToken(fallbackToken);
      }
      refreshRetryCountRef.current += 1;
      console.warn('[session] refresh failed', refreshed);
      return transientRefreshFailure();
    } catch (error) {
      if (isInvalidSessionError(error)) {
        insforge.getHttpClient().setAuthToken(null);
        refreshRetryCountRef.current = MAX_REFRESH_RETRIES + 1;
        console.warn('[session] refresh rejected', error);
        return invalidSessionFailure();
      }
      // If we have enough info to tell the token hasn't expired yet, treat refresh errors as non-fatal.
      const tokenStillValid = !!lastKnownExpiresAtMs && lastKnownExpiresAtMs > Date.now();
      if (lastKnownToken && tokenStillValid) {
        insforge.getHttpClient().setAuthToken(lastKnownToken);
        refreshRetryCountRef.current = 0;
        return refreshSucceeded();
      }
      if (existingClientToken) {
        insforge.getHttpClient().setAuthToken(existingClientToken);
      }
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
          warningTimeoutMs,
          logoutTimeoutMs
        });
        const remaining = Math.max(0, logoutTimeoutMs - idleMs);
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
  }, [
    isLoaded,
    isSignedIn,
    logoutTimeoutMs,
    markSessionExpiredAndLogout,
    refreshSessionIfNeeded,
    registerPassiveActivity,
    warningTimeoutMs
  ]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    const interval = window.setInterval(() => {
      if (isLoggingOutRef.current) return;
        const idleMs = Date.now() - lastActivityRef.current;
        const { shouldShowWarning, shouldLogout } = computeInactivityDecision({
          idleMs,
          warningTimeoutMs,
          logoutTimeoutMs
        });
        const remaining = Math.max(0, logoutTimeoutMs - idleMs);
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
        const outcome = await refreshSessionIfNeeded();
        if (!outcome.ok && outcome.shouldLogout) {
          await markSessionExpiredAndLogout('refresh_failure');
        } else if (!outcome.ok && refreshRetryCountRef.current <= MAX_REFRESH_RETRIES) {
          window.setTimeout(() => {
            void refreshSessionIfNeeded();
          }, REFRESH_RETRY_MS);
        }
      })();
    }, CHECK_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [isLoaded, isSignedIn, logoutTimeoutMs, markSessionExpiredAndLogout, refreshSessionIfNeeded, warningTimeoutMs]);

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
