import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const httpClient = {
    baseUrl: 'https://app.example',
    getHeaders: vi.fn(() => ({ Authorization: 'Bearer user-token' }))
  };

  return {
    httpClient,
    ensureInsforgeSession: vi.fn(async () => ({ accessToken: 'user-token', userId: 'user-1' }))
  };
});

vi.mock('../insforge/client', () => ({
  insforge: {
    getHttpClient: () => mocks.httpClient
  }
}));

vi.mock('../insforge/ensureSession', () => ({
  ensureInsforgeSession: mocks.ensureInsforgeSession
}));

import { uploadInsforgeStorageFile } from './insforgeStorageUpload';

function jsonResponse(payload: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {})
    }
  });
}

function textResponse(text: string, init?: ResponseInit): Response {
  return new Response(text, init);
}

describe('uploadInsforgeStorageFile', () => {
  const fetchMock = vi.fn();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    mocks.ensureInsforgeSession.mockClear();
    mocks.httpClient.getHeaders.mockClear();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('uploads with a presigned URL and confirms with the provided confirmUrl', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        method: 'presigned',
        uploadUrl: 'https://s3.example/upload',
        confirmRequired: true,
        confirmUrl: '/api/storage/buckets/sca-documents/objects/company%2Fdoc.pdf/confirm-upload',
        key: 'company/doc.pdf'
      }))
      .mockResolvedValueOnce(textResponse('', { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({ key: 'company/doc.pdf' }));

    const result = await uploadInsforgeStorageFile({
      bucket: 'sca-documents',
      key: 'company/doc.pdf',
      file: new Blob(['doc'], { type: 'application/pdf' }),
      filename: 'doc.pdf'
    });

    expect(result).toEqual({
      bucket: 'sca-documents',
      key: 'company/doc.pdf',
      data: { key: 'company/doc.pdf' }
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://app.example/api/storage/buckets/sca-documents/upload-strategy');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://s3.example/upload');
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      'https://app.example/api/storage/buckets/sca-documents/objects/company%2Fdoc.pdf/confirm-upload'
    );
    expect(fetchMock.mock.calls[2]?.[1]?.method).toBe('POST');
  });

  it('confirms presigned uploads with encoded slash keys', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        method: 'presigned',
        uploadUrl: 'https://s3.example/upload',
        confirmRequired: true,
        key: 'org-1/1777545037381-Thuso.pdf'
      }))
      .mockResolvedValueOnce(textResponse('', { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({ key: 'org-1/1777545037381-Thuso.pdf' }));

    const result = await uploadInsforgeStorageFile({
      bucket: 'sca-documents',
      key: 'org-1/1777545037381-Thuso.pdf',
      file: new Blob(['doc'], { type: 'application/pdf' })
    });

    expect(result.key).toBe('org-1/1777545037381-Thuso.pdf');
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      'https://app.example/api/storage/buckets/sca-documents/objects/org-1%2F1777545037381-Thuso.pdf/confirm-upload'
    );
  });

  it('falls back to direct PUT upload when presigned confirmation returns 404', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        method: 'presigned',
        uploadUrl: 'https://s3.example/upload',
        confirmRequired: true,
        key: 'company/doc.pdf'
      }))
      .mockResolvedValueOnce(textResponse('', { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({ message: 'Cannot POST' }, { status: 404 }))
      .mockResolvedValueOnce(jsonResponse({ key: 'company/doc.pdf' }, { status: 201 }));

    const result = await uploadInsforgeStorageFile({
      bucket: 'sca-documents',
      key: 'company/doc.pdf',
      file: new Blob(['doc'], { type: 'application/pdf' })
    });

    expect(result.key).toBe('company/doc.pdf');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[3]?.[0]).toBe(
      'https://app.example/api/storage/buckets/sca-documents/objects/company%2Fdoc.pdf'
    );
    expect(fetchMock.mock.calls[3]?.[1]?.method).toBe('PUT');
  });

  it('retries the canonical confirm route when the provided confirmUrl returns 404', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        method: 'presigned',
        uploadUrl: 'https://s3.example/upload',
        confirmRequired: true,
        confirmUrl: '/api/storage/buckets/sca-documents/company%2Fdoc.pdf/confirm-upload',
        key: 'company/doc.pdf'
      }))
      .mockResolvedValueOnce(textResponse('', { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({ error: 'not_found' }, { status: 404 }))
      .mockResolvedValueOnce(jsonResponse({ path: 'company/doc.pdf' }));

    const result = await uploadInsforgeStorageFile({
      bucket: 'sca-documents',
      key: 'company/doc.pdf',
      file: new Blob(['doc'], { type: 'application/pdf' })
    });

    expect(result.key).toBe('company/doc.pdf');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      'https://app.example/api/storage/buckets/sca-documents/company%2Fdoc.pdf/confirm-upload'
    );
    expect(fetchMock.mock.calls[3]?.[0]).toBe(
      'https://app.example/api/storage/buckets/sca-documents/objects/company%2Fdoc.pdf/confirm-upload'
    );
  });

  it('uploads through the direct strategy', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ method: 'direct' }))
      .mockResolvedValueOnce(jsonResponse({ key: 'company/direct.pdf' }));

    const result = await uploadInsforgeStorageFile({
      bucket: 'sca-documents',
      key: 'company/direct.pdf',
      file: new Blob(['doc'], { type: 'application/pdf' })
    });

    expect(result.key).toBe('company/direct.pdf');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://app.example/api/storage/buckets/sca-documents/objects/company%2Fdirect.pdf'
    );
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('PUT');
  });

  it('reports a clear presigned upload failure before confirmation', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        method: 'presigned',
        uploadUrl: 'https://s3.example/upload',
        confirmRequired: true,
        key: 'company/doc.pdf'
      }))
      .mockResolvedValueOnce(textResponse('denied', { status: 403, statusText: 'Forbidden' }));

    await expect(uploadInsforgeStorageFile({
      bucket: 'sca-documents',
      key: 'company/doc.pdf',
      file: new Blob(['doc'], { type: 'application/pdf' })
    })).rejects.toThrow('File upload failed before confirmation');
  });

  it('reports a clear confirmation failure after upload', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        method: 'presigned',
        uploadUrl: 'https://s3.example/upload',
        confirmRequired: true,
        key: 'company/doc.pdf'
      }))
      .mockResolvedValueOnce(textResponse('', { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({ message: 'No such route' }, { status: 403 }));

    await expect(uploadInsforgeStorageFile({
      bucket: 'sca-documents',
      key: 'company/doc.pdf',
      file: new Blob(['doc'], { type: 'application/pdf' })
    })).rejects.toThrow('Storage upload confirmation failed');
  });

  it('reports a clear error when direct upload fallback fails after confirmation 404', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        method: 'presigned',
        uploadUrl: 'https://s3.example/upload',
        confirmRequired: true,
        key: 'company/doc.pdf'
      }))
      .mockResolvedValueOnce(textResponse('', { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({ message: 'No such route' }, { status: 404 }))
      .mockResolvedValueOnce(jsonResponse({ message: 'Direct route failed' }, { status: 500 }));

    await expect(uploadInsforgeStorageFile({
      bucket: 'sca-documents',
      key: 'company/doc.pdf',
      file: new Blob(['doc'], { type: 'application/pdf' })
    })).rejects.toThrow('direct upload fallback failed');
  });
});
