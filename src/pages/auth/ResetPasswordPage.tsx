import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { insforge } from '../../api/insforge/client';
import { AuthShell } from '../../components/auth/AuthShell';
import { AuthMessage, AuthPasswordInput, AuthSubmitButton, AuthTextInput } from '../../components/auth/AuthFormControls';
import { formatAuthError } from '../../auth/authMessages';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const [verificationToken, setVerificationToken] = React.useState(searchParams.get('token') ?? '');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { data, error: requestError } = await insforge.auth.resetPassword({
        otp: verificationToken.trim(),
        newPassword
      });

      if (requestError) throw requestError;
      setSuccess(data?.message ?? 'Your password has been updated. You can sign in now.');
    } catch (requestFailure) {
      setError(formatAuthError(requestFailure));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Choose a new password" subtitle="Set a strong password for your account." sideTitle="Safe Cloud Africa">
      <div className="space-y-4">
        {error && <AuthMessage tone="error">{error}</AuthMessage>}
        {success && <AuthMessage tone="success">{success}</AuthMessage>}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <AuthTextInput
            label="Reset token"
            value={verificationToken}
            onChange={(event) => setVerificationToken(event.target.value)}
            placeholder="Paste the reset token from your email"
            autoComplete="one-time-code"
            required
          />
          <AuthPasswordInput
            label="New password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="Enter a new password"
            autoComplete="new-password"
            required
          />
          <AuthPasswordInput
            label="Confirm new password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Repeat the new password"
            autoComplete="new-password"
            required
          />
          <AuthSubmitButton type="submit" disabled={loading} loading={loading} loadingText="Updating password...">
            Update password
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
