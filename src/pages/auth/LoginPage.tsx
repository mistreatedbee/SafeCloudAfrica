import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth, useUser } from '@insforge/react';
import { AuthShell } from '../../components/auth/AuthShell';
import { SESSION_EXPIRED_KEY, SESSION_EXPIRED_MESSAGE_KEY } from '../../auth/AuthSessionListener';
import { formatAuthError } from '../../auth/authMessages';
import { recoverAuthState } from '../../auth/recoverAuthState';
import { useTenant } from '../../tenant/TenantContext';
import { ensureInsforgeSession, InsforgeAuthBootstrapError } from '../../api/insforge/ensureSession';
import { ensureMeAsSuperAdmin, isPlatformAdmin, getLoginRedirectPath } from '../../api/services/platformAdminService';
import { insforge, insforgeReady } from '../../api/insforge/client';
import {
  getCurrentAuthSession,
  isInvalidSessionError,
  readAuthSessionResult,
  saveStoredSession
} from '../../api/insforge/sessionState';
import type { UUID } from '../../api/models/entities';

const LOGIN_FAILED_MESSAGE = 'Login failed. Please check your details or contact support.';
const LOGIN_SETUP_MESSAGE = 'You are signed in, but we could not finish opening your dashboard. Please try again.';
const ACTIVE_COMPANY_KEY = 'sca_active_company_id_v3';
const SESSION_RESOLVE_RETRIES = 4;
const SESSION_RESOLVE_DELAY_MS = 200;
const TENANT_REFRESH_MAX_WAIT_MS = 1500;
const AUTH_BOOTSTRAP_DEBUG = (import.meta as any)?.env?.VITE_AUTH_BOOTSTRAP_DEBUG === '1';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function redirectToPath(path: string): void {
  window.location.replace(path);
}

function debugLogin(event: string, details?: Record<string, unknown>): void {
  if (!AUTH_BOOTSTRAP_DEBUG) return;
  console.debug('[login-bootstrap]', event, details ?? {});
}

async function resolveUserFromBearerToken(accessToken: string): Promise<{ userId: UUID; user: unknown } | null> {
  const response = await fetch('/api/auth/me', {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0'
    }
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  const user = (payload as any)?.user ?? payload;
  const userId =
    typeof user?.id === 'string' && user.id.trim()
      ? user.id.trim()
      : typeof (payload as any)?.user_id === 'string' && (payload as any).user_id.trim()
        ? (payload as any).user_id.trim()
        : typeof (payload as any)?.id === 'string' && (payload as any).id.trim()
          ? (payload as any).id.trim()
          : null;
  return userId ? { userId: userId as UUID, user } : null;
}

export function LoginPage() {
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const { user, setUser } = useUser();
  const { setActiveCompanyId, refreshTenant } = useTenant();
  const [searchParams] = useSearchParams();
  const [redirecting, setRedirecting] = useState(false);
  const [redirectError, setRedirectError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sessionExpiredMessage] = useState(() => {
    try {
      if (typeof sessionStorage === 'undefined') return null;
      if (sessionStorage.getItem(SESSION_EXPIRED_KEY) !== '1') return null;
      return sessionStorage.getItem(SESSION_EXPIRED_MESSAGE_KEY) || 'Your session has expired. Please log in again.';
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (sessionExpiredMessage) {
      try {
        sessionStorage.removeItem(SESSION_EXPIRED_KEY);
        sessionStorage.removeItem(SESSION_EXPIRED_MESSAGE_KEY);
      } catch {
        // ignore
      }
    }
  }, [sessionExpiredMessage]);

  const resolveSignedInUserId = React.useCallback(async (initialResult: unknown): Promise<UUID | null> => {
    const initialSession = readAuthSessionResult(initialResult, { allowStoredTokenFallback: true });
    if (initialSession.accessToken) {
      insforge.getHttpClient().setAuthToken(initialSession.accessToken);
      saveStoredSession(initialSession.accessToken, initialSession.user);
    }
    if (initialSession.user && typeof initialSession.user === 'object') {
      setUser(initialSession.user as any);
    }
    if (initialSession.userId) return initialSession.userId as UUID;
    if (initialSession.accessToken) {
      const resolvedUser = await resolveUserFromBearerToken(initialSession.accessToken).catch(() => null);
      if (resolvedUser) {
        saveStoredSession(initialSession.accessToken, resolvedUser.user);
        setUser(resolvedUser.user as any);
        return resolvedUser.userId;
      }
    }

    for (let attempt = 0; attempt < SESSION_RESOLVE_RETRIES; attempt += 1) {
      if (attempt > 0) await wait(SESSION_RESOLVE_DELAY_MS);
      const currentSessionResult = await getCurrentAuthSession(insforge.auth as any).catch(() => null);
      const nextSession = readAuthSessionResult(currentSessionResult, { allowStoredTokenFallback: true });
      if (nextSession.accessToken) {
        insforge.getHttpClient().setAuthToken(nextSession.accessToken);
        saveStoredSession(nextSession.accessToken, nextSession.user);
      }
      if (nextSession.user && typeof nextSession.user === 'object') {
        setUser(nextSession.user as any);
      }
      if (nextSession.userId) return nextSession.userId as UUID;
    }

    return null;
  }, [setUser]);

  const redirectAfterLogin = React.useCallback(async (resolvedUserId: UUID) => {
    setAuthError(null);
    setRedirectError(null);
    setRedirecting(true);
    try {
      await insforgeReady;
      const session = await ensureInsforgeSession({ reason: 'login:redirect-after-login' });
      const sessionUserId = session.userId as UUID;
      const ensureSaResult = await ensureMeAsSuperAdmin();
      if (ensureSaResult.status === 'auth_failed') {
        throw ensureSaResult.error;
      }
      const effectiveUserId = sessionUserId || resolvedUserId;
      const isSA = await isPlatformAdmin(effectiveUserId);
      if (isSA) {
        await refreshTenant();
        redirectToPath('/super-admin/overview');
        return;
      }
      const storedCompanyId = (() => {
        try {
          return (localStorage.getItem(ACTIVE_COMPANY_KEY) as UUID | null) ?? null;
        } catch {
          return null;
        }
      })();
      const { path: defaultPath, organizationId, reason } = await getLoginRedirectPath(effectiveUserId, storedCompanyId);
      if (organizationId) setActiveCompanyId(organizationId);
      const target = defaultPath;
      const pathWithReason = reason
        ? (target.includes('?') ? `${target}&reason=${reason}` : `${target}?reason=${reason}`)
        : target;
      const redirectParam = searchParams.get('redirect');
      const safeRedirect =
        redirectParam &&
        redirectParam.startsWith('/') &&
        !redirectParam.startsWith('//')
          ? redirectParam
          : null;
      const finalPath = safeRedirect ?? pathWithReason;
      await Promise.race([
        refreshTenant(),
        wait(TENANT_REFRESH_MAX_WAIT_MS)
      ]);
      redirectToPath(finalPath);
    } catch (error) {
      debugLogin('redirect-after-login:error', {
        invalidSession: isInvalidSessionError(error),
        bootstrapError: error instanceof InsforgeAuthBootstrapError,
        message: String((error as any)?.message ?? error ?? '')
      });
      if (error instanceof InsforgeAuthBootstrapError || isInvalidSessionError(error)) {
        await recoverAuthState(signOut, refreshTenant);
        setRedirectError(LOGIN_FAILED_MESSAGE);
      } else {
        setRedirectError(LOGIN_SETUP_MESSAGE);
      }
      setRedirecting(false);
    }
  }, [refreshTenant, searchParams, setActiveCompanyId, signOut]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user?.id || redirecting || submitting) return;
    let cancelled = false;
    (async () => {
      try {
        if (cancelled) return;
        await redirectAfterLogin(user.id as UUID);
      } finally {
        if (!cancelled && !isSignedIn) setRedirecting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, redirectAfterLogin, redirecting, submitting, user?.id]);

  const activated = searchParams.get('activated') === '1';

  const handleSignInError = (error: unknown) => {
    setRedirecting(false);
    setRedirectError(null);
    setAuthError(formatAuthError(error));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setAuthError('Please enter your email address and password.');
      return;
    }

    setSubmitting(true);
    setAuthError(null);
    setRedirectError(null);

    try {
      await insforgeReady;
      debugLogin('sign-in:start', { email: normalizedEmail });
      const signInResult = await (insforge.auth as any).signInWithPassword({
        email: normalizedEmail,
        password
      });
      const error = (signInResult as any)?.error ?? null;

      if (error) {
        debugLogin('sign-in:error', {
          message: String((error as any)?.message ?? error ?? ''),
          status: (error as any)?.status ?? (error as any)?.statusCode
        });
        handleSignInError(error);
        return;
      }

      const resolvedUserId = await resolveSignedInUserId(signInResult);
      if (resolvedUserId) {
        debugLogin('sign-in:resolved-user', { hasUserId: true });
        await redirectAfterLogin(resolvedUserId);
        return;
      }

      debugLogin('sign-in:missing-user');
      await recoverAuthState(signOut, refreshTenant);
      setRedirectError(LOGIN_FAILED_MESSAGE);
    } catch (error) {
      handleSignInError(error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Sign in"
      subtitle="Enter your email and password below to access your company workspace."
      sideTitle="Safe Cloud Africa"
    >
      {sessionExpiredMessage && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
          {sessionExpiredMessage}
        </div>
      )}
      {activated && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
          License activated. Please log in to continue.
        </div>
      )}
      {authError && (
        <div className="mb-4 rounded-lg bg-critical/10 border border-critical/20 px-3 py-2 text-sm text-critical">
          {authError}
        </div>
      )}
      {redirectError && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
          {redirectError}
        </div>
      )}
      {redirecting ? (
        <p className="text-sm text-charcoal-500">Redirecting...</p>
      ) : (
        <>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-charcoal mb-1">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                placeholder="you@company.com"
                disabled={submitting}
                required
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between gap-3">
                <label htmlFor="login-password" className="block text-sm font-medium text-charcoal">
                  Password
                </label>
                <Link to="/forgot-password" className="text-xs font-semibold text-teal hover:text-teal-700">
                  Forgot password?
                </Link>
              </div>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                placeholder="Enter your password"
                disabled={submitting}
                required
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="mt-1 text-xs text-charcoal-500">Use the same email and password you used to register.</p>

          <div className="mt-6 flex items-center justify-between text-sm">
            <Link to="/register" className="text-teal font-semibold hover:text-teal-700">
              Create an account
            </Link>
            <Link to="/" className="text-charcoal-500 hover:text-charcoal">
              Back to landing page
            </Link>
          </div>
        </>
      )}
    </AuthShell>
  );
}
