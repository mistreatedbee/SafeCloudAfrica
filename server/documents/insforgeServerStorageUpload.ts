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
  size?: number;
  mimeType?: string;
};

export type ServerStorageUploadResult = {
  bucket: string;
  key: string;
  data: StorageUploadData;
};

function getHttpClient(client: any): {
  baseUrl: string;
  getHeaders: () => Record<string, string>;
} {
  return client.getHttpClient() as any;
}

function buildUrl(client: any, pathOrUrl: string): string {
  const http = getHttpClient(client);
  return new URL(pathOrUrl, http.baseUrl).toString();
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

function fallbackData(bucket: string, key: string, file: Blob): StorageUploadData {
  return {
    bucket,
    key,
    size: file.size,
    mimeType: file.type || 'application/octet-stream'
  };
}

async function requestJson<T>(client: any, method: string, pathOrUrl: string, body?: unknown): Promise<T> {
  const headers = new Headers(getHttpClient(client).getHeaders());
  headers.set('Content-Type', 'application/json;charset=UTF-8');

  const response = await fetch(buildUrl(client, pathOrUrl), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const payload = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(errorMessageFromPayload(payload, `Storage request failed with status ${response.status}.`));
  }

  return payload as T;
}

async function uploadPresigned(strategy: UploadStrategy, file: Blob): Promise<void> {
  if (!strategy.uploadUrl) throw new Error('Storage upload URL was not returned by InsForge.');

  const formData = new FormData();
  if (strategy.fields) {
    for (const [key, value] of Object.entries(strategy.fields)) {
      formData.append(key, value);
    }
  }
  formData.append('file', file);

  const response = await fetch(strategy.uploadUrl, { method: 'POST', body: formData });
  if (!response.ok) {
    throw new Error(`File upload failed before confirmation: ${response.status} ${response.statusText}`.trim());
  }
}

async function uploadDirect(client: any, bucket: string, key: string, file: Blob): Promise<StorageUploadData> {
  const headers = new Headers(getHttpClient(client).getHeaders());
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(
    buildUrl(client, `/api/storage/buckets/${encodeURIComponent(bucket)}/objects/${encodeURIComponent(key)}`),
    { method: 'PUT', headers, body: formData }
  );

  const payload = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(errorMessageFromPayload(payload, `Direct storage upload failed with status ${response.status}.`));
  }

  return normalizeStorageData(payload, fallbackData(bucket, key, file));
}

async function confirmUpload(client: any, bucket: string, key: string, strategy: UploadStrategy, file: Blob): Promise<StorageUploadData> {
  if (strategy.confirmRequired === false) return fallbackData(bucket, key, file);

  const path = strategy.confirmUrl || `/api/storage/buckets/${encodeURIComponent(bucket)}/objects/${encodeURIComponent(key)}/confirm-upload`;
  const payload = await requestJson<StorageUploadData>(client, 'POST', path, {
    size: file.size,
    contentType: file.type || 'application/octet-stream'
  });

  return normalizeStorageData(payload, fallbackData(bucket, key, file));
}

export async function uploadServerStorageFile(input: {
  client: any;
  bucket: string;
  key: string;
  file: Blob;
  filename?: string;
  metadata?: Record<string, string>;
}): Promise<ServerStorageUploadResult> {
  const contentType = input.file.type || 'application/octet-stream';
  const strategy = await requestJson<UploadStrategy>(
    input.client,
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

  const strategyKey = String(strategy.key || input.key);
  const method = String(strategy.method || '').toLowerCase();
  const data =
    method === 'direct'
      ? await uploadDirect(input.client, input.bucket, strategyKey, input.file)
      : method === 'presigned'
        ? (await uploadPresigned(strategy, input.file), await confirmUpload(input.client, input.bucket, strategyKey, strategy, input.file))
        : null;

  if (!data) throw new Error(`Unsupported InsForge storage upload method: ${strategy.method ?? 'unknown'}.`);

  return {
    bucket: input.bucket,
    key: String(data.key ?? data.path ?? strategyKey),
    data
  };
}
