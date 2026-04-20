import { applyNoStoreHeaders } from '../_response.js';
import { resolveInsforgeOrigin } from '../_insforge-origin.js';
import { proxyAuthRequest } from './_proxy.js';

const MODULE = 'api.auth.refresh';

function getRefreshConfigError(): string | null {
  const origin = resolveInsforgeOrigin({ allowViteEnv: true, allowLinkedProjectFallback: true });
  if (!origin) {
    return 'Missing InsForge base URL. Set INSFORGE_BASE_URL or VITE_INSFORGE_BASE_URL, or link the project.';
  }

  const anonKey = String(process.env.INSFORGE_ANON_KEY ?? process.env.VITE_INSFORGE_ANON_KEY ?? '').trim();
  if (!anonKey) {
    return 'Missing InsForge anon key. Set INSFORGE_ANON_KEY or VITE_INSFORGE_ANON_KEY.';
  }

  return null;
}

export default async function handler(req: any, res: any) {
  applyNoStoreHeaders(res);
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const configError = getRefreshConfigError();
    if (configError) {
      return res.status(500).json({
        ok: false,
        error: 'Refresh service misconfigured',
        code: 'missing_refresh_config',
        data: {},
        details: configError
      });
    }
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
