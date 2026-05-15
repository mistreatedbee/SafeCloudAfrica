import React, { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useInsforge } from '@insforge/react';
import { insforge } from '../api/insforge/client';
import { getCurrentAuthSession, readAuthSessionResult, saveStoredSession } from '../api/insforge/sessionState';

const AUTH_BOOTSTRAP_DEBUG = (import.meta as any)?.env?.VITE_AUTH_BOOTSTRAP_DEBUG === '1';

function debugAuthGuard(event: string, details?: Record<string, unknown>): void {
  if (!AUTH_BOOTSTRAP_DEBUG) return;
  console.debug('[auth-guard]', event, details ?? {});
}

export function RequireSignedIn({ children }: { children: React.ReactElement }) {
  const { isLoaded, isSignedIn, reloadAuth, setUser } = useInsforge();
  const location = useLocation();
  const attemptedSdkBridgeRef = useRef(false);
  const [checkingSdkSession, setCheckingSdkSession] = useState(false);

  useEffect(() => {
    if (!isLoaded || isSignedIn || attemptedSdkBridgeRef.current) return;
    attemptedSdkBridgeRef.current = true;
    let cancelled = false;
    setCheckingSdkSession(true);
    void (async () => {
      try {
        debugAuthGuard('bridge:start', { path: location.pathname });
        const result = await getCurrentAuthSession(insforge.auth as any);
        if (cancelled) return;
        const session = readAuthSessionResult(result, { allowStoredTokenFallback: true });
        if (session.accessToken && session.userId) {
          insforge.getHttpClient().setAuthToken(session.accessToken);
          saveStoredSession(session.accessToken, session.user);
          if (session.user && typeof session.user === 'object') {
            setUser(session.user as any);
          }
          await reloadAuth().catch(() => null);
          debugAuthGuard('bridge:session-restored', { hasUserId: true });
        } else {
          debugAuthGuard('bridge:no-session', {
            hasToken: !!session.accessToken,
            hasUserId: !!session.userId
          });
        }
      } catch (error) {
        debugAuthGuard('bridge:error', {
          message: String((error as any)?.message ?? error ?? '')
        });
      } finally {
        if (!cancelled) setCheckingSdkSession(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, location.pathname, reloadAuth, setUser]);

  const shouldTrySdkBridge = isLoaded && !isSignedIn && !attemptedSdkBridgeRef.current;

  if (!isLoaded || checkingSdkSession || shouldTrySdkBridge) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-surface-300 shadow-card p-6 w-full max-w-md">
          <p className="text-sm font-semibold text-charcoal">Loading…</p>
          <p className="text-sm text-charcoal-500 mt-1">Preparing your session.</p>
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }
  return children;
}

