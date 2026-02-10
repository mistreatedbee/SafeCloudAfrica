import React, { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { SignIn } from '@insforge/react';
import { AuthShell } from '../../components/auth/AuthShell';
import { useAuth } from '@insforge/react';

export function LoginPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) return;
    const redirect = params.get('redirect');
    navigate(redirect ? decodeURIComponent(redirect) : '/app', { replace: true });
  }, [isLoaded, isSignedIn, navigate, params]);

  return (
    <AuthShell
      title="Sign in"
      subtitle="Access your company workspace and manage compliance in real time."
      sideTitle="Safe Cloud Africa"
    >
      <SignIn signUpUrl="/register" forgotPasswordUrl="/forgot-password" />

      <div className="mt-6 flex items-center justify-between text-sm">
        <Link to="/register" className="text-teal font-semibold hover:text-teal-700">
          Create an account
        </Link>
        <Link to="/" className="text-charcoal-500 hover:text-charcoal">
          Back to landing page
        </Link>
      </div>
    </AuthShell>
  );
}

