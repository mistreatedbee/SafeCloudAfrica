import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { SignIn, useAuth, useUser } from '@insforge/react';
import { AuthShell } from '../../components/auth/AuthShell';
import { SESSION_EXPIRED_KEY } from '../../auth/AuthSessionListener';
import { formatAuthError } from '../../auth/authMessages';
import { recoverAuthState } from '../../auth/recoverAuthState';
import { useTenant } from '../../tenant/TenantContext';
import { ensureMeAsSuperAdmin, isPlatformAdmin, getLoginRedirectPath } from '../../api/services/platformAdminService';
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
  const [sessionExpired] = useState(() => {
    try {
      return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SESSION_EXPIRED_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (sessionExpired) {
      try {
        sessionStorage.removeItem(SESSION_EXPIRED_KEY);
      } catch {
        // ignore
      }
    }
  }, [sessionExpired]);

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

  const handleSignInError = (error: Error) => {
    setRedirecting(false);
    setRedirectError(null);
    void recoverAuthState(signOut, refreshTenant);
    setAuthError(`${LOGIN_FAILED_MESSAGE} ${formatAuthError(error)}`);
  };

  return (
    <AuthShell
      title="Sign in"
      subtitle="Enter your email and password below to access your company workspace."
      sideTitle="Safe Cloud Africa"
    >
      {sessionExpired && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
          Your session expired. Please sign in again.
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
          <SignIn signUpUrl="/register" forgotPasswordUrl="/forgot-password" onError={handleSignInError} />
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
