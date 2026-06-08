import { insforge } from './client';
import { ensureInsforgeSession } from './ensureSession';
import {
  clearAuthStorage,
  emitAuthFailure,
  markSessionExpired,
  refreshSessionThroughProxy
} from './sessionState';

export async function fetchWithInsforgeAuth(
  input: RequestInfo | URL,
  init: RequestInit = {},
  reason = 'authenticated-fetch'
): Promise<Response> {
  const { accessToken } = await ensureInsforgeSession({ reason });
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);

  const nextInit: RequestInit = {
    ...init,
    credentials: init.credentials ?? 'include',
    cache: init.cache ?? 'no-store',
    headers
  };

  let response = await fetch(input, nextInit);
  if (response.status !== 401 && response.status !== 403) return response;

  const httpClient = insforge.getHttpClient() as { baseUrl: string; setAuthToken: (token: string | null) => void };
  const refreshed = await refreshSessionThroughProxy({
    baseUrl: httpClient.baseUrl,
    fetch: globalThis.fetch.bind(globalThis)
  });

  if (refreshed.ok) {
    httpClient.setAuthToken(refreshed.accessToken);
    const retryHeaders = new Headers(init.headers);
    retryHeaders.set('Authorization', `Bearer ${refreshed.accessToken}`);
    response = await fetch(input, {
      ...init,
      credentials: init.credentials ?? 'include',
      cache: init.cache ?? 'no-store',
      headers: retryHeaders
    });
    if (response.status !== 401 && response.status !== 403) return response;
  }

  if (!refreshed.ok && refreshed.reason === 'invalid_session') {
    httpClient.setAuthToken(null);
    clearAuthStorage();
    markSessionExpired();
    emitAuthFailure(refreshed.error ?? response.statusText);
  }
  return response;
}

