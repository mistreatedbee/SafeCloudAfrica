import { applyNoStoreHeaders } from '../_response.js';
import { signJwtHs256 } from '../_jwt.js';
import { applyJson, canEditDocuments, getAppPublicOrigin, getDmsFileAccessSecret, getViewerRole, requireOnlyofficeConfigured, requireViewer } from './_shared.js';
import { getServerInsforge } from '../_insforge.js';

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

export default async function handler(req: any, res: any) {
  applyNoStoreHeaders(res);
  if (req.method !== 'GET') return applyJson(res, 405, { ok: false, error: 'Method not allowed' });

  try {
    const { docServerOrigin, jwtSecret } = requireOnlyofficeConfigured();
    const { token, userId, email } = await requireViewer(req);
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

    const isEditRequested = mode === 'edit';
    const allowEdit = isEditRequested && canEditDocuments(role) && v.status !== 'approved' && v.status !== 'archived';

    const origin = getAppPublicOrigin(req);
    const fileAccessSecret = getDmsFileAccessSecret();
    if (!fileAccessSecret) return applyJson(res, 500, { ok: false, error: 'DMS file access secret not configured.' });

    const fileToken = signJwtHs256(
      {
        aud: 'dms_file',
        bucket: v.storage_bucket,
        key: v.storage_key
      },
      fileAccessSecret,
      { expiresInSeconds: 10 * 60 }
    );

    const fileUrl = `${origin}/api/documents/file?token=${encodeURIComponent(fileToken)}`;
    const callbackUrl = `${origin}/api/documents/onlyoffice/callback`;

    const filename = v.original_filename || v.storage_key.split('/').pop() || `document-${v.id}.docx`;
    const type = guessDocumentType(v.mime_type, filename);

    const editorConfig = {
      documentType: type === 'cell' ? 'cell' : 'word',
      document: {
        fileType: type === 'cell' ? 'xlsx' : 'docx',
        key: v.id, // used by callback to map save -> version id
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

    // ONLYOFFICE uses a JWT to protect config + callback payloads when enabled on the doc server.
    const onlyofficeToken = signJwtHs256(editorConfig as any, jwtSecret, { expiresInSeconds: 10 * 60 });

    res.status(200).json({
      ok: true,
      docServerOrigin,
      config: editorConfig,
      token: onlyofficeToken
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
