import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.hoisted(() => ({
  getCurrentSession: vi.fn()
}));

const httpMock = vi.hoisted(() => ({
  anonKey: '',
  baseUrl: 'https://safecloud.test',
  getHeaders: vi.fn(),
  setAuthToken: vi.fn()
}));

vi.mock('./client', () => ({
  insforgeReady: Promise.resolve(),
  insforge: {
    auth: authMock,
    getHttpClient: () => httpMock
  }
}));

function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function createJwt(payload: Record<string, unknown>): string {
  return [
    encodeBase64Url(JSON.stringify({ alg: 'none', typ: 'JWT' })),
    encodeBase64Url(JSON.stringify(payload)),
    'signature'
  ].join('.');
}

describe('ensureInsforgeSession', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    authMock.getCurrentSession.mockReset();
    httpMock.getHeaders.mockReset();
    httpMock.setAuthToken.mockReset();
    httpMock.anonKey = createJwt({ sub: 'anon-user' });
    globalThis.fetch = originalFetch;
  });

  it('falls back to an attached bearer user token when SDK session storage is empty', async () => {
    const userToken = createJwt({ sub: 'user-1' });
    authMock.getCurrentSession.mockResolvedValue({ data: { session: null }, error: null });
    httpMock.getHeaders.mockReturnValue({ Authorization: `Bearer ${userToken}` });

    const { ensureInsforgeSession } = await import('./ensureSession');
    await expect(ensureInsforgeSession({ reason: 'test' })).resolves.toEqual({
      accessToken: userToken,
      userId: 'user-1'
    });
  });

  it('does not treat the anon key as a signed-in user session', async () => {
    authMock.getCurrentSession.mockResolvedValue({ data: { session: null }, error: null });
    httpMock.getHeaders.mockReturnValue({ Authorization: `Bearer ${httpMock.anonKey}` });

    const { ensureInsforgeSession } = await import('./ensureSession');
    await expect(ensureInsforgeSession({ reason: 'test' })).rejects.toMatchObject({
      code: 'AUTH_SESSION_MISSING'
    });
  });

  it('withInsforgeSession attaches a user token before running the guarded call', async () => {
    const userToken = createJwt({ sub: 'user-1' });
    const guarded = vi.fn().mockResolvedValue('ok');
    authMock.getCurrentSession.mockResolvedValue({
      data: { session: { accessToken: userToken, user: { id: 'user-1' } } },
      error: null
    });
    httpMock.getHeaders.mockReturnValue({});

    const { withInsforgeSession } = await import('./ensureSession');
    await expect(withInsforgeSession('test:guarded', guarded)).resolves.toBe('ok');

    expect(httpMock.setAuthToken).toHaveBeenCalledWith(userToken);
    expect(guarded).toHaveBeenCalledTimes(1);
  });

  it('treats a token expiring within the leeway window as expired and attempts a refresh', async () => {
    const soonToExpireToken = createJwt({ sub: 'user-1', exp: Math.floor((Date.now() + 5_000) / 1000) });
    const refreshedToken = createJwt({ sub: 'user-1', exp: Math.floor((Date.now() + 60_000) / 1000) });
    authMock.getCurrentSession.mockResolvedValue({ data: { session: null }, error: null });
    httpMock.getHeaders.mockReturnValue({ Authorization: `Bearer ${soonToExpireToken}` });
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accessToken: refreshedToken, user: { id: 'user-1' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    ) as unknown as typeof fetch;

    const { ensureInsforgeSession } = await import('./ensureSession');
    await expect(ensureInsforgeSession({ reason: 'test' })).resolves.toEqual({
      accessToken: refreshedToken,
      userId: 'user-1'
    });
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it('emits sca:auth-failure when no valid session can be established', async () => {
    const dispatchEvent = vi.fn();
    const addEventListener = vi.fn();
    (globalThis as any).window = { dispatchEvent, addEventListener };

    authMock.getCurrentSession.mockResolvedValue({ data: { session: null }, error: null });
    httpMock.getHeaders.mockReturnValue({});
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'not_found' }), { status: 404 })
    ) as unknown as typeof fetch;

    try {
      const { ensureInsforgeSession } = await import('./ensureSession');
      await expect(ensureInsforgeSession({ reason: 'test' })).rejects.toMatchObject({
        code: 'AUTH_SESSION_MISSING'
      });

      expect(dispatchEvent).toHaveBeenCalledTimes(1);
      const dispatchedEvent = dispatchEvent.mock.calls[0][0] as CustomEvent;
      expect(dispatchedEvent.type).toBe('sca:auth-failure');
    } finally {
      delete (globalThis as any).window;
    }
  });

  it('refreshes an expired stored session before attaching it', async () => {
    const expiredToken = createJwt({ sub: 'user-1', exp: Math.floor((Date.now() - 60_000) / 1000) });
    const refreshedToken = createJwt({ sub: 'user-1', exp: Math.floor((Date.now() + 60_000) / 1000) });
    authMock.getCurrentSession.mockResolvedValue({
      data: { session: { accessToken: expiredToken, user: { id: 'user-1' } } },
      error: null
    });
    httpMock.getHeaders.mockReturnValue({ Authorization: `Bearer ${expiredToken}` });
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accessToken: refreshedToken, user: { id: 'user-1' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    ) as unknown as typeof fetch;

    const { ensureInsforgeSession } = await import('./ensureSession');
    await expect(ensureInsforgeSession({ reason: 'test' })).resolves.toEqual({
      accessToken: refreshedToken,
      userId: 'user-1'
    });
    expect(httpMock.setAuthToken).toHaveBeenCalledWith(refreshedToken);
  });

  it('throws a transient error without emitting sca:auth-failure when refresh fails transiently', async () => {
    const dispatchEvent = vi.fn();
    const addEventListener = vi.fn();
    (globalThis as any).window = { dispatchEvent, addEventListener };

    const expiredToken = createJwt({ sub: 'user-1', exp: Math.floor((Date.now() - 60_000) / 1000) });
    authMock.getCurrentSession.mockResolvedValue({
      data: { session: { accessToken: expiredToken, user: { id: 'user-1' } } },
      error: null
    });
    httpMock.getHeaders.mockReturnValue({ Authorization: `Bearer ${expiredToken}` });
    // Simulate an upstream 500 / malformed response — a transient_failure per refreshSessionThroughProxy.
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'internal' }), { status: 500 })
    ) as unknown as typeof fetch;

    try {
      const { ensureInsforgeSession, InsforgeTransientSessionError } = await import('./ensureSession');
      await expect(ensureInsforgeSession({ reason: 'test' })).rejects.toBeInstanceOf(InsforgeTransientSessionError);

      expect(dispatchEvent).not.toHaveBeenCalled();
      expect(httpMock.setAuthToken).not.toHaveBeenCalled();
    } finally {
      delete (globalThis as any).window;
    }
  });
});
