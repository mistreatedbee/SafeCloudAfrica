import { insforge } from '../insforge/client';

export const DOCUMENTS_BUCKET = 'sca-documents';

export async function uploadDocumentFile(input: { companyId: string; file: File }): Promise<{ bucket: string; key: string }> {
  const key = `${input.companyId}/${Date.now()}-${input.file.name}`.replace(/\s+/g, '_');
  const { data, error } = await insforge.storage.from(DOCUMENTS_BUCKET).upload(key, input.file);
  if (error) throw error;
  if (!data) throw new Error('Upload failed.');
  return { bucket: DOCUMENTS_BUCKET, key: data.path ?? key };
}

export async function downloadDocumentFile(input: { bucket: string; key: string }): Promise<Blob> {
  const { data, error } = await insforge.storage.from(input.bucket).download(input.key);
  if (error) throw error;
  if (!data) throw new Error('Download failed.');
  return data;
}

export function openBlobInNewTab(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  // allow time for tab to load the URL, then release
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

