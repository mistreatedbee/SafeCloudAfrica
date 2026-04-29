import { applyNoStoreHeaders } from '../../api/_response.js';
import { verifyJwtHs256 } from '../../api/_jwt.js';
import {
  applyJson,
  canViewRestrictedDocuments,
  getDmsFileAccessSecret,
  getServiceClientOrThrow
} from '../../api/documents/_shared.js';

type FileTokenPayload = {
  aud: string;
  bucket: string;
  key: string;
  companyId?: string;
  versionId?: string;
  role?: string;
  restricted?: boolean;
  exp: number;
  iat: number;
};

export default async function fileHandler(req: any, res: any) {
  applyNoStoreHeaders(res);
  if (req.method !== 'GET') return applyJson(res, 405, { ok: false, error: 'Method not allowed' });

  try {
    const token = String(req?.query?.token || '').trim();
    if (!token) return applyJson(res, 400, { ok: false, error: 'Missing token' });

    const secret = getDmsFileAccessSecret();
    if (!secret) return applyJson(res, 500, { ok: false, error: 'DMS file access secret not configured.' });

    const payload = verifyJwtHs256<FileTokenPayload>(token, secret);
    if (payload.aud !== 'dms_file') return applyJson(res, 403, { ok: false, error: 'Invalid token' });

    const bucket = String(payload.bucket || '').trim();
    const key = String(payload.key || '').trim();
    if (!bucket || !key) return applyJson(res, 400, { ok: false, error: 'Invalid token payload' });

    const svc = getServiceClientOrThrow();
    if (payload.versionId && payload.companyId) {
      const { data: version, error: versionError } = await svc.database
        .from('document_versions')
        .select('id,company_id,document_id,storage_bucket,storage_key')
        .eq('id', payload.versionId)
        .eq('company_id', payload.companyId)
        .maybeSingle();
      if (versionError || !version) return applyJson(res, 404, { ok: false, error: 'File not found' });
      if (String((version as any).storage_bucket || '') !== bucket || String((version as any).storage_key || '') !== key) {
        return applyJson(res, 403, { ok: false, error: 'Invalid token payload' });
      }

      const { data: document } = await svc.database
        .from('documents')
        .select('is_restricted')
        .eq('company_id', payload.companyId)
        .eq('id', (version as any).document_id)
        .maybeSingle();
      const isRestricted = Boolean((document as any)?.is_restricted ?? payload.restricted);
      if (isRestricted && !canViewRestrictedDocuments((payload.role || null) as any)) {
        return applyJson(res, 403, { ok: false, error: 'Not allowed' });
      }
    } else if (payload.restricted && !canViewRestrictedDocuments((payload.role || null) as any)) {
      return applyJson(res, 403, { ok: false, error: 'Not allowed' });
    }

    const { data, error } = await svc.storage.from(bucket).download(key);
    if (error) return applyJson(res, 404, { ok: false, error: 'File not found' });
    if (!data) return applyJson(res, 404, { ok: false, error: 'File not found' });

    const buf = Buffer.from(await data.arrayBuffer());
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', String(buf.length));
    res.status(200).send(buf);
  } catch (e: any) {
    applyJson(res, 403, { ok: false, error: String(e?.message || e) });
  }
}
