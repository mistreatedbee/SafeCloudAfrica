import React from 'react';
import { Link } from 'react-router-dom';
import { ResetPassword } from '@insforge/react';
import { AuthShell } from '../../components/auth/AuthShell';

export function ResetPasswordPage() {
  return (
    <AuthShell title="Choose a new password" subtitle="Set a strong password for your account." sideTitle="Safe Cloud Africa">
      <ResetPassword />

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

