import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@insforge/react';
import { AuthShell } from '../../components/auth/AuthShell';
import { SESSION_EXPIRED_KEY, SESSION_EXPIRED_MESSAGE_KEY } from '../../auth/AuthSessionListener';
import { formatAuthError } from '../../auth/authMessages';
import { recoverAuthState } from '../../auth/recoverAuthState';
import { useTenant } from '../../tenant/TenantContext';
import { ensureInsforgeSession } from '../../api/insforge/ensureSession';
import { ensureMeAsSuperAdmin, isPlatformAdmin, getDashboardRoute, getLoginRedirectPath } from '../../api/services/platformAdminService';
import { acceptInviteByToken, PendingInviteAcceptanceError } from '../../api/services/tenantService';
import { insforge, insforgeReady } from '../../api/insforge/client';
import type { UUID } from '../../api/models/entities';
import {
  clearPendingInviteContext,
  consumePendingAuthRedirect,
  getPendingInviteContext,
  getPendingInviteContextFromRedirect,
  savePendingInviteContext,
  type PendingInviteContext
} from '../../auth/pendingAuthRedirect';
import { acceptPendingInviteAndActivateWorkspace } from '../../auth/acceptPendingInviteWorkspace';

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

function isInviteAlreadyAcceptedError(error: unknown): boolean {
  const message = String((error as any)?.message ?? error ?? '').toLowerCase();
  return message.includes('invite_accepted') || message.includes('already been accepted');
}

export function LoginPage() {
  const { signIn, signOut } = useAuth();
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

      const redirectParam = searchParams.get('redirect');
      const redirectInviteContext = getPendingInviteContextFromRedirect(redirectParam);
      if (redirectInviteContext) {
        savePendingInviteContext(redirectInviteContext);
      }
      const pendingInviteContext: PendingInviteContext | null = redirectInviteContext ?? getPendingInviteContext();
      let returnToInvitePathAfterEmailFallback: string | null = null;

      if (pendingInviteContext) {
        try {
          const membership = await acceptInviteByToken({
            token: pendingInviteContext.token,
            userId: effectiveUserId
          });
          setActiveCompanyId(membership.company_id);
          await Promise.race([
            refreshTenant(),
            wait(TENANT_REFRESH_MAX_WAIT_MS)
          ]);
          clearPendingInviteContext();
          redirectToPath(getDashboardRoute(membership.role));
          return;
        } catch (error) {
          if (!isInviteAlreadyAcceptedError(error)) {
            returnToInvitePathAfterEmailFallback = pendingInviteContext.redirectPath;
          }
          clearPendingInviteContext();
        }
      }

      let pendingEmailInviteResult = null;
      try {
        pendingEmailInviteResult = await acceptPendingInviteAndActivateWorkspace({
          userId: effectiveUserId,
          setActiveCompanyId,
          refreshTenant
        });
      } catch (error) {
        if (error instanceof PendingInviteAcceptanceError) {
          setRedirectError(error.message);
          setRedirecting(false);
          return;
        }
        throw error;
      }
      if (pendingEmailInviteResult?.status === 'accepted') {
        redirectToPath(pendingEmailInviteResult.redirectPath);
        return;
      }

      if (returnToInvitePathAfterEmailFallback) {
        redirectToPath(returnToInvitePathAfterEmailFallback);
        return;
      }

      if (redirectParam && !redirectInviteContext) {
        try {
          const url = new URL(redirectParam, window.location.origin);
          if (url.origin === window.location.origin) {
            redirectToPath(redirectParam);
            return;
          }
        } catch {
          // invalid URL — fall through to normal redirect
        }
      }

      const pendingAuthRedirect = consumePendingAuthRedirect();
      if (pendingAuthRedirect) {
        redirectToPath(pendingAuthRedirect);
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
  }, [searchParams, refreshTenant, setActiveCompanyId, signOut]);

  const activated = searchParams.get('activated') === '1';
  const insforgeVerified = searchParams.get('insforge_status') === 'success' && searchParams.get('insforge_type') === 'verify_email';
  const verified = searchParams.get('verified') === '1' || insforgeVerified;
  const registered = searchParams.get('registered') === '1';
  const isInviteContinuation = searchParams.get('redirect')?.includes('/invite/');

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
      {verified && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
          Email verified. Sign in to continue{isInviteContinuation ? ' and accept your invite.' : '.'}
        </div>
      )}
      {registered && !verified && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
          Account created. Please sign in to continue.
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
