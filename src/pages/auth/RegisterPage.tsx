import React from 'react';
import { Link } from 'react-router-dom';
import { SignUp } from '@insforge/react';
import { AuthShell } from '../../components/auth/AuthShell';

export function RegisterPage() {
  return (
    <AuthShell
      title="Create your account"
      subtitle="Register with your email, then set up your company workspace."
      sideTitle="Safe Cloud Africa"
    >
      <SignUp signInUrl="/login" emailRedirectTo={`${window.location.origin}/app`} />

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

