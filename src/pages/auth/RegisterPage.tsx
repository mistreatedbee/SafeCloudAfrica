import React, { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2Icon } from 'lucide-react';
import { useInsforge } from '@insforge/react';
import { AuthShell } from '../../components/auth/AuthShell';
import { insforge } from '../../api/insforge/client';

export function RegisterPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const redirect = searchParams.get('redirect');
  const inviteEmail = searchParams.get('email');
  const inviteToken = searchParams.get('inviteToken');

  const { verifyEmail } = useInsforge();

  const [email, setEmail] = useState(inviteEmail ?? '');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'form' | 'verify'>('form');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (inviteToken) {
        try { sessionStorage.setItem('sca_pending_invite_token', inviteToken); } catch {}
      }
      const { data: authCfg } = await insforge.auth.getPublicAuthConfig();
      const isLinkMode = authCfg?.verifyEmailMethod === 'link';
      const { data, error: signUpError } = await insforge.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        // In link mode use only the root origin — sub-paths like /app are rarely in the
        // InsForge allowedRedirectUrls list. Switch to "code" mode in /super-admin/auth-config
        // to avoid the allowlist requirement entirely and preserve the invite redirect.
        ...(isLinkMode ? { redirectTo: window.location.origin } : {}),
      });
      if (signUpError) {
        setError(signUpError.message ?? 'Sign up failed. Please try again.');
        return;
      }
      if ((data as any)?.requireEmailVerification) {
        setStep('verify');
        return;
      }
      navigate(redirect ? decodeURIComponent(redirect) : '/app', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const result = await verifyEmail(otp.trim(), email.trim().toLowerCase());
      if (result && 'error' in result) {
        setError((result as any).error ?? 'Verification failed. Please check the code and try again.');
        return;
      }
      navigate(redirect ? decodeURIComponent(redirect) : '/app', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Register with your email, then set up your company workspace."
      sideTitle="Safe Cloud Africa"
    >
      {inviteEmail && step === 'form' && (
        <div className="mb-4 rounded-lg bg-surface-50 border border-surface-200 px-3 py-2 text-sm text-charcoal-700">
          Invitation email: <strong>{inviteEmail}</strong>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-critical/10 border border-critical/20 px-3 py-2 text-sm text-critical">
          {error}
        </div>
      )}

      {step === 'form' ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="register-email" className="block text-sm font-medium text-charcoal mb-1">
              Email
            </label>
            <input
              id="register-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
              placeholder="you@company.com"
              disabled={submitting || !!inviteEmail}
              required
            />
          </div>
          <div>
            <label htmlFor="register-password" className="block text-sm font-medium text-charcoal mb-1">
              Password
            </label>
            <input
              id="register-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
              placeholder="Choose a strong password"
              disabled={submitting}
              required
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-70 inline-flex items-center justify-center gap-2"
          >
            {submitting ? <><Loader2Icon className="w-4 h-4 animate-spin" /> Creating account…</> : 'Create account'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerify} className="space-y-4">
          <p className="text-sm text-charcoal-600">
            A verification code has been sent to <strong>{email}</strong>. Enter it below to confirm your account.
          </p>
          <div>
            <label htmlFor="register-otp" className="block text-sm font-medium text-charcoal mb-1">
              Verification code
            </label>
            <input
              id="register-otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
              placeholder="6-digit code"
              disabled={submitting}
              required
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-70 inline-flex items-center justify-center gap-2"
          >
            {submitting ? <><Loader2Icon className="w-4 h-4 animate-spin" /> Verifying…</> : 'Verify email'}
          </button>
          <button
            type="button"
            onClick={() => setStep('form')}
            className="w-full text-sm text-charcoal-500 hover:text-charcoal"
          >
            Back
          </button>
        </form>
      )}

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
