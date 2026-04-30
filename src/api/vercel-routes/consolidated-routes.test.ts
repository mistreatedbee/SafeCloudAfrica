import { beforeEach, describe, expect, it, vi } from 'vitest';

const routeMocks = vi.hoisted(() => ({
  acceptInviteHandler: vi.fn((_req: any, res: any) => res.status(200).json({ routed: 'accept' })),
  createInviteHandler: vi.fn((_req: any, res: any) => res.status(200).json({ routed: 'create' })),
  resendInviteHandler: vi.fn((_req: any, res: any) => res.status(200).json({ routed: 'resend' })),
  validateInviteHandler: vi.fn((_req: any, res: any, token?: string) => res.status(200).json({ routed: 'validate', token })),
  editorConfigHandler: vi.fn((_req: any, res: any) => res.status(200).json({ routed: 'editor-config' })),
  editorConfigStatusHandler: vi.fn((_req: any, res: any) => res.status(200).json({ routed: 'editor-config-status' })),
  fileHandler: vi.fn((_req: any, res: any) => res.status(200).json({ routed: 'file' })),
  onlyofficeCallbackHandler: vi.fn((_req: any, res: any) => res.status(200).json({ routed: 'onlyoffice-callback' }))
}));

vi.mock('../../../server/invites/acceptHandler.js', () => ({
  default: routeMocks.acceptInviteHandler
}));

vi.mock('../../../server/invites/createHandler.js', () => ({
  default: routeMocks.createInviteHandler
}));

vi.mock('../../../server/invites/resendHandler.js', () => ({
  default: routeMocks.resendInviteHandler
}));

vi.mock('../../../server/invites/validateHandler.js', () => ({
  validateInviteHandler: routeMocks.validateInviteHandler
}));

vi.mock('../../../server/documents/editorConfigHandler.js', () => ({
  default: routeMocks.editorConfigHandler
}));

vi.mock('../../../server/documents/editorConfigStatusHandler.js', () => ({
  default: routeMocks.editorConfigStatusHandler
}));

vi.mock('../../../server/documents/fileHandler.js', () => ({
  default: routeMocks.fileHandler
}));

vi.mock('../../../server/documents/onlyofficeCallbackHandler.js', () => ({
  default: routeMocks.onlyofficeCallbackHandler
}));

type TestResponse = {
  headers: Record<string, string | string[]>;
  statusCode: number;
  jsonBody: unknown;
  setHeader: (key: string, value: string | string[]) => void;
  status: (code: number) => TestResponse;
  json: (payload: unknown) => TestResponse;
};

function createRes(): TestResponse {
  return {
    headers: {},
    statusCode: 200,
    jsonBody: null,
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
    }
  };
}

describe('consolidated Vercel API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['create', 'create'],
    ['accept', 'accept'],
    ['resend', 'resend']
  ])('routes /api/invites/%s through the invites catch-all', async (action, expected) => {
    const { default: handler } = await import('../../../api/invites/[...action]');
    const req = { method: 'POST', query: { action }, headers: {}, body: {} };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ routed: expected });
  });

  it('routes /api/invites/validate/:token and forwards the path token', async () => {
    const { default: handler } = await import('../../../api/invites/[...action]');
    const req = { method: 'GET', query: { action: ['validate', 'token-1'] }, headers: {} };
    const res = createRes();

    await handler(req, res);

    expect(routeMocks.validateInviteHandler).toHaveBeenCalledWith(req, res, 'token-1');
    expect(res.jsonBody).toEqual({ routed: 'validate', token: 'token-1' });
  });

  it('routes /api/documents/editor-config-status through the documents catch-all', async () => {
    const { default: handler } = await import('../../../api/documents/[...slug]');
    const req = { method: 'GET', query: { slug: ['editor-config-status'] }, headers: {} };
    const res = createRes();

    await handler(req, res);

    expect(routeMocks.editorConfigStatusHandler).toHaveBeenCalledWith(req, res);
    expect(res.jsonBody).toEqual({ routed: 'editor-config-status' });
  });

  it.each([
    [['editor-config'], routeMocks.editorConfigHandler, { routed: 'editor-config' }],
    [['editor-config-status'], routeMocks.editorConfigStatusHandler, { routed: 'editor-config-status' }],
    [['file'], routeMocks.fileHandler, { routed: 'file' }],
    [['onlyoffice', 'callback'], routeMocks.onlyofficeCallbackHandler, { routed: 'onlyoffice-callback' }]
  ])('routes /api/documents/%s through the documents catch-all', async (slug, expectedHandler, expectedBody) => {
    const { default: handler } = await import('../../../api/documents/[...slug]');
    const req = { method: 'GET', query: { slug }, headers: {} };
    const res = createRes();

    await handler(req, res);

    expect(expectedHandler).toHaveBeenCalledWith(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual(expectedBody);
  });

  it('does not self-rewrite document editor paths away from the catch-all', async () => {
    const { default: vercelConfig } = await import('../../../vercel.json');
    const rewrites = (vercelConfig as any).rewrites as Array<{ source: string; destination: string }>;
    const blockedSources = new Set([
      '/api/documents/editor-config',
      '/api/documents/editor-config-status',
      '/api/documents/file',
      '/api/documents/onlyoffice/callback'
    ]);

    expect(rewrites.filter((rewrite) => blockedSources.has(rewrite.source))).toEqual([]);
  });
});
