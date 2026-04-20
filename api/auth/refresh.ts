import { applyNoStoreHeaders } from '../_response.js';
import { proxyAuthRequest } from './_proxy.js';

const MODULE = 'api.auth.refresh';

export default async function handler(req: any, res: any) {
  applyNoStoreHeaders(res);
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    return await proxyAuthRequest(req, res, '/api/auth/refresh', MODULE);
  } catch (error: any) {
    return res.status(401).json({
      ok: false,
      error: 'Invalid or expired session',
      code: 'refresh_handler_failed',
      data: {},
      details: error?.message ? String(error.message) : 'Refresh request failed.'
    });
  }
}
