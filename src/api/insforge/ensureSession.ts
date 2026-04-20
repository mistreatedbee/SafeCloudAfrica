import { insforge } from './client';

function readJwtSub(token: string | null | undefined): string | null {
  if (!token) return null;
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`;
    const parsed = JSON.parse(atob(padded)) as { sub?: string };
    return typeof parsed.sub === 'string' && parsed.sub.trim() ? parsed.sub : null;
  } catch {
    return null;
  }
}

/**
 * Ensures the shared InsForge SDK client has a signed-in user's access token
 * set on its HTTP client before making RLS-protected database calls.
 *
 * Why: if the HTTP client falls back to the anon key, Postgres sees auth.uid() as null
 * and RLS policies (correctly) reject inserts/updates.
 */
export async function ensureInsforgeSession(): Promise<{ accessToken: string; userId: string }> {
  const result = await insforge.auth.getCurrentSession();
  if (!result || typeof result !== 'object') {
    throw new Error('Your session is not available. Please sign in again.');
  }
  const { data, error } = result;
  if (error) throw error;

  const session = data?.session ?? null;
  const token =
    (typeof session?.accessToken === 'string' && session.accessToken.trim() ? session.accessToken : null) ??
    ((typeof (result as any)?.accessToken === 'string' && (result as any).accessToken.trim())
      ? (result as any).accessToken
      : null);
  const userId =
    (typeof session?.user?.id === 'string' && session.user.id.trim() ? session.user.id : null) ??
    ((typeof (result as any)?.user?.id === 'string' && (result as any).user.id.trim())
      ? (result as any).user.id
      : null) ??
    readJwtSub(token);

  if (!token || !userId) {
    // Keep message user-friendly; UI can prompt a re-login.
    throw new Error('Your session is not available. Please sign in again.');
  }

  // Redundant but intentional: guarantees DB calls that follow are authenticated.
  insforge.getHttpClient().setAuthToken(token);

  return { accessToken: token, userId };
}

