import { insforge } from '../insforge/client';
import { ensureInsforgeSession } from '../insforge/ensureSession';

type UploadStrategy = {
  method?: string;
  uploadUrl?: string;
  confirmUrl?: string;
  confirmRequired?: boolean;
  fields?: Record<string, string>;
  key?: string;
};

type StorageUploadData = {
  key?: string;
  path?: string;
  bucket?: string;
  url?: string;
  size?: number;
  mimeType?: string;
  uploadedAt?: string;
};

class StorageHttpError extends Error {
  status?: number;
  payload?: unknown;

  constructor(message: string, options?: { status?: number; payload?: unknown }) {
    super(message);
    this.name = 'StorageHttpError';
    this.status = options?.status;
    this.payload = options?.payload;
  }
}

class StorageConfirmationError extends Error {
  status?: number;
  payload?: unknown;

  constructor(message: string, options?: { status?: number; payload?: unknown }) {
    super(message);
    this.name = 'StorageConfirmationError';
    this.status = options?.status;
    this.payload = options?.payload;
  }
}

export type InsforgeStorageUploadResult = {
  bucket: string;
  key: string;
  data: StorageUploadData;
};

function getHttpClient(): {
  baseUrl: string;
  getHeaders: () => Record<string, string>;
} {
  return insforge.getHttpClient() as any;
}

function buildInsforgeUrl(pathOrUrl: string): string {
  const http = getHttpClient();
  return new URL(pathOrUrl, http.baseUrl).toString();
}

function buildCanonicalConfirmPath(bucket: string, key: string): string {
  return `/api/storage/buckets/${encodeURIComponent(bucket)}/objects/${encodeURIComponent(key)}/confirm-upload`;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('json')) return response.json();
  return response.text();
}

function errorMessageFromPayload(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    const message = obj.message ?? obj.error;
    if (typeof message === 'string' && message.trim()) return message;
  }
  if (typeof payload === 'string' && payload.trim()) return payload;
  return fallback;
}

function normalizeStorageData(payload: unknown, fallback: StorageUploadData): StorageUploadData {
  if (payload && typeof payload === 'object') return payload as StorageUploadData;
  return fallback;
}

function buildStorageDataFallback(bucket: string, key: string, file: File | Blob): StorageUploadData {
  return {
    key,
    bucket,
    size: file.size,
    mimeType: file.type || 'application/octet-stream',
    uploadedAt: new Date().toISOString()
  };
}

async function requestInsforgeJson<T>(method: string, pathOrUrl: string, body?: unknown): Promise<T> {
  const http = getHttpClient();
  const headers = new Headers(http.getHeaders());
  headers.set('Content-Type', 'application/json;charset=UTF-8');

  const response = await fetch(buildInsforgeUrl(pathOrUrl), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const payload = await parseResponseBody(response);
  if (!response.ok) {
    const message = errorMessageFromPayload(payload, `Storage request failed with status ${response.status}.`);
    throw new StorageHttpError(message, { status: response.status, payload });
  }

  return payload as T;
}

async function uploadWithPresignedUrl(strategy: UploadStrategy, file: File | Blob): Promise<void> {
  if (!strategy.uploadUrl) throw new Error('Storage upload URL was not returned by InsForge.');

  const formData = new FormData();
  if (strategy.fields) {
    for (const [key, value] of Object.entries(strategy.fields)) {
      formData.append(key, value);
    }
  }
  formData.append('file', file);

  const response = await fetch(strategy.uploadUrl, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    throw new Error(`File upload failed before confirmation: ${response.status} ${response.statusText}`.trim());
  }
}

async function uploadDirect(bucket: string, key: string, file: File | Blob): Promise<StorageUploadData> {
  const http = getHttpClient();
  const headers = new Headers(http.getHeaders());
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(
    buildInsforgeUrl(`/api/storage/buckets/${encodeURIComponent(bucket)}/objects/${encodeURIComponent(key)}`),
    {
      method: 'PUT',
      headers,
      body: formData
    }
  );

  const payload = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(errorMessageFromPayload(payload, `Direct storage upload failed with status ${response.status}.`));
  }

  return normalizeStorageData(payload, buildStorageDataFallback(bucket, key, file));
}

async function confirmPresignedUpload(input: {
  bucket: string;
  key: string;
  strategy: UploadStrategy;
  file: File | Blob;
}): Promise<StorageUploadData> {
  const body = {
    size: input.file.size,
    contentType: input.file.type || 'application/octet-stream'
  };

  const canonicalPath = buildCanonicalConfirmPath(input.bucket, input.key);
  const confirmUrl = input.strategy.confirmUrl || canonicalPath;

  try {
    const payload = await requestInsforgeJson<StorageUploadData>('POST', confirmUrl, body);
    return normalizeStorageData(payload, buildStorageDataFallback(input.bucket, input.key, input.file));
  } catch (error) {
    if ((error as { status?: number }).status !== 404 || confirmUrl === canonicalPath) {
      throw new StorageConfirmationError(`Storage upload confirmation failed: ${(error as Error).message}`, {
        status: (error as { status?: number }).status,
        payload: (error as { payload?: unknown }).payload
      });
    }
  }

  try {
    const payload = await requestInsforgeJson<StorageUploadData>('POST', canonicalPath, body);
    return normalizeStorageData(payload, buildStorageDataFallback(input.bucket, input.key, input.file));
  } catch (error) {
    throw new StorageConfirmationError(`Storage upload confirmation failed: ${(error as Error).message}`, {
      status: (error as { status?: number }).status,
      payload: (error as { payload?: unknown }).payload
    });
  }
}

export async function uploadInsforgeStorageFile(input: {
  bucket: string;
  key: string;
  file: File | Blob;
  filename?: string;
  metadata?: Record<string, string>;
}): Promise<InsforgeStorageUploadResult> {
  await ensureInsforgeSession({ reason: 'storage-upload' });

  const contentType = input.file.type || 'application/octet-stream';
  const strategy = await requestInsforgeJson<UploadStrategy>(
    'POST',
    `/api/storage/buckets/${encodeURIComponent(input.bucket)}/upload-strategy`,
    {
      filename: input.key,
      originalFilename: input.filename,
      contentType,
      size: input.file.size,
      metadata: input.metadata
    }
  );

  const method = String(strategy.method ?? '').toLowerCase();
  const strategyKey = String(strategy.key || input.key);

  if (method === 'direct') {
    const data = await uploadDirect(input.bucket, strategyKey, input.file);
    return {
      bucket: input.bucket,
      key: String(data.key ?? data.path ?? strategyKey),
      data
    };
  }

  if (method === 'presigned') {
    await uploadWithPresignedUrl(strategy, input.file);
    let data: StorageUploadData;
    try {
      data = strategy.confirmRequired === false
        ? buildStorageDataFallback(input.bucket, strategyKey, input.file)
        : await confirmPresignedUpload({
            bucket: input.bucket,
            key: strategyKey,
            strategy,
            file: input.file
          });
    } catch (error) {
      if ((error as { status?: number }).status !== 404) throw error;
      try {
        data = await uploadDirect(input.bucket, strategyKey, input.file);
      } catch (directError) {
        throw new Error(`Storage upload confirmation failed and direct upload fallback failed: ${(directError as Error).message}`);
      }
    }

    return {
      bucket: input.bucket,
      key: String(data.key ?? data.path ?? strategyKey),
      data
    };
  }

  throw new Error(`Unsupported InsForge storage upload method: ${strategy.method ?? 'unknown'}.`);
}

export function getInsforgeStoragePublicUrl(bucket: string, key: string): string {
  return buildInsforgeUrl(`/api/storage/buckets/${encodeURIComponent(bucket)}/objects/${encodeURIComponent(key)}`);
}
