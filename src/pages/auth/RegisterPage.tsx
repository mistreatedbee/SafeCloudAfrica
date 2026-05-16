import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SignUp } from '@insforge/react';
import { AuthShell } from '../../components/auth/AuthShell';

export function RegisterPage() {
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect');
  const inviteEmail = searchParams.get('email');
  const emailRedirectTo = redirect ? `${window.location.origin}${decodeURIComponent(redirect)}` : `${window.location.origin}/app`;

  return (
    <AuthShell
      title="Create your account"
      subtitle="Register with your email, then set up your company workspace."
      sideTitle="Safe Cloud Africa"
    >
      {inviteEmail && (
        <div className="mb-4 rounded-lg bg-surface-50 border border-surface-200 px-3 py-2 text-sm text-charcoal-700">
          Invitation email: <strong>{inviteEmail}</strong>
        </div>
      )}
      <SignUp signInUrl="/login" emailRedirectTo={emailRedirectTo} />

      <div className="mt-6 flex items-center justify-between text-sm">
        <Link to="/login" className="text-teal font-semibold hover:text-teal-700" aria-label="Go to sign in page">
          Already have an account? Sign in
        </Link>
        <Link to="/" className="text-charcoal-500 hover:text-charcoal">
          Back to landing page
        </Link>
      </div>
    </AuthShell>
  );
}

