import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServiceClientOrThrow: vi.fn(),
  requireOnlyofficeConfigured: vi.fn(),
  verifyJwtHs256: vi.fn(),
  uploadServerStorageFile: vi.fn()
}));

vi.mock('../../api/documents/_shared.js', () => ({
  applyJson: (res: any, status: number, payload: any) => res.status(status).json(payload),
  getServiceClientOrThrow: mocks.getServiceClientOrThrow,
  requireOnlyofficeConfigured: mocks.requireOnlyofficeConfigured
}));

vi.mock('../../api/_jwt.js', () => ({
  verifyJwtHs256: mocks.verifyJwtHs256
}));

vi.mock('./insforgeServerStorageUpload.js', () => ({
  uploadServerStorageFile: mocks.uploadServerStorageFile
}));

type TestResponse = {
  headers: Record<string, string | string[]>;
  statusCode: number;
  jsonBody: unknown;
  sentBody: unknown;
  setHeader: (key: string, value: string | string[]) => void;
  status: (code: number) => TestResponse;
  json: (payload: unknown) => TestResponse;
  send: (payload: unknown) => TestResponse;
};

function createRes(): TestResponse {
  return {
    headers: {},
    statusCode: 200,
    jsonBody: null,
    sentBody: null,
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
    send(payload) {
      this.sentBody = payload;
      return this;
    }
  };
}

function createServiceClient(options?: { updateError?: unknown }) {
  const version = {
    id: 'version-1',
    company_id: 'company-1',
    document_id: 'doc-1',
    status: 'draft',
    storage_bucket: 'sca-documents',
    storage_key: 'company-1/original.docx',
    original_filename: 'Original.docx',
    mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  };
  const update = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(async () => ({ error: options?.updateError ?? null }))
    }))
  }));
  const insert = vi.fn(async () => ({ error: null }));

  return {
    version,
    update,
    insert,
    client: {
      database: {
        from: vi.fn((table: string) => {
          if (table === 'document_versions') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: version, error: null }))
                }))
              })),
              update
            };
          }
          if (table === 'activity_logs') return { insert };
          throw new Error(`Unexpected table ${table}`);
        })
      }
    }
  };
}

async function callHandler(body: Record<string, unknown>, service = createServiceClient()) {
  const { default: handler } = await import('./onlyofficeCallbackHandler');
  const req = {
    method: 'POST',
    headers: { authorization: 'Bearer callback-token' },
    body
  };
  const res = createRes();

  mocks.getServiceClientOrThrow.mockReturnValue(service.client);
  await handler(req, res);
  return { res, service };
}

describe('onlyofficeCallbackHandler', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.requireOnlyofficeConfigured.mockReturnValue({ jwtSecret: 'secret', docServerOrigin: 'https://onlyoffice.example' });
    mocks.verifyJwtHs256.mockReturnValue({});
    mocks.uploadServerStorageFile.mockResolvedValue({ bucket: 'sca-documents', key: 'company-1/versions/version-1/saved.docx', data: {} });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })));
  });

  it('saves status 2 callbacks by downloading, uploading, and updating the version row', async () => {
    const { res, service } = await callHandler({ key: 'version-1', status: 2, url: 'https://onlyoffice.example/saved', filetype: 'docx' });

    expect(res.statusCode).toBe(200);
    expect(res.sentBody).toBe(JSON.stringify({ error: 0 }));
    expect(fetch).toHaveBeenCalledWith('https://onlyoffice.example/saved');
    expect(mocks.uploadServerStorageFile).toHaveBeenCalledWith(expect.objectContaining({
      client: service.client,
      bucket: 'sca-documents',
      key: expect.stringMatching(/^company-1\/versions\/version-1\/\d+\.docx$/)
    }));
    expect(service.update).toHaveBeenCalledWith(expect.objectContaining({
      storage_bucket: 'sca-documents',
      storage_key: 'company-1/versions/version-1/saved.docx',
      file_size: 3
    }));
  });

  it('saves status 6 callbacks when a save URL is provided', async () => {
    const { res } = await callHandler({ key: 'version-1', status: 6, url: 'https://onlyoffice.example/force-save', filetype: 'docx' });

    expect(res.statusCode).toBe(200);
    expect(res.sentBody).toBe(JSON.stringify({ error: 0 }));
    expect(mocks.uploadServerStorageFile).toHaveBeenCalledTimes(1);
  });

  it('ignores non-save statuses without changing storage or database rows', async () => {
    const service = createServiceClient();
    const { res } = await callHandler({ key: 'version-1', status: 1 }, service);

    expect(res.statusCode).toBe(200);
    expect(res.sentBody).toBe(JSON.stringify({ error: 0 }));
    expect(mocks.uploadServerStorageFile).not.toHaveBeenCalled();
    expect(service.update).not.toHaveBeenCalled();
  });

  it('returns a clear JSON error when upload fails', async () => {
    mocks.uploadServerStorageFile.mockRejectedValue(new Error('upload unavailable'));

    const { res } = await callHandler({ key: 'version-1', status: 2, url: 'https://onlyoffice.example/saved', filetype: 'docx' });

    expect(res.statusCode).toBe(502);
    expect(res.jsonBody).toEqual({ ok: false, error: 'Failed to upload updated file: upload unavailable' });
  });

  it('returns a clear JSON error when the version update fails', async () => {
    const service = createServiceClient({ updateError: { message: 'database unavailable' } });

    const { res } = await callHandler({ key: 'version-1', status: 2, url: 'https://onlyoffice.example/saved', filetype: 'docx' }, service);

    expect(res.statusCode).toBe(502);
    expect(res.jsonBody).toEqual({ ok: false, error: 'Failed to update version record' });
  });
});
