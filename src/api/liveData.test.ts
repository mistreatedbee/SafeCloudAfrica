/* @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFreshFetch } from './liveData';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

describe('createFreshFetch auth refresh handling', () => {
  const baseFetch = vi.fn();
  const auth = {
    token: 'old-token',
    getBaseUrl: () => window.location.origin,
    getAccessToken: () => auth.token,
    setAccessToken: vi.fn((token: string | null) => {
      auth.token = token ?? '';
    })
  };

  beforeEach(() => {
    (globalThis as any).__APP_VERSION__ = 'test';
    baseFetch.mockReset();
    auth.token = 'old-token';
    auth.setAccessToken.mockClear();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('refreshes once and retries the original request after a 401', async () => {
    baseFetch
      .mockResolvedValueOnce(jsonResponse({ error: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'new-token', user: { id: 'user-1' } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const wrapped = createFreshFetch(baseFetch as unknown as typeof fetch, auth);
    const response = await wrapped('/api/database/records/tasks', { method: 'GET' });

    expect(response.status).toBe(200);
    expect(baseFetch).toHaveBeenCalledTimes(3);
    expect(String(baseFetch.mock.calls[1]?.[0])).toContain('/api/auth/refresh');
    expect(auth.setAccessToken).toHaveBeenCalledWith('new-token');
    expect(new Headers((baseFetch.mock.calls[2]?.[1] as RequestInit).headers).get('Authorization')).toBe('Bearer new-token');
  });

  it('does not loop when refresh fails and the retried request is still unauthorized', async () => {
    const listener = vi.fn();
    window.addEventListener('sca:auth-failure', listener);
    baseFetch
      .mockResolvedValueOnce(jsonResponse({ error: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(jsonResponse({ error: 'Invalid token' }, 401));

    const wrapped = createFreshFetch(baseFetch as unknown as typeof fetch, auth);
    const response = await wrapped('/api/database/records/tasks', { method: 'GET' });

    expect(response.status).toBe(401);
    expect(baseFetch).toHaveBeenCalledTimes(2);
    expect(auth.setAccessToken).toHaveBeenCalledWith(null);
    expect(sessionStorage.getItem('sca_session_expired_message')).toBe('Your session has expired. Please log in again.');
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('sca:auth-failure', listener);
  });
});
