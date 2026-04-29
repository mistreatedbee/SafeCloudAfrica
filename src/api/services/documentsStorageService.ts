import { insforge } from '../insforge/client';

export const DOCUMENTS_BUCKET = 'sca-documents';
const ALLOWED_DOCUMENT_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx']);

function sanitizeFileName(name: string): string {
  const trimmed = name.trim() || 'document';
  return trimmed
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getExtension(name: string): string {
  const match = /\.([^.]+)$/.exec(name.trim().toLowerCase());
  return match?.[1] ?? '';
}

export async function uploadDocumentFile(input: { companyId: string; file: File }): Promise<{ bucket: string; key: string }> {
  const extension = getExtension(input.file.name || '');
  if (!ALLOWED_DOCUMENT_EXTENSIONS.has(extension)) {
    throw new Error('Only Word, Excel, and PDF documents are supported.');
  }

  const safeName = sanitizeFileName(input.file.name || 'document');
  const key = `${input.companyId}/${Date.now()}-${safeName}`;
  const { data, error } = await insforge.storage.from(DOCUMENTS_BUCKET).upload(key, input.file);
  if (error) throw new Error('File upload failed. Please try again.');
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

