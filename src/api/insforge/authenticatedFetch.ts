import { ensureInsforgeSession } from './ensureSession';

export async function fetchWithInsforgeAuth(
  input: RequestInfo | URL,
  init: RequestInit = {},
  reason = 'authenticated-fetch'
): Promise<Response> {
  const { accessToken } = await ensureInsforgeSession({ reason });
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);

  return fetch(input, {
    ...init,
    credentials: init.credentials ?? 'include',
    cache: init.cache ?? 'no-store',
    headers
  });
}
