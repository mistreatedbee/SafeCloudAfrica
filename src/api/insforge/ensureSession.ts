import { insforge } from './client';

/**
 * Ensures the shared InsForge SDK client has a signed-in user's access token
 * set on its HTTP client before making RLS-protected database calls.
 *
 * Why: if the HTTP client falls back to the anon key, Postgres sees auth.uid() as null
 * and RLS policies (correctly) reject inserts/updates.
 */
export async function ensureInsforgeSession(): Promise<{ accessToken: string; userId: string }> {
  const { data, error } = await insforge.auth.getCurrentSession();
  if (error) throw error;

  const token = data?.session?.accessToken ?? null;
  const userId = data?.session?.user?.id ?? null;

  if (!token || !userId) {
    // Keep message user-friendly; UI can prompt a re-login.
    throw new Error('Your session is not available. Please sign in again.');
  }

  // Redundant but intentional: guarantees DB calls that follow are authenticated.
  insforge.getHttpClient().setAuthToken(token);

  return { accessToken: token, userId };
}

