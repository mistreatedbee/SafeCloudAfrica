export type EditorConfigResponse = {
  ok: boolean;
  editorAvailable?: boolean;
  docServerOrigin?: string | null;
  config?: any;
  token?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  canEdit?: boolean;
  fileUrl?: string | null;
  downloadUrl?: string | null;
  friendlyError?: string;
  error?: string;
};

export const EDITOR_ROUTE_MISCONFIGURED_MESSAGE =
  'Document editor service route is unavailable or misconfigured. Please contact the system administrator.';

export function toFriendlyEditorMessage(error: string | null | undefined): string {
  const normalized = String(error || '').toLowerCase();
  if (
    normalized.includes('onlyoffice_docserver_origin') ||
    normalized.includes('onlyoffice_jwt_secret') ||
    normalized.includes('failed to load onlyoffice api script') ||
    normalized.includes('doceditor api not available') ||
    normalized.includes('dms file access secret') ||
    normalized.includes('public origin')
  ) {
    return 'Document editor is not configured yet. Please contact the system administrator.';
  }
  if (normalized.includes('pdf files are view/download only')) {
    return 'PDF files cannot be edited. Please download or view the file.';
  }
  if (normalized.includes('not supported')) {
    return 'This file type is not supported in the document editor.';
  }
  if (
    normalized.includes('uploaded file could not be retrieved from storage') ||
    normalized.includes('uploaded file is missing from storage') ||
    normalized.includes('dms_storage_file_')
  ) {
    return 'The document record was saved, but the uploaded file could not be retrieved from storage. Please re-upload the file or contact the system administrator.';
  }
  return String(error || 'Unable to open editor.');
}

export async function readEditorConfigResponse(res: Response): Promise<EditorConfigResponse> {
  const contentType = res.headers.get('content-type')?.toLowerCase() || '';
  if (contentType.includes('application/json')) {
    return (await res.json()) as EditorConfigResponse;
  }

  const body = await res.text().catch(() => '');
  const normalizedBody = body.trim().toLowerCase();
  const looksLikeHtml = normalizedBody.startsWith('<!doctype') || normalizedBody.startsWith('<html') || normalizedBody.includes('<body');
  if (looksLikeHtml || contentType.includes('text/html')) {
    throw new Error(EDITOR_ROUTE_MISCONFIGURED_MESSAGE);
  }

  throw new Error(EDITOR_ROUTE_MISCONFIGURED_MESSAGE);
}
