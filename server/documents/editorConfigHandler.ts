import { createHash } from 'node:crypto';
import { applyNoStoreHeaders } from '../../api/_response.js';
import { signJwtHs256 } from '../../api/_jwt.js';
import {
  applyJson,
  canEditDocuments,
  canViewRestrictedDocuments,
  getAppPublicOrigin,
  getDmsFileAccessSecret,
  getViewerRole,
  requireOnlyofficeConfigured,
  requireViewer
} from '../../api/documents/_shared.js';
import { getServerInsforge } from '../../api/_insforge.js';

type DocumentVersionRow = {
  id: string;
  company_id: string;
  document_id: string;
  version_label: string;
  status: string;
  storage_bucket: string | null;
  storage_key: string | null;
  original_filename: string | null;
  mime_type: string | null;
  file_size: number | null;
  updated_at: string;
};

function guessDocumentType(mime: string | null, filename: string | null): 'word' | 'cell' {
  const name = String(filename || '').toLowerCase();
  const mt = String(mime || '').toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xls') || mt.includes('spreadsheet')) return 'cell';
  return 'word';
}

function resolveFileType(filename: string | null, fallback: 'docx' | 'xlsx'): string {
  const match = /\.([a-z0-9]+)$/i.exec(String(filename || '').trim());
  const ext = match?.[1]?.toLowerCase();
  return ext || fallback;
}

function isEditableFileType(fileType: string): boolean {
  return fileType === 'doc' || fileType === 'docx' || fileType === 'xls' || fileType === 'xlsx';
}

export function buildOnlyofficeDocumentKey(input: {
  versionId: string;
  storageKey: string | null;
  updatedAt: string | null;
  fileSize: number | null;
}): string {
  const versionPart = String(input.versionId || 'version').replace(/[^a-z0-9_-]/gi, '').slice(0, 32) || 'version';
  const hash = createHash('sha256')
    .update([
      input.versionId || '',
      input.storageKey || '',
      input.updatedAt || '',
      String(input.fileSize ?? '')
    ].join('|'))
    .digest('hex')
    .slice(0, 16);
  return `${versionPart}-${hash}`;
}

function getFriendlyEditorError(error: string): string {
  const normalized = String(error || '').toLowerCase();
  if (
    normalized.includes('onlyoffice_docserver_origin') ||
    normalized.includes('onlyoffice_jwt_secret') ||
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
  return String(error || 'Unable to open editor.');
}

export default async function editorConfigHandler(req: any, res: any) {
  applyNoStoreHeaders(res);
  // Log incoming request for diagnostics
  try {
    console.info('[editorConfigHandler] %s %s %o', req.method, req.url || req.path || '', { query: req.query });
  } catch (logErr) {
    // ignore logging failures
  }
  if (req.method !== 'GET') return applyJson(res, 405, { ok: false, error: 'Method not allowed' });

  try {
    const { token, userId, email } = await requireViewer(req);
    try {
      console.info('[editorConfigHandler] viewer resolved', { userId, email });
    } catch {}
    const versionId = String(req?.query?.versionId || '').trim();
    const mode = String(req?.query?.mode || 'view').trim().toLowerCase() === 'edit' ? 'edit' : 'view';
    if (!versionId) return applyJson(res, 400, { ok: false, error: 'Missing versionId' });

    const insforge = getServerInsforge(token);
    const { data: version, error: verErr } = await insforge.database
      .from('document_versions')
      .select('*')
      .eq('id', versionId)
      .maybeSingle();
    if (verErr) return applyJson(res, 403, { ok: false, error: 'Not allowed' });
    if (!version) return applyJson(res, 404, { ok: false, error: 'Not found' });

    const v = version as any as DocumentVersionRow;
    if (!v.storage_bucket || !v.storage_key) {
      return applyJson(res, 409, { ok: false, error: 'This version has no file attached yet.' });
    }

    const role = await getViewerRole({ token, companyId: v.company_id, userId });
    if (!role) return applyJson(res, 403, { ok: false, error: 'Not allowed' });

    const { data: document, error: docErr } = await insforge.database
      .from('documents')
      .select('id,is_restricted')
      .eq('company_id', v.company_id)
      .eq('id', v.document_id)
      .maybeSingle();
    if (docErr || !document) return applyJson(res, 404, { ok: false, error: 'Document not found' });

    const isRestricted = Boolean((document as any).is_restricted);
    if (isRestricted && !canViewRestrictedDocuments(role)) {
      return applyJson(res, 403, { ok: false, error: 'Not allowed' });
    }

    const isEditRequested = mode === 'edit';
    const filename = v.original_filename || v.storage_key.split('/').pop() || `document-${v.id}.docx`;
    const type = guessDocumentType(v.mime_type, filename);
    const fileType = resolveFileType(filename, type === 'cell' ? 'xlsx' : 'docx');
    const isPdf = fileType === 'pdf';
    const isEditableType = isEditableFileType(fileType);
    const allowEdit = isEditRequested && canEditDocuments(role) && (!isRestricted || canViewRestrictedDocuments(role)) && v.status !== 'approved' && v.status !== 'archived';

    const origin = getAppPublicOrigin(req);
    const fileAccessSecret = getDmsFileAccessSecret();
    if (!fileAccessSecret) {
      return applyJson(res, 200, {
        ok: true,
        editorAvailable: false,
        friendlyError: getFriendlyEditorError('DMS file access secret not configured.'),
        error: 'DMS file access secret not configured.',
        fileName: filename,
        fileType,
        canEdit: false,
        fileUrl: null,
        downloadUrl: null
      });
    }

    const fileToken = signJwtHs256(
      {
        aud: 'dms_file',
        bucket: v.storage_bucket,
        key: v.storage_key,
        companyId: v.company_id,
        versionId: v.id,
        role,
        restricted: isRestricted
      },
      fileAccessSecret,
      { expiresInSeconds: 10 * 60 }
    );

    const fileUrl = `${origin}/api/documents/file?token=${encodeURIComponent(fileToken)}`;
    const callbackUrl = `${origin}/api/documents/onlyoffice/callback`;
    const downloadUrl = fileUrl;

    if (isEditRequested && isPdf) {
      return applyJson(res, 200, {
        ok: true,
        editorAvailable: false,
        friendlyError: getFriendlyEditorError('PDF files are view/download only.'),
        error: 'PDF files are view/download only.',
        fileName: filename,
        fileType,
        canEdit: false,
        fileUrl,
        downloadUrl
      });
    }

    if (!isEditableType) {
      return applyJson(res, 200, {
        ok: true,
        editorAvailable: false,
        friendlyError: getFriendlyEditorError('This file type is not supported in the document editor.'),
        error: 'This file type is not supported in the document editor.',
        fileName: filename,
        fileType,
        canEdit: false,
        fileUrl,
        downloadUrl
      });
    }

    let docServerOrigin: string | null = null;
    let jwtSecret: string | null = null;
    try {
      const config = requireOnlyofficeConfigured();
      docServerOrigin = config.docServerOrigin;
      jwtSecret = config.jwtSecret;
    } catch (configError: any) {
      console.warn('[editorConfigHandler] onlyoffice config error', String(configError?.message || configError));
      return applyJson(res, 200, {
        ok: true,
        editorAvailable: false,
        friendlyError: getFriendlyEditorError(String(configError?.message || configError)),
        error: String(configError?.message || configError),
        fileName: filename,
        fileType,
        canEdit: allowEdit,
        fileUrl,
        downloadUrl
      });
    }

    const editorConfig = {
      documentType: type === 'cell' ? 'cell' : 'word',
      document: {
        fileType,
        key: buildOnlyofficeDocumentKey({
          versionId: v.id,
          storageKey: v.storage_key,
          updatedAt: v.updated_at,
          fileSize: v.file_size
        }),
        title: filename,
        url: fileUrl,
        permissions: {
          edit: allowEdit,
          download: true,
          print: true
        }
      },
      editorConfig: {
        mode: allowEdit ? 'edit' : 'view',
        callbackUrl,
        user: {
          id: String(userId),
          name: String(email || `User ${String(userId).slice(0, 8)}`)
        },
        customization: {
          compactToolbar: false,
          help: true
        }
      }
    };

    const onlyofficeToken = signJwtHs256(editorConfig as any, jwtSecret, { expiresInSeconds: 10 * 60 });

    res.status(200).json({
      ok: true,
      editorAvailable: true,
      docServerOrigin,
      config: editorConfig,
      token: onlyofficeToken,
      fileName: filename,
      fileType,
      canEdit: allowEdit,
      fileUrl,
      downloadUrl
    });
  } catch (e: any) {
    try {
      console.error('[editorConfigHandler] unexpected error', e && e.stack ? e.stack : String(e));
    } catch {}
    return applyJson(res, 500, { ok: false, error: String(e?.message || e) });
  }
}
