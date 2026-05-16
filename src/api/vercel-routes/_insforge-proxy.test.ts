import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  buildUpstreamUrl: vi.fn((origin: string, path: string) => `${origin}${path}`),
  buildForwardHeaders: vi.fn((req: any) => new Headers(req.headers ?? {})),
  writeUpstreamResponse: vi.fn(async (res: any, upstreamRes: Response) => {
    res.statusCode = upstreamRes.status;
    res.bodyText = await upstreamRes.text();
  }),
  logStructuredLine: vi.fn()
}));

vi.mock('../../../api/_insforge-proxy/_shared.js', () => ({
  buildForwardHeaders: sharedMocks.buildForwardHeaders,
  buildUpstreamUrl: sharedMocks.buildUpstreamUrl,
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
    sharedMocks.buildUpstreamUrl.mockClear();
    sharedMocks.writeUpstreamResponse.mockClear();
    sharedMocks.buildForwardHeaders.mockClear();
    sharedMocks.logStructuredLine.mockClear();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('falls back from auth/sessions to legacy auth/login on upstream 405', async () => {
    const { default: handler } = await import('../../../api/insforge-proxy');
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

  it('passes auth/sessions authentication failures through without converting them to 503', async () => {
    const { default: handler } = await import('../../../api/insforge-proxy');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'AUTH_UNAUTHORIZED' }), {
      status: 401,
      headers: { 'content-type': 'application/json' }
    }));

    const req = { method: 'POST', query: { path: 'auth/sessions' }, body: { email: 'a', password: 'b' }, headers: {} };
    const res = createRes();

    await handler(req, res);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://insforge.example/api/auth/sessions');
    expect(res.statusCode).toBe(401);
    expect(res.bodyText).toBe(JSON.stringify({ error: 'AUTH_UNAUTHORIZED' }));
    expect(sharedMocks.writeUpstreamResponse).toHaveBeenCalledTimes(1);
  });

  it('falls back from auth/sessions/current to legacy auth/me on upstream 405 and normalizes payload', async () => {
    const { default: handler } = await import('../../../api/insforge-proxy');
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
    const { default: handler } = await import('../../../api/insforge-proxy');
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
    const { default: handler } = await import('../../../api/insforge-proxy');
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

  it('passes storage confirm-upload routes straight through', async () => {
    const { default: handler } = await import('../../../api/insforge-proxy');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ key: 'company/doc.pdf' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));

    const req = {
      method: 'POST',
      query: { path: 'storage/buckets/sca-documents/objects/company%2Fdoc.pdf/confirm-upload' },
      body: { size: 123, contentType: 'application/pdf' },
      headers: {}
    };
    const res = createRes();

    await handler(req, res);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://insforge.example/api/storage/buckets/sca-documents/objects/company%2Fdoc.pdf/confirm-upload'
    );
    expect(sharedMocks.writeUpstreamResponse).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
  });

  it('proxies database record routes with the caller Authorization header', async () => {
    const { default: handler } = await import('../../../api/insforge-proxy');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'row-1' }]), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));

    const req = {
      method: 'GET',
      query: { path: 'database/records/notifications' },
      headers: { authorization: 'Bearer user-token' }
    };
    const res = createRes();

    await handler(req, res);

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://insforge.example/api/database/records/notifications');
    expect((fetchMock.mock.calls[0]?.[1]?.headers as Headers).get('authorization')).toBe('Bearer user-token');
    expect(sharedMocks.writeUpstreamResponse).toHaveBeenCalledTimes(1);
  });

  it('proxies database RPC routes with the caller Authorization header', async () => {
    const { default: handler } = await import('../../../api/insforge-proxy');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));

    const req = {
      method: 'POST',
      query: { path: 'database/rpc/ensure_me_as_super_admin' },
      body: {},
      headers: { authorization: 'Bearer user-token' }
    };
    const res = createRes();

    await handler(req, res);

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://insforge.example/api/database/rpc/ensure_me_as_super_admin');
    expect((fetchMock.mock.calls[0]?.[1]?.headers as Headers).get('authorization')).toBe('Bearer user-token');
    expect(sharedMocks.writeUpstreamResponse).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['POST', 'storage/buckets/sca-documents/objects/company%2Fdoc.pdf/confirm-upload'],
    ['PUT', 'storage/buckets/sca-documents/objects/company%2Fdoc.pdf'],
    ['POST', 'storage/buckets/sca-documents/objects/company%2Fdoc.pdf/download-strategy'],
    ['GET', 'storage/buckets/sca-documents/objects/company%2Fdoc.pdf']
  ])('preserves encoded slashes for %s %s from the raw URL', async (method, path) => {
    const { default: handler } = await import('../../../api/insforge-proxy');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));

    const req = {
      method,
      url: `/api/insforge-proxy?path=${path}`,
      query: { path: path.replace('%2F', '/') },
      body: method === 'GET' ? undefined : {},
      headers: {}
    };
    const res = createRes();

    await handler(req, res);

    expect(sharedMocks.buildUpstreamUrl).toHaveBeenCalledWith(
      'https://insforge.example',
      `/api/${path}`,
      req
    );
  });

  it('decodes encoded route separators while preserving encoded storage object slashes', async () => {
    const { default: handler } = await import('../../../api/insforge-proxy');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));

    const path = 'storage%2Fbuckets%2Fsca-documents%2Fobjects%2Fcompany%252Fdoc.pdf%2Fconfirm-upload';
    const req = {
      method: 'POST',
      url: `/api/insforge-proxy?path=${path}`,
      query: { path: 'storage/buckets/sca-documents/objects/company/doc.pdf/confirm-upload' },
      body: {},
      headers: {}
    };
    const res = createRes();

    await handler(req, res);

    expect(sharedMocks.buildUpstreamUrl).toHaveBeenCalledWith(
      'https://insforge.example',
      '/api/storage/buckets/sca-documents/objects/company%2Fdoc.pdf/confirm-upload',
      req
    );
  });
});
