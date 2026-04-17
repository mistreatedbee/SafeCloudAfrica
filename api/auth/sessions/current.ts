import { applyNoStoreHeaders } from '../../_response.js';
import { proxyAuthRequest } from '../_proxy.js';

const MODULE = 'api.auth.sessions.current';

export default async function handler(req: any, res: any) {
  applyNoStoreHeaders(res);
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  return proxyAuthRequest(req, res, '/api/auth/sessions/current', MODULE);
}
