import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { insforge } from '../../api/insforge/client';
import { AuthShell } from '../../components/auth/AuthShell';
import { AuthMessage, AuthOAuthButtons, AuthPasswordInput, AuthSubmitButton, AuthTextInput } from '../../components/auth/AuthFormControls';
import { formatAuthError } from '../../auth/authMessages';
import { useSafePublicAuthConfig } from '../../auth/useSafePublicAuthConfig';

export function RegisterPage() {
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect');
  const inviteEmail = searchParams.get('email');
  const emailRedirectTo = redirect ? `${window.location.origin}${decodeURIComponent(redirect)}` : `${window.location.origin}/app`;
  const { authConfig } = useSafePublicAuthConfig();
  const [email, setEmail] = React.useState(inviteEmail ?? '');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [oauthProvider, setOauthProvider] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { data, error: signUpError } = await insforge.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo
        }
      } as any);

      if (signUpError) throw signUpError;

      if (data?.requireEmailVerification) {
        setSuccess('Check your email for a verification link, then sign in to continue.');
      } else {
        insforge.getHttpClient().setAuthToken(data?.accessToken ?? null);
        window.location.assign('/app');
      }
    } catch (submitError) {
      setError(formatAuthError(submitError));
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthSignUp = (provider: string) => {
    setError(null);
    setSuccess(null);
    setOauthProvider(provider);

    void insforge.auth
      .signInWithOAuth({
        provider: provider as any,
        redirectTo: window.location.href
      })
      .then(({ error: oauthError }) => {
        if (oauthError) throw oauthError;
      })
      .catch((oauthError) => {
        setOauthProvider(null);
        setError(formatAuthError(oauthError));
      });
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Register with your email, then set up your company workspace."
      sideTitle="Safe Cloud Africa"
    >
      <div className="space-y-4">
        {inviteEmail && (
          <div className="rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-charcoal-700">
            Invitation email: <strong>{inviteEmail}</strong>
          </div>
        )}
        {error && <AuthMessage tone="error">{error}</AuthMessage>}
        {success && <AuthMessage tone="success">{success}</AuthMessage>}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <AuthTextInput
            label="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
            required
          />
          <AuthPasswordInput
            label="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Create a password"
            autoComplete="new-password"
            required
          />
          <AuthPasswordInput
            label="Confirm password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Repeat your password"
            autoComplete="new-password"
            required
          />
          <AuthSubmitButton
            type="submit"
            disabled={loading || oauthProvider !== null}
            loading={loading}
            loadingText="Creating account..."
          >
            Create account
          </AuthSubmitButton>
        </form>

        <AuthOAuthButtons
          providers={authConfig.oAuthProviders}
          disabled={loading || oauthProvider !== null}
          loadingProvider={oauthProvider}
          onClick={handleOAuthSignUp}
        />

        <div className="mt-6 flex items-center justify-between text-sm">
          <Link to="/login" className="text-teal font-semibold hover:text-teal-700" aria-label="Go to sign in page">
            Already have an account? Sign in
          </Link>
          <Link to="/" className="text-charcoal-500 hover:text-charcoal">
            Back to landing page
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
