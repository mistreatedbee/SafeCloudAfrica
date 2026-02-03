import React from 'react';
import { Link } from 'react-router-dom';
import { ForgotPassword } from '@insforge/react';
import { AuthShell } from '../../components/auth/AuthShell';

export function ForgotPasswordPage() {
  return (
    <AuthShell title="Reset your password" subtitle="We’ll email you a secure reset link." sideTitle="Safe Cloud Africa">
      <ForgotPassword />

      <div className="mt-6 flex items-center justify-between text-sm">
        <Link to="/login" className="text-teal font-semibold hover:text-teal-700">
          Back to sign in
        </Link>
        <Link to="/" className="text-charcoal-500 hover:text-charcoal">
          Back to landing page
        </Link>
      </div>
    </AuthShell>
  );
}

