import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, useUser } from '@insforge/react';
import { AuthShell } from '../../components/auth/AuthShell';
import { AuthMessage, AuthOAuthButtons, AuthPasswordInput, AuthSubmitButton, AuthTextInput } from '../../components/auth/AuthFormControls';
import { SESSION_EXPIRED_KEY, SESSION_EXPIRED_MESSAGE_KEY } from '../../auth/AuthSessionListener';
import { formatAuthError } from '../../auth/authMessages';
import { recoverAuthState } from '../../auth/recoverAuthState';
import { useSafePublicAuthConfig } from '../../auth/useSafePublicAuthConfig';
import { insforge } from '../../api/insforge/client';
import { useTenant } from '../../tenant/TenantContext';
import { ensureMeAsSuperAdmin, getLoginRedirectPath, isPlatformAdmin } from '../../api/services/platformAdminService';
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
  const { authConfig } = useSafePublicAuthConfig();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [redirecting, setRedirecting] = useState(false);
  const [redirectError, setRedirectError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [oauthProvider, setOauthProvider] = useState<string | null>(null);
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

    void (async () => {
      try {
        await ensureMeAsSuperAdmin();
        if (cancelled) return;

        const isSuperAdmin = await isPlatformAdmin(user.id as UUID);
        if (cancelled) return;

        if (isSuperAdmin) {
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
  }, [isLoaded, isSignedIn, navigate, redirectParam, refreshTenant, setActiveCompanyId, signOut, user?.id]);

  const activated = searchParams.get('activated') === '1';

  const handleSignInError = (error: Error) => {
    setRedirecting(false);
    setRedirectError(null);
    setSubmitting(false);
    setOauthProvider(null);
    void recoverAuthState(signOut, refreshTenant);
    setAuthError(`${LOGIN_FAILED_MESSAGE} ${formatAuthError(error)}`);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    setAuthError(null);
    setRedirectError(null);
    setSubmitting(true);

    try {
      const { data, error } = await insforge.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (error || !data?.user?.id) {
        throw error ?? new Error('Sign-in failed. Please try again.');
      }

      insforge.getHttpClient().setAuthToken(data.accessToken ?? null);
      window.location.assign(sanitizeRedirect(redirectParam, '/app'));
    } catch (error) {
      handleSignInError(error instanceof Error ? error : new Error(formatAuthError(error)));
    } finally {
      setSubmitting(false);
    }
  };

  const handleOAuthSignIn = (provider: string) => {
    setAuthError(null);
    setRedirectError(null);
    setOauthProvider(provider);

    void insforge.auth
      .signInWithOAuth({
        provider: provider as any,
        redirectTo: window.location.href
      })
      .then(({ error }) => {
        if (error) throw error;
      })
      .catch((error) => {
        handleSignInError(error instanceof Error ? error : new Error(formatAuthError(error)));
      });
  };

  return (
    <AuthShell
      title="Sign in"
      subtitle="Enter your email and password below to access your company workspace."
      sideTitle="Safe Cloud Africa"
    >
      <div className="space-y-4">
        {sessionExpiredMessage && <AuthMessage tone="warning">{sessionExpiredMessage}</AuthMessage>}
        {activated && <AuthMessage tone="success">License activated. Please log in to continue.</AuthMessage>}
        {authError && <AuthMessage tone="error">{authError}</AuthMessage>}
        {redirectError && <AuthMessage tone="warning">{redirectError}</AuthMessage>}

        {redirecting ? (
          <p className="text-sm text-charcoal-500">Redirecting...</p>
        ) : (
          <>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <AuthTextInput
                label="Email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                required
              />
              <AuthPasswordInput
                label="Password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
              <div className="flex justify-end">
                <Link to="/forgot-password" className="text-sm font-medium text-teal hover:text-teal-700">
                  Forgot password?
                </Link>
              </div>
              <AuthSubmitButton
                type="submit"
                disabled={submitting || oauthProvider !== null}
                loading={submitting}
                loadingText="Signing in..."
              >
                Sign in
              </AuthSubmitButton>
            </form>

            <AuthOAuthButtons
              providers={authConfig.oAuthProviders}
              disabled={submitting || oauthProvider !== null}
              loadingProvider={oauthProvider}
              onClick={handleOAuthSignIn}
            />

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
      </div>
    </AuthShell>
  );
}
