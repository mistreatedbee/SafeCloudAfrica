import { applyNoStoreHeaders } from '../_response.js';
import { getServiceInsforge, getServerInsforge, readBearerToken, resolveServerUser } from '../_insforge.js';

/**
 * GET /api/auth/platform-admin
 * Returns { isPlatformAdmin: boolean } using the service role to bypass RLS on
 * the platform_admins table — the client cannot query this table directly because
 * RLS restricts access.
 */
export default async function handler(req: any, res: any) {
  applyNoStoreHeaders(res);

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const token = readBearerToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  try {
    const userInsforge = getServerInsforge(token);
    const actor = await resolveServerUser(userInsforge, token);
    if (!actor.userId) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const service = getServiceInsforge();
    if (!service) {
      // Service role key not configured — fall back to user-context query (may be restricted by RLS).
      const { data, error } = await userInsforge.database
        .from('platform_admins')
        .select('user_id')
        .eq('user_id', actor.userId)
        .maybeSingle();
      if (error) return res.status(200).json({ ok: true, isPlatformAdmin: false });
      return res.status(200).json({ ok: true, isPlatformAdmin: !!data });
    }

    const { data, error } = await service.database
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', actor.userId)
      .maybeSingle();

    if (error) return res.status(200).json({ ok: true, isPlatformAdmin: false });
    return res.status(200).json({ ok: true, isPlatformAdmin: !!data });
  } catch {
    return res.status(200).json({ ok: true, isPlatformAdmin: false });
  }
}
