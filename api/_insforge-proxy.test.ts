import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  writeUpstreamResponse: vi.fn(async (res: any, upstreamRes: Response) => {
    res.statusCode = upstreamRes.status;
    res.bodyText = await upstreamRes.text();
  }),
  logStructuredLine: vi.fn()
}));

vi.mock('./_insforge-proxy/_shared.js', () => ({
  buildForwardHeaders: vi.fn(() => new Headers()),
  buildUpstreamUrl: vi.fn((origin: string, path: string) => `${origin}${path}`),
  getProxyBody: vi.fn((req: any) => req.body),
  startProxy: vi.fn(() => ({ requestId: 'req-1', upstreamOrigin: 'https://insforge.example' })),
  writeUpstreamResponse: sharedMocks.writeUpstreamResponse
}));

vi.mock('./_observability.js', () => ({
  logStructuredLine: sharedMocks.logStructuredLine
}));

type TestResponse = {
  headers: Record<string, string | string[]>;
  statusCode: number;
  jsonBody: unknown;
  bodyText: string;
  ended: boolean;
  setHeader: (key: string, value: string | string[]) => void;
  status: (code: number) => TestResponse;
  json: (payload: unknown) => TestResponse;
  end: (payload?: string) => void;
};

function createRes(): TestResponse {
  return {
    headers: {},
    statusCode: 200,
    jsonBody: null,
    bodyText: '',
    ended: false,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.jsonBody = payload;
      return this;
    },
    end(payload = '') {
      this.ended = true;
      this.bodyText = payload;
    }
  };
}

describe('api/_insforge-proxy', () => {
  const fetchMock = vi.fn();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    sharedMocks.writeUpstreamResponse.mockClear();
    sharedMocks.logStructuredLine.mockClear();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('falls back from auth/sessions to legacy auth/login on upstream 405', async () => {
    const { default: handler } = await import('./_insforge-proxy');
    fetchMock
      .mockResolvedValueOnce(new Response('method not allowed', { status: 405 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accessToken: 'token-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }));

    const req = { method: 'POST', query: { path: 'auth/sessions' }, body: { email: 'a', password: 'b' }, headers: {} };
    const res = createRes();

    await handler(req, res);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://insforge.example/api/auth/sessions');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://insforge.example/api/auth/login');
    expect(res.statusCode).toBe(200);
    expect(sharedMocks.writeUpstreamResponse).toHaveBeenCalledTimes(1);
  });

  it('falls back from auth/sessions/current to legacy auth/me on upstream 405 and normalizes payload', async () => {
    const { default: handler } = await import('./_insforge-proxy');
    fetchMock
      .mockResolvedValueOnce(new Response('method not allowed', { status: 405 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'user-1', email: 'user@example.com' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }));

    const req = { method: 'GET', query: { path: 'auth/sessions/current' }, headers: {} };
    const res = createRes();

    await handler(req, res);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://insforge.example/api/auth/me');
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({
      user: {
        id: 'user-1',
        email: 'user@example.com'
      }
    });
  });

  it.each([401, 403, 405])('maps auth/refresh upstream %s to a local 404 payload', async (statusCode) => {
    const { default: handler } = await import('./_insforge-proxy');
    fetchMock.mockResolvedValueOnce(new Response('refresh unavailable', { status: statusCode }));

    const req = { method: 'POST', query: { path: 'auth/refresh' }, headers: {} };
    const res = createRes();

    await handler(req, res);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(404);
    expect(res.jsonBody).toEqual({
      error: 'not_found',
      message: 'Refresh not supported'
    });
  });

  it('passes non-auth routes straight through', async () => {
    const { default: handler } = await import('./_insforge-proxy');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));

    const req = { method: 'GET', query: { path: 'documents/list' }, headers: {} };
    const res = createRes();

    await handler(req, res);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://insforge.example/api/documents/list');
    expect(sharedMocks.writeUpstreamResponse).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
  });
});
