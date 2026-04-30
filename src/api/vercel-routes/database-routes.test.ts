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

describe('concrete database API routes', () => {
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

  it('POST /api/database/rpc/:functionName forwards to the InsForge RPC endpoint', async () => {
    const { default: handler } = await import('../../../api/database/rpc/[functionName]');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));

    const req = {
      method: 'POST',
      query: { functionName: 'ensure_me_as_super_admin' },
      body: {},
      headers: {}
    };
    const res = createRes();

    await handler(req, res);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://insforge.example/api/database/rpc/ensure_me_as_super_admin');
    expect(sharedMocks.writeUpstreamResponse).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
  });

  it('database RPC route forwards missing-auth upstream 401 instead of returning a Vercel 405', async () => {
    const { default: handler } = await import('../../../api/database/rpc/[functionName]');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'AUTH_INVALID_CREDENTIALS' }), {
      status: 401,
      headers: { 'content-type': 'application/json' }
    }));

    const req = {
      method: 'POST',
      query: { functionName: 'ensure_me_as_super_admin' },
      body: {},
      headers: {}
    };
    const res = createRes();

    await handler(req, res);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(401);
    expect(res.bodyText).toBe(JSON.stringify({ error: 'AUTH_INVALID_CREDENTIALS' }));
  });

  it('GET /api/database/records/:path forwards to the InsForge records endpoint', async () => {
    const { default: handler } = await import('../../../api/database/records/[...path]');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([{ role: 'owner' }]), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));

    const req = {
      method: 'GET',
      query: { path: ['company_memberships'] },
      headers: {}
    };
    const res = createRes();

    await handler(req, res);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://insforge.example/api/database/records/company_memberships');
    expect(sharedMocks.writeUpstreamResponse).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
  });

  it('database records route forwards missing-auth upstream 401 instead of returning SPA HTML', async () => {
    const { default: handler } = await import('../../../api/database/records/[...path]');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'AUTH_INVALID_CREDENTIALS' }), {
      status: 401,
      headers: { 'content-type': 'application/json' }
    }));

    const req = {
      method: 'GET',
      query: { path: ['company_memberships'] },
      headers: {}
    };
    const res = createRes();

    await handler(req, res);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(401);
    expect(res.bodyText).toBe(JSON.stringify({ error: 'AUTH_INVALID_CREDENTIALS' }));
  });
});
