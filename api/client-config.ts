import { resolveInsforgeOrigin } from './_insforge-origin.js';
import { applyNoStoreHeaders } from './_response.js';

function readAnonKey(): string {
  return (process.env.INSFORGE_ANON_KEY || process.env.VITE_INSFORGE_ANON_KEY || '').trim();
}

export default function handler(_req: any, res: any) {
  applyNoStoreHeaders(res);

  const baseUrl = resolveInsforgeOrigin({ allowViteEnv: true, allowLinkedProjectFallback: true });
  const anonKey = readAnonKey();

  res.status(200).json({
    insforge: {
      baseUrl,
      anonKey
    }
  });
}
