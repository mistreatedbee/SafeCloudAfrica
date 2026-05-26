import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AuthShell } from '../../components/auth/AuthShell';
import { formatAuthError } from '../../auth/authMessages';
import { insforge, insforgeReady } from '../../api/insforge/client';
import {
  getVerificationRedirectUrl,
  safeAuthRedirectPath,
  savePendingAuthRedirect,
  savePendingInviteContext
} from '../../auth/pendingAuthRedirect';

export function RegisterPage() {
  const [searchParams] = useSearchParams();
  const redirectPath = useMemo(() => safeAuthRedirectPath(searchParams.get('redirect')), [searchParams]);
  const inviteToken = searchParams.get('inviteToken')?.trim() ?? '';
  const inviteEmail = searchParams.get('email')?.trim().toLowerCase() ?? '';
  const isInviteSignup = !!inviteEmail || !!inviteToken || redirectPath.startsWith('/invite/');

  const [name, setName] = useState('');
  const [email, setEmail] = useState(inviteEmail);
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const normalizedEmail = (inviteEmail || email).trim().toLowerCase();
    const displayName = name.trim();
    if (!normalizedEmail || !password) {
      setError('Please enter your email address and password.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      await insforgeReady;
      savePendingAuthRedirect(redirectPath);
      if (isInviteSignup) {
        savePendingInviteContext({
          token: inviteToken,
          email: normalizedEmail,
          redirectPath
        });
      }
      const { data, error: signUpError } = await insforge.auth.signUp({
        email: normalizedEmail,
        password,
        name: displayName || undefined,
        redirectTo: getVerificationRedirectUrl()
      });

      if (signUpError) throw signUpError;

      if (data?.requireEmailVerification) {
        setSuccess(
          isInviteSignup
            ? 'Check your email to verify your account. After verification, sign in and your invitation will continue automatically.'
            : 'Check your email to verify your account, then sign in to continue.'
        );
        return;
      }

      if (data?.accessToken) {
        window.location.replace(redirectPath);
        return;
      }

      window.location.replace(`/login?registered=1&redirect=${encodeURIComponent(redirectPath)}`);
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle={isInviteSignup ? 'Create your account with the invited email address.' : 'Register with your email, then set up your company workspace.'}
      sideTitle="Safe Cloud Africa"
    >
      {inviteEmail && (
        <div className="mb-4 rounded-lg bg-surface-50 border border-surface-200 px-3 py-2 text-sm text-charcoal-700">
          Invitation email: <strong>{inviteEmail}</strong>
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-lg bg-success-50 border border-success/20 px-3 py-2 text-sm text-success">
          {success}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-critical/10 border border-critical/20 px-3 py-2 text-sm text-critical">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="register-name" className="block text-sm font-medium text-charcoal mb-1">
            Full name
          </label>
          <input
            id="register-name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
            placeholder="Your name"
            disabled={submitting}
          />
        </div>

        <div>
          <label htmlFor="register-email" className="block text-sm font-medium text-charcoal mb-1">
            Email
          </label>
          <input
            id="register-email"
            type="email"
            autoComplete="email"
            value={inviteEmail || email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal disabled:bg-surface-50 disabled:text-charcoal-500"
            placeholder="you@company.com"
            disabled={submitting || !!inviteEmail}
            required
          />
          {inviteEmail && (
            <p className="mt-1 text-xs text-charcoal-500">Use this email to match and accept the invitation.</p>
          )}
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
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
            placeholder="Create a password"
            minLength={6}
            disabled={submitting}
            required
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !!success}
          className="w-full rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {submitting ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <div className="mt-6 flex items-center justify-between text-sm">
        <Link
          to={`/login?redirect=${encodeURIComponent(redirectPath)}`}
          className="text-teal font-semibold hover:text-teal-700"
          aria-label="Go to sign in page"
        >
          Already have an account? Sign in
        </Link>
        <Link to="/" className="text-charcoal-500 hover:text-charcoal">
          Back to landing page
        </Link>
      </div>
    </AuthShell>
  );
}
