import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth, useUser } from '@insforge/react';
import { AuthShell } from '../../components/auth/AuthShell';
import { SESSION_EXPIRED_KEY, SESSION_EXPIRED_MESSAGE_KEY } from '../../auth/AuthSessionListener';
import { formatAuthError } from '../../auth/authMessages';
import { recoverAuthState } from '../../auth/recoverAuthState';
import { useTenant } from '../../tenant/TenantContext';
import { ensureMeAsSuperAdmin, isPlatformAdmin, getLoginRedirectPath } from '../../api/services/platformAdminService';
import { insforge, insforgeReady } from '../../api/insforge/client';
import type { UUID } from '../../api/models/entities';

const LOGIN_FAILED_MESSAGE = 'Login failed. Please check your details or contact support.';
const ACTIVE_COMPANY_KEY = 'sca_active_company_id_v3';
const SESSION_RESOLVE_RETRIES = 4;
const SESSION_RESOLVE_DELAY_MS = 200;
const TENANT_REFRESH_MAX_WAIT_MS = 1500;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
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

function readAuthSession(result: unknown): { accessToken: string | null; userId: string | null } {
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

function redirectToPath(path: string): void {
  window.location.replace(path);
}

export function LoginPage() {
  const { isLoaded, isSignedIn, signIn, signOut } = useAuth();
  const { user } = useUser();
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
      return sessionStorage.getItem(SESSION_EXPIRED_MESSAGE_KEY) || 'Your session expired. Please log in again.';
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
    const initialSession = readAuthSession(initialResult);
    if (initialSession.accessToken) {
      insforge.getHttpClient().setAuthToken(initialSession.accessToken);
    }
    if (initialSession.userId) return initialSession.userId as UUID;

    for (let attempt = 0; attempt < SESSION_RESOLVE_RETRIES; attempt += 1) {
      if (attempt > 0) await wait(SESSION_RESOLVE_DELAY_MS);
      const currentSessionResult = await insforge.auth.getCurrentSession().catch(() => null);
      const nextSession = readAuthSession(currentSessionResult);
      if (nextSession.accessToken) {
        insforge.getHttpClient().setAuthToken(nextSession.accessToken);
      }
      if (nextSession.userId) return nextSession.userId as UUID;
    }

    return null;
  }, []);

  const redirectAfterLogin = React.useCallback(async (resolvedUserId: UUID) => {
    setAuthError(null);
    setRedirectError(null);
    setRedirecting(true);
    try {
      await ensureMeAsSuperAdmin();
      const isSA = await isPlatformAdmin(resolvedUserId);
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
      const { path: defaultPath, organizationId, reason } = await getLoginRedirectPath(resolvedUserId, storedCompanyId);
      if (organizationId) setActiveCompanyId(organizationId);
      const target = defaultPath;
      const pathWithReason = reason
        ? (target.includes('?') ? `${target}&reason=${reason}` : `${target}?reason=${reason}`)
        : target;
      await Promise.race([
        refreshTenant(),
        wait(TENANT_REFRESH_MAX_WAIT_MS)
      ]);
      redirectToPath(pathWithReason);
    } catch {
      await recoverAuthState(signOut, refreshTenant);
      setRedirectError(LOGIN_FAILED_MESSAGE);
      setRedirecting(false);
    }
  }, [refreshTenant, setActiveCompanyId, signOut]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user?.id) return;
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
  }, [isLoaded, isSignedIn, redirectAfterLogin, user?.id]);

  const activated = searchParams.get('activated') === '1';

  const handleSignInError = (error: unknown) => {
    setRedirecting(false);
    setRedirectError(null);
    setAuthError(`${LOGIN_FAILED_MESSAGE} ${formatAuthError(error)}`);
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
      const signInResult = await signIn(normalizedEmail, password);
      const error = (signInResult as any)?.error ?? null;

      if (error) {
        handleSignInError(error);
        return;
      }

      const resolvedUserId = await resolveSignedInUserId(signInResult);
      if (resolvedUserId) {
        await redirectAfterLogin(resolvedUserId);
        return;
      }

      setRedirecting(true);
      redirectToPath('/app');
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
