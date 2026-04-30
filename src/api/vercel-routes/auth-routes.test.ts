import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  writeUpstreamResponse: vi.fn(async (res: any, upstreamRes: Response) => {
    res.statusCode = upstreamRes.status;
    res.bodyText = await upstreamRes.text();
  }),
  logStructuredLine: vi.fn()
}));

vi.mock('../../../api/_insforge-proxy/_shared.js', () => ({
  buildForwardHeaders: vi.fn(() => new Headers()),
  buildUpstreamUrl: vi.fn((origin: string, path: string) => `${origin}${path}`),
  getProxyBody: vi.fn((req: any) => req.body),
  startProxy: vi.fn(() => ({ requestId: 'req-1', upstreamOrigin: 'https://insforge.example' })),
  writeUpstreamResponse: sharedMocks.writeUpstreamResponse
}));

vi.mock('../../../api/_observability.js', () => ({
  logStructuredLine: sharedMocks.logStructuredLine
}));

type TestResponse = {
  headers: Record<string, string | string[]>;
  statusCode: number;
  jsonBody: unknown;
  bodyText: string;
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
      this.bodyText = payload;
    }
  };
}

describe('concrete auth API routes', () => {
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

  it('POST /api/auth/sessions falls back to legacy login when upstream sessions is unsupported', async () => {
    const { default: handler } = await import('../../../api/auth/sessions');
    fetchMock
      .mockResolvedValueOnce(new Response('method not allowed', { status: 405 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accessToken: 'token-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }));

    const req = { method: 'POST', body: { email: 'user@example.com', password: 'secret' }, headers: {} };
    const res = createRes();

    await handler(req, res);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://insforge.example/api/auth/sessions');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://insforge.example/api/auth/login');
    expect(res.statusCode).toBe(200);
    expect(sharedMocks.writeUpstreamResponse).toHaveBeenCalledTimes(1);
  });

  it('GET /api/auth/sessions reads the current session and normalizes legacy me payloads', async () => {
    const { default: handler } = await import('../../../api/auth/sessions');
    fetchMock
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'user-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }));

    const req = { method: 'GET', headers: {} };
    const res = createRes();

    await handler(req, res);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://insforge.example/api/auth/sessions/current');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://insforge.example/api/auth/me');
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ user: { id: 'user-1' } });
  });

  it.each([401, 403, 405])('POST /api/auth/refresh maps upstream %s to SDK fallback response', async (statusCode) => {
    const { default: handler } = await import('../../../api/auth/refresh');
    fetchMock.mockResolvedValueOnce(new Response('refresh unavailable', { status: statusCode }));

    const req = { method: 'POST', headers: {} };
    const res = createRes();

    await handler(req, res);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://insforge.example/api/auth/refresh');
    expect(res.statusCode).toBe(404);
    expect(res.jsonBody).toEqual({
      error: 'not_found',
      message: 'Refresh not supported'
    });
  });

  it('returns 405 only for unsupported concrete auth route methods', async () => {
    const { default: handler } = await import('../../../api/auth/refresh');
    const req = { method: 'GET', headers: {} };
    const res = createRes();

    await handler(req, res);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');
  });
});
