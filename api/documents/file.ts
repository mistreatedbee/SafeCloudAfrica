import { applyNoStoreHeaders } from '../_response.js';
import { verifyJwtHs256 } from '../_jwt.js';
import { applyJson, getDmsFileAccessSecret, getServiceClientOrThrow } from './_shared.js';

type FileTokenPayload = {
  aud: string;
  bucket: string;
  key: string;
  exp: number;
  iat: number;
};

export default async function handler(req: any, res: any) {
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

