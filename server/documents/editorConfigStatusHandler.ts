import { applyNoStoreHeaders } from '../../api/_response.js';
import { getAppPublicOrigin, requireOnlyofficeConfigured } from '../../api/documents/_shared.js';

export default async function handler(_req: any, res: any) {
  applyNoStoreHeaders(res);
  try {
    let docServerOrigin = '';
    let jwtSecretPresent = false;
    try {
      const cfg = requireOnlyofficeConfigured();
      docServerOrigin = String(cfg.docServerOrigin || '');
      jwtSecretPresent = Boolean(String(cfg.jwtSecret || '').trim());
    } catch (e) {
      // missing config
    }

    let appPublicOriginSet = false;
    try {
      const origin = getAppPublicOrigin({ headers: {} } as any);
      appPublicOriginSet = Boolean(origin);
    } catch {
      appPublicOriginSet = false;
    }

    res.status(200).json({
      ok: true,
      onlyoffice: {
        configured: Boolean(docServerOrigin && jwtSecretPresent),
        docServerOrigin: docServerOrigin || null,
        jwtSecretPresent
      },
      appPublicOriginSet
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}
