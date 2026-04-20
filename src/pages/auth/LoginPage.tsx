import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, useUser } from '@insforge/react';
import { AuthShell } from '../../components/auth/AuthShell';
import { SESSION_EXPIRED_KEY, SESSION_EXPIRED_MESSAGE_KEY } from '../../auth/AuthSessionListener';
import { formatAuthError } from '../../auth/authMessages';
import { recoverAuthState } from '../../auth/recoverAuthState';
import { useTenant } from '../../tenant/TenantContext';
import { ensureMeAsSuperAdmin, isPlatformAdmin, getLoginRedirectPath } from '../../api/services/platformAdminService';
import { insforge } from '../../api/insforge/client';
import type { UUID } from '../../api/models/entities';

const LOGIN_FAILED_MESSAGE = 'Login failed. Please check your details or contact support.';
const INVALID_REDIRECT_PREFIXES = ['/login', '/register', '/forgot-password', '/reset-password', '/logout'];
const ACTIVE_COMPANY_KEY = 'sca_active_company_id_v3';

function sanitizeRedirect(raw: string | null, fallback: string): string {
  if (!raw) return fallback;
  try {
    const decoded = decodeURIComponent(raw);
    if (!decoded.startsWith('/')) return fallback;
    if (INVALID_REDIRECT_PREFIXES.some((prefix) => decoded.startsWith(prefix))) return fallback;
    return decoded;
  } catch {
    return fallback;
  }
}

export function LoginPage() {
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  const { setActiveCompanyId, refreshTenant } = useTenant();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
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
      return sessionStorage.getItem(SESSION_EXPIRED_MESSAGE_KEY) || 'Your session expired due to inactivity. Please log in again.';
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

  const redirectParam = searchParams.get('redirect');

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user?.id) return;
    let cancelled = false;
    setAuthError(null);
    setRedirectError(null);
    setRedirecting(true);
    (async () => {
      try {
        await ensureMeAsSuperAdmin();
        if (cancelled) return;
        const isSA = await isPlatformAdmin(user.id as UUID);
        if (cancelled) return;
        if (isSA) {
          await refreshTenant();
          if (cancelled) return;
          navigate('/super-admin/overview', { replace: true });
          return;
        }
        const storedCompanyId = (() => {
          try {
            return (localStorage.getItem(ACTIVE_COMPANY_KEY) as UUID | null) ?? null;
          } catch {
            return null;
          }
        })();
        const { path: defaultPath, organizationId, reason } = await getLoginRedirectPath(user.id as UUID, storedCompanyId);
        if (organizationId) setActiveCompanyId(organizationId);
        await refreshTenant();
        if (cancelled) return;
        const target = sanitizeRedirect(redirectParam, defaultPath);
        const pathWithReason = reason
          ? (target.includes('?') ? `${target}&reason=${reason}` : `${target}?reason=${reason}`)
          : target;
        navigate(pathWithReason, { replace: true });
      } catch {
        if (!cancelled) {
          await recoverAuthState(signOut, refreshTenant);
          setRedirectError(LOGIN_FAILED_MESSAGE);
          setRedirecting(false);
        }
      } finally {
        if (!cancelled) setRedirecting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, user?.id, navigate, redirectParam, setActiveCompanyId, refreshTenant, signOut]);

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
      const { error } = await insforge.auth.signInWithPassword({
        email: normalizedEmail,
        password
      });

      if (error) {
        handleSignInError(error);
        return;
      }
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
