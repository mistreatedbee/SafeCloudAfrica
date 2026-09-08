/* @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFreshFetch } from './liveData';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

describe('createFreshFetch', () => {
  const baseFetch = vi.fn();
  const auth = {
    token: 'user-token',
    getBaseUrl: () => window.location.origin,
    getAccessToken: () => auth.token,
    setAccessToken: vi.fn((token: string | null) => {
      auth.token = token ?? '';
    })
  };

  beforeEach(() => {
    (globalThis as any).__APP_VERSION__ = 'test';
    baseFetch.mockReset();
    auth.token = 'user-token';
    auth.setAccessToken.mockClear();
  });

  it('forwards requests with no-store headers and bearer auth', async () => {
    baseFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

    const wrapped = createFreshFetch(baseFetch as unknown as typeof fetch, auth);
    const response = await wrapped('/api/database/records/tasks', { method: 'GET' });

    expect(response.status).toBe(200);
    expect(baseFetch).toHaveBeenCalledTimes(1);
    const headers = new Headers((baseFetch.mock.calls[0]?.[1] as RequestInit).headers);
    expect(headers.get('Authorization')).toBe('Bearer user-token');
    expect(headers.get('Cache-Control')).toContain('no-store');
  });

  it('emits backend-unavailable for 502 responses without retrying auth refresh', async () => {
    const listener = vi.fn();
    window.addEventListener('sca:backend-unavailable', listener);
    baseFetch.mockResolvedValueOnce(jsonResponse({ error: 'Bad gateway' }, 502));

    const wrapped = createFreshFetch(baseFetch as unknown as typeof fetch, auth);
    const response = await wrapped('/api/database/records/tasks', { method: 'GET' });

    expect(response.status).toBe(502);
    expect(baseFetch).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('sca:backend-unavailable', listener);
  });
});
