import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { SignIn, useAuth, useUser } from '@insforge/react';
import { AuthShell } from '../../components/auth/AuthShell';
import { ensureMeAsSuperAdmin, isPlatformAdmin, getRoleBasedRedirectPath } from '../../api/services/platformAdminService';
import type { UUID } from '../../api/models/entities';

export function LoginPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user?.id) return;
    const redirect = params.get('redirect');
    let cancelled = false;
    setRedirecting(true);
    (async () => {
      try {
        await ensureMeAsSuperAdmin();
        if (cancelled) return;
        const isSA = await isPlatformAdmin(user!.id as UUID);
        if (cancelled) return;
        if (isSA) {
          navigate('/super-admin', { replace: true });
          return;
        }
        const defaultPath = await getRoleBasedRedirectPath(user!.id as UUID);
        navigate(redirect ? decodeURIComponent(redirect) : defaultPath, { replace: true });
      } finally {
        if (!cancelled) setRedirecting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, user?.id, navigate, params]);

  return (
    <AuthShell
      title="Sign in"
      subtitle="Access your company workspace and manage compliance in real time."
      sideTitle="Safe Cloud Africa"
    >
      {redirecting ? (
        <p className="text-sm text-charcoal-500">Redirecting…</p>
      ) : (
        <>
          <SignIn signUpUrl="/register" forgotPasswordUrl="/forgot-password" />

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

