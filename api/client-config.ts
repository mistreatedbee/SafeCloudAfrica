import { resolveInsforgeOrigin } from './_insforge-origin.js';
import { applyNoStoreHeaders } from './_response.js';

function readAnonKey(): string {
  return (process.env.INSFORGE_ANON_KEY || process.env.VITE_INSFORGE_ANON_KEY || '').trim();
}

function resolveClientBaseUrl(req: any): string {
  const forwardedHost = String(req?.headers?.['x-forwarded-host'] ?? '').trim();
  const host = forwardedHost || String(req?.headers?.host ?? '').trim();
  if (!host) return '';
  const proto = String(req?.headers?.['x-forwarded-proto'] ?? 'https').trim() || 'https';
  return `${proto}://${host}`;
}

export default function handler(req: any, res: any) {
  applyNoStoreHeaders(res);

  const sameOriginBaseUrl = resolveClientBaseUrl(req);
  const baseUrl = sameOriginBaseUrl || resolveInsforgeOrigin({ allowViteEnv: true, allowLinkedProjectFallback: true });
  const anonKey = readAnonKey();

  res.status(200).json({
    insforge: {
      baseUrl,
      anonKey
    }
  });
}
