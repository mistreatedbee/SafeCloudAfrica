import { applyNoStoreHeaders } from '../_response.js';
import { proxyAuthRequest } from './_proxy.js';

const MODULE = 'api.auth.refresh';

export default async function handler(req: any, res: any) {
  applyNoStoreHeaders(res);
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  return proxyAuthRequest(req, res, '/api/auth/refresh', MODULE);
}
