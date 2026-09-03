import { insforge } from '../insforge/client';
import { ensureInsforgeSession } from '../insforge/ensureSession';
import { getErrorMessage } from '../insforge/errors';
import { getInsforgeStoragePublicUrl, uploadInsforgeStorageFile } from './insforgeStorageUpload';

export type StorageBucket =
  | 'sca-documents'
  | 'sca-templates'
  | 'sca-logos'
  | 'sca-evidence'
  | 'sca-training-certificates'
  | 'sca-medical-certificates';

export interface UploadResult {
  bucket: StorageBucket;
  key: string;
  url: string;
  size: number;
  mimeType: string;
}

/**
 * Upload a file to InsForge storage
 */
async function uploadFileViaSdk(
  bucket: StorageBucket,
  file: File,
  key: string
): Promise<UploadResult> {
  await ensureInsforgeSession({ reason: `storage-upload:sdk:${bucket}` });

  const { data, error } = await insforge.storage.from(bucket).upload(key, file);
  if (error) throw new Error(`Storage upload failed: ${getErrorMessage(error)}`);

  const uploadedKey = String(
    (data as Record<string, unknown> | null)?.path ??
      (data as Record<string, unknown> | null)?.key ??
      key
  );

  return {
    bucket,
    key: uploadedKey,
    url: getPublicUrl(bucket, uploadedKey),
    size: file.size,
    mimeType: file.type || 'application/octet-stream'
  };
}

export async function uploadFile(
  bucket: StorageBucket,
  file: File,
  options?: {
    key?: string;
    metadata?: Record<string, string>;
  }
): Promise<UploadResult> {
  const key = options?.key || `${Date.now()}-${file.name}`;

  // Evidence uploads must work for every company role (assignees, employees, auditors).
  // The custom upload-strategy HTTP path is restricted for some non-admin users on InsForge.
  if (bucket === 'sca-evidence') {
    return uploadFileViaSdk(bucket, file, key);
  }

  const result = await uploadInsforgeStorageFile({
    bucket,
    key,
    file,
    filename: file.name,
    metadata: options?.metadata
  });

  return {
    bucket,
    key: result.key,
    url: getPublicUrl(bucket, result.key),
    size: file.size,
    mimeType: file.type
  };
}

/**
 * Delete a file from storage
 */
export async function deleteFile(bucket: StorageBucket, key: string): Promise<void> {
  await ensureInsforgeSession();

  const { error } = await insforge.storage
    .from(bucket)
    .remove(key);

  if (error) throw new Error(`Delete failed: ${error.message}`);
}

/**
 * Get public URL for a file
 */
export function getPublicUrl(bucket: StorageBucket, key: string): string {
  try {
    return insforge.storage.from(bucket).getPublicUrl(key);
  } catch {
    return getInsforgeStoragePublicUrl(bucket, key);
  }
}

/**
 * List files in a bucket (with optional prefix)
 */
export async function listFiles(
  bucket: StorageBucket,
  options?: {
    limit?: number;
    offset?: number;
    prefix?: string;
  }
) {
  await ensureInsforgeSession();

  const { data, error } = await insforge.storage
    .from(bucket)
    .list({
      prefix: options?.prefix,
      limit: options?.limit || 100,
      offset: options?.offset || 0
    });

  if (error) throw new Error(`List failed: ${error.message}`);

  return data || [];
}
