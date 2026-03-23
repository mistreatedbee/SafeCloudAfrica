import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@insforge/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { insforge } from '../api/insforge/client';
import { SESSION_EXPIRED_KEY, SESSION_EXPIRED_MESSAGE_KEY, USER_SIGNED_OUT_KEY } from '../auth/AuthSessionListener';
import { useDraftManager } from './DraftManagerProvider';

const WARNING_TIMEOUT_MS = 45 * 60 * 1000;
const LOGOUT_TIMEOUT_MS = 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 15 * 1000;
const REFRESH_LEEWAY_MS = 3 * 60 * 1000;
const REFRESH_RETRY_MS = 12 * 1000;
const MAX_REFRESH_RETRIES = 2;
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
    const parsed = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    if (!parsed.exp) return null;
    return parsed.exp * 1000;
  } catch {
    return null;
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
  const refreshInFlightRef = useRef(false);
  const refreshRetryCountRef = useRef(0);

  const registerActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setRemainingMs(LOGOUT_TIMEOUT_MS);
    if (showWarning) setShowWarning(false);
  }, [showWarning]);

  const markSessionExpiredAndLogout = useCallback(async (reason: 'inactivity' | 'refresh_failure') => {
    console.warn('[session] session expired; reason:', reason);
    debugSession('markSessionExpiredAndLogout', {
      reason,
      refreshRetryCount: refreshRetryCountRef.current
    });
    try {
      sessionStorage.setItem(SESSION_EXPIRED_KEY, '1');
      sessionStorage.setItem(SESSION_EXPIRED_MESSAGE_KEY, 'Your session expired due to inactivity. Please log in again.');
      sessionStorage.removeItem(USER_SIGNED_OUT_KEY);
    } catch {
      // ignore storage access errors
    }
    try {
      await flushAllDrafts();
    } catch {
      // best effort
    }
    await signOut();
    const redirect = encodeURIComponent(location.pathname + location.search);
    navigate(`/login?redirect=${redirect}`, { replace: true });
  }, [flushAllDrafts, location.pathname, location.search, navigate, signOut]);

  const refreshSessionIfNeeded = useCallback(async () => {
    if (refreshInFlightRef.current) return true;
    refreshInFlightRef.current = true;
    let lastKnownToken: string | null = null;
    let lastKnownExpiresAtMs: number | null = null;
    try {
      const current = await insforge.auth.getCurrentSession();
      const token = current.data?.session?.accessToken ?? null;
      lastKnownToken = token;
      lastKnownExpiresAtMs = decodeTokenExpiryMs(token);
      const now = Date.now();
      if (!lastKnownExpiresAtMs || lastKnownExpiresAtMs - now > REFRESH_LEEWAY_MS) {
        refreshRetryCountRef.current = 0;
        return true;
      }
      const authApi = insforge.auth as any;
      if (typeof authApi.refreshSession === 'function') {
        try {
          const refreshed = await authApi.refreshSession();
          const refreshedToken = refreshed?.data?.session?.accessToken ?? null;
          if (refreshedToken) {
            insforge.getHttpClient().setAuthToken(refreshedToken);
            refreshRetryCountRef.current = 0;
            console.info('[session] refresh success');
            return true;
          }
        } catch (error) {
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
        const tokenStillValid = !lastKnownExpiresAtMs || lastKnownExpiresAtMs > Date.now();
        insforge.getHttpClient().setAuthToken(token);
        refreshRetryCountRef.current = tokenStillValid ? 0 : (refreshRetryCountRef.current + 1);
        return tokenStillValid;
      }

      throw new Error('No session token available after refresh attempt.');
    } catch (error) {
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
    const onActivity = () => registerActivity();
    const events: Array<keyof WindowEventMap> = [
      'mousemove',
      'mousedown',
      'click',
      'keydown',
      'scroll',
      'touchstart',
      'touchmove',
      'focus'
    ];
    for (const eventName of events) {
      window.addEventListener(eventName, onActivity, { passive: true });
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        registerActivity();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      for (const eventName of events) {
        window.removeEventListener(eventName, onActivity);
      }
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [isLoaded, isSignedIn, registerActivity]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    const interval = window.setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current;
      const remaining = Math.max(0, LOGOUT_TIMEOUT_MS - idleMs);
      setRemainingMs(remaining);

      if (idleMs >= WARNING_TIMEOUT_MS && idleMs < LOGOUT_TIMEOUT_MS) {
        if (!showWarning) {
          console.info('[session] inactivity warning shown');
        }
        setShowWarning(true);
      }

      if (idleMs >= LOGOUT_TIMEOUT_MS) {
        void markSessionExpiredAndLogout('inactivity');
        return;
      }

      if (!showWarning) {
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
      }
    }, CHECK_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [isLoaded, isSignedIn, markSessionExpiredAndLogout, refreshSessionIfNeeded, showWarning]);

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
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-md rounded-2xl border border-surface-300 bg-white p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-expiring-title"
      >
        <h2 id="session-expiring-title" className="text-lg font-semibold text-charcoal">
          Session Expiring Soon
        </h2>
        <p className="mt-2 text-sm text-charcoal-600">
          Your session is about to expire due to inactivity. Would you like to continue working?
        </p>
        <p className="mt-1 text-xs text-charcoal-500">Time remaining: about {minutes} minute(s).</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={props.onLogout}
            className="min-h-[44px] rounded-lg border border-surface-300 px-4 py-2 text-sm font-medium text-charcoal hover:bg-surface-50"
          >
            Log Out
          </button>
          <button
            type="button"
            onClick={props.onContinue}
            className="min-h-[44px] rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-600"
          >
            Continue Session
          </button>
        </div>
      </div>
    </div>
  );
}
