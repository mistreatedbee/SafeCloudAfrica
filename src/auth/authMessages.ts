import type { InsForgeError } from '@insforge/sdk';

export function formatAuthError(err: unknown): string {
  if (!err) return 'Something went wrong. Please try again.';
  if (typeof err === 'string') return err;

  const anyErr = err as any;
  const msg: string | undefined = anyErr?.message;

  // InsForgeError has `statusCode` and `error`.
  const statusCode: number | undefined = anyErr?.statusCode;
  const code: string | undefined = anyErr?.error;

  const lowered = (msg ?? '').toLowerCase();
  const nextActions = typeof anyErr?.nextActions === 'string' ? anyErr.nextActions : '';

  if (
    lowered.includes('email verification') ||
    lowered.includes('verify your email') ||
    (statusCode === 403 && (code === 'FORBIDDEN' || lowered.includes('forbidden')))
  ) {
    return nextActions || 'Please verify your email address before signing in. Check your inbox for the verification link.';
  }
  if (lowered.includes('already') && (lowered.includes('registered') || lowered.includes('exists'))) {
    return 'This email is already registered. Please sign in instead.';
  }
  if (lowered.includes('user') && lowered.includes('exists')) {
    return 'This email is already registered. Please sign in instead.';
  }
  if (lowered.includes('invalid') && (lowered.includes('password') || lowered.includes('credentials'))) {
    return 'Incorrect email or password. If you just registered, verify your email first, then try again.';
  }
  if (statusCode === 401 || code === 'AUTH_UNAUTHORIZED') {
    return 'Incorrect email or password. If you just registered, verify your email first, then try again.';
  }
  if (statusCode === 502 || statusCode === 503 || statusCode === 504) {
    return 'Our sign-in service is temporarily unavailable. Please wait a moment and try again.';
  }
  if (statusCode === 429) return 'Too many attempts. Please wait a moment and try again.';
  if (statusCode === 400 && lowered.includes('email')) return 'Please enter a valid email address.';

  if (code === 'auth_failed') return 'Sign-in failed. Please double-check your details.';

  if (msg) return msg;
  if (typeof anyErr?.error_description === 'string') return anyErr.error_description;
  if (code) return `Request failed (${code}). Please try again.`;
  return 'Something went wrong. Please try again.';
}

export function isInsForgeError(err: unknown): err is InsForgeError {
  return !!err && typeof err === 'object' && 'statusCode' in (err as any) && 'error' in (err as any);
}

