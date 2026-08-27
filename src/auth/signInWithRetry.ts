import { insforge } from '../api/insforge/client';

const TRANSIENT_STATUS_CODES = new Set([429, 502, 503, 504]);

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function isTransientAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const statusCode = (error as { statusCode?: number }).statusCode;
  if (typeof statusCode === 'number' && TRANSIENT_STATUS_CODES.has(statusCode)) return true;
  const message = String((error as { message?: string }).message ?? '').toLowerCase();
  return (
    message.includes('temporarily unavailable') ||
    message.includes('timed out') ||
    message.includes('network') ||
    message.includes('failed to fetch')
  );
}

type SignInResult = Awaited<ReturnType<typeof insforge.auth.signInWithPassword>>;

export async function signInWithPasswordRetry(
  input: { email: string; password: string },
  options: { maxAttempts?: number } = {}
): Promise<SignInResult> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  let lastResult: SignInResult | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      await wait(500 * attempt);
    }

    const result = await insforge.auth.signInWithPassword(input);
    if (!result.error) return result;

    lastResult = result;
    if (!isTransientAuthError(result.error)) return result;
  }

  return lastResult ?? { data: null, error: new Error('Sign-in failed.') };
}
