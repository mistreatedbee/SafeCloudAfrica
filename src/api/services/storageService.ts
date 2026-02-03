import { insforge } from '../insforge/client';
import { ensureInsforgeSession } from '../insforge/ensureSession';

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
export async function uploadFile(
  bucket: StorageBucket,
  file: File,
  options?: {
    key?: string;
    metadata?: Record<string, string>;
  }
): Promise<UploadResult> {
  await ensureInsforgeSession();

  // Generate key if not provided
  const key = options?.key || `${Date.now()}-${file.name}`;

  // Upload to storage
  const { data, error } = await insforge.storage
    .from(bucket)
    .upload(key, file, {
      cacheControl: '3600',
      upsert: false,
      metadata: options?.metadata
    });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  // Get public URL
  const { data: urlData } = insforge.storage
    .from(bucket)
    .getPublicUrl(key);

  return {
    bucket,
    key,
    url: urlData.publicUrl,
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
    .remove([key]);

  if (error) throw new Error(`Delete failed: ${error.message}`);
}

/**
 * Get public URL for a file
 */
export function getPublicUrl(bucket: StorageBucket, key: string): string {
  const { data } = insforge.storage
    .from(bucket)
    .getPublicUrl(key);

  return data.publicUrl;
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
    .list(options?.prefix, {
      limit: options?.limit || 100,
      offset: options?.offset || 0,
      sortBy: { column: 'name', order: 'asc' }
    });

  if (error) throw new Error(`List failed: ${error.message}`);

  return data || [];
}