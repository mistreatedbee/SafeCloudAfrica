import React from 'react';
import { Link } from 'react-router-dom';
import { insforge } from '../../api/insforge/client';
import { AuthShell } from '../../components/auth/AuthShell';
import { AuthMessage, AuthSubmitButton, AuthTextInput } from '../../components/auth/AuthFormControls';
import { formatAuthError } from '../../auth/authMessages';

export function ForgotPasswordPage() {
  const [email, setEmail] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { data, error: requestError } = await insforge.auth.sendResetPasswordEmail({
        email: email.trim()
      } as any);

      if (requestError) throw requestError;
      setSuccess(data?.message ?? 'Check your email for password reset instructions.');
    } catch (requestFailure) {
      setError(formatAuthError(requestFailure));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Reset your password" subtitle="We’ll email you a secure reset link." sideTitle="Safe Cloud Africa">
      <div className="space-y-4">
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
          <AuthSubmitButton type="submit" disabled={loading} loading={loading} loadingText="Sending reset link...">
            Send reset link
          </AuthSubmitButton>
        </form>

        <div className="mt-6 flex items-center justify-between text-sm">
          <Link to="/login" className="text-teal font-semibold hover:text-teal-700">
            Back to sign in
          </Link>
          <Link to="/" className="text-charcoal-500 hover:text-charcoal">
            Back to landing page
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
