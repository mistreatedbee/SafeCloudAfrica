import { applyNoStoreHeaders } from '../../_response.js';
import { verifyJwtHs256 } from '../../_jwt.js';
import { applyJson, getServiceClientOrThrow, requireOnlyofficeConfigured } from '../_shared.js';

type OnlyOfficeCallbackBody = {
  key?: string;
  status?: number;
  url?: string;
  users?: string[];
  actions?: Array<{ type: number; userid: string }>;
  filetype?: string;
  title?: string;
  token?: string;
};

function readAuthToken(req: any, body: OnlyOfficeCallbackBody): string | null {
  const header = req?.headers?.authorization || req?.headers?.Authorization;
  if (header && typeof header === 'string') {
    const [scheme, token] = header.split(' ');
    if (scheme && token && scheme.toLowerCase() === 'bearer') return token.trim();
  }
  if (body?.token && typeof body.token === 'string') return body.token.trim();
  return null;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
}

export default async function handler(req: any, res: any) {
  applyNoStoreHeaders(res);

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).send('');
  }

  if (req.method !== 'POST') return applyJson(res, 405, { ok: false, error: 'Method not allowed' });

  try {
    const { jwtSecret } = requireOnlyofficeConfigured();

    const body = (req.body || {}) as OnlyOfficeCallbackBody;
    const authToken = readAuthToken(req, body);
    if (!authToken) return applyJson(res, 403, { ok: false, error: 'Missing ONLYOFFICE callback token.' });

    // We verify the callback JWT, but we don't depend on its exact payload shape.
    verifyJwtHs256<Record<string, unknown>>(authToken, jwtSecret);

    const versionId = String(body.key || '').trim();
    const status = Number(body.status || 0);

    // Status codes: 2 means "document is ready for saving" in ONLYOFFICE.
    if (!versionId) return applyJson(res, 400, { ok: false, error: 'Missing key' });
    if (status !== 2) {
      // Acknowledge other statuses so ONLYOFFICE doesn't keep retrying.
      res.setHeader('Content-Type', 'application/json');
      Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v));
      return res.status(200).send(JSON.stringify({ error: 0 }));
    }

    const downloadUrl = String(body.url || '').trim();
    if (!downloadUrl) return applyJson(res, 400, { ok: false, error: 'Missing save URL' });

    const svc = getServiceClientOrThrow();

    const { data: version, error: verErr } = await svc.database
      .from('document_versions')
      .select('*')
      .eq('id', versionId)
      .maybeSingle();

    if (verErr || !version) return applyJson(res, 404, { ok: false, error: 'Unknown document version' });

    const v: any = version;
    if (String(v.status) === 'approved' || String(v.status) === 'archived') {
      return applyJson(res, 409, { ok: false, error: 'Approved documents are read-only. Create a draft version to edit.' });
    }

    // Download updated file from ONLYOFFICE.
    const fetched = await fetch(downloadUrl);
    if (!fetched.ok) {
      return applyJson(res, 502, { ok: false, error: `Failed to fetch updated file (${fetched.status})` });
    }

    const arr = await fetched.arrayBuffer();
    const buf = Buffer.from(arr);

    const companyId = String(v.company_id);
    const ext = String(body.filetype || '').trim() || (String(v.original_filename || '').split('.').pop() || 'bin');
    const safeExt = ext.replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin';
    const key = `${companyId}/versions/${versionId}/${Date.now()}.${safeExt}`;
    const bucket = String(v.storage_bucket || 'sca-documents');

    const blob = new Blob([buf], { type: String(v.mime_type || 'application/octet-stream') });
    const { data: up, error: upErr } = await svc.storage.from(bucket).upload(key, blob as any, { upsert: false });
    if (upErr) return applyJson(res, 502, { ok: false, error: 'Failed to upload updated file' });

    const nextKey = (up as any)?.path ? String((up as any).path) : key;

    // Update draft version to point at the newly uploaded object.
    const { error: patchErr } = await svc.database
      .from('document_versions')
      .update({
        storage_bucket: bucket,
        storage_key: nextKey,
        file_size: buf.length,
        updated_at: new Date().toISOString()
      })
      .eq('id', versionId)
      .eq('company_id', companyId);
    if (patchErr) return applyJson(res, 502, { ok: false, error: 'Failed to update version record' });

    // Audit trail (best-effort)
    try {
      await svc.database.from('activity_logs').insert({
        company_id: companyId,
        actor_user_id: null,
        action: 'documents.onlyoffice_saved',
        entity_type: 'document_version',
        entity_id: versionId,
        metadata: {
          document_id: String(v.document_id),
          file_size: buf.length,
          users: body.users ?? null,
          actions: body.actions ?? null
        }
      });
    } catch {
      // Best-effort.
    }

    res.setHeader('Content-Type', 'application/json');
    Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).send(JSON.stringify({ error: 0 }));
  } catch (e: any) {
    return applyJson(res, 500, { ok: false, error: String(e?.message || e) });
  }
}
