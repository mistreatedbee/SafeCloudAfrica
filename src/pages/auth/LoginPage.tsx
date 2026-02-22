import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { SignIn, useAuth, useUser } from '@insforge/react';
import { AuthShell } from '../../components/auth/AuthShell';
import { useTenant } from '../../tenant/TenantContext';
import { ensureMeAsSuperAdmin, isPlatformAdmin, getLoginRedirectPath } from '../../api/services/platformAdminService';
import type { UUID } from '../../api/models/entities';

export function LoginPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { refreshTenant } = useTenant();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [redirecting, setRedirecting] = useState(false);
  const [redirectError, setRedirectError] = useState<string | null>(null);

  const redirectParam = searchParams.get('redirect');

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user?.id) return;
    let cancelled = false;
    setRedirectError(null);
    setRedirecting(true);
    (async () => {
      try {
        await ensureMeAsSuperAdmin();
        if (cancelled) return;
        const isSA = await isPlatformAdmin(user!.id as UUID);
        if (cancelled) return;
        if (isSA) {
          await refreshTenant();
          if (cancelled) return;
          navigate('/super-admin/overview', { replace: true });
          return;
        }
        const { path: defaultPath, reason } = await getLoginRedirectPath(user!.id as UUID);
        const target = redirectParam ? decodeURIComponent(redirectParam) : defaultPath;
        const pathWithReason = reason ? (target.includes('?') ? `${target}&reason=${reason}` : `${target}?reason=${reason}`) : target;
        await refreshTenant();
        if (cancelled) return;
        navigate(pathWithReason, { replace: true });
      } catch (err) {
        if (!cancelled) {
          setRedirectError('Could not determine where to send you. Try again or go to the app.');
          setRedirecting(false);
        }
      } finally {
        if (!cancelled) setRedirecting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, user?.id, navigate, redirectParam]);

  const activated = searchParams.get('activated') === '1';

  return (
    <AuthShell
      title="Sign in"
      subtitle="Enter your email and password below to access your company workspace."
      sideTitle="Safe Cloud Africa"
    >
      {activated && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
          License activated. Please log in to continue.
        </div>
      )}
      {redirectError && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
          {redirectError} <Link to="/app" className="font-medium underline">Go to app</Link>
        </div>
      )}
      {redirecting ? (
        <p className="text-sm text-charcoal-500">Redirecting…</p>
      ) : (
        <>
          <SignIn signUpUrl="/register" forgotPasswordUrl="/forgot-password" />
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

