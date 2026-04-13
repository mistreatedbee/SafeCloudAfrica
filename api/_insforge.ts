import { createClient } from '@insforge/sdk';

type InsforgeClient = ReturnType<typeof createClient>;
const NO_STORE_CACHE_CONTROL = 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0';

function getServerFetch(): typeof fetch {
  const baseFetch = globalThis.fetch.bind(globalThis);
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : null;
    const headers = new Headers(init?.headers ?? request?.headers);
    headers.set('Cache-Control', NO_STORE_CACHE_CONTROL);
    headers.set('Pragma', 'no-cache');
    headers.set('Expires', '0');
    const nextInit: RequestInit = {
      ...init,
      cache: 'no-store',
      headers
    };
    return request ? baseFetch(new Request(request, nextInit)) : baseFetch(input, nextInit);
  };
}

function getBaseUrl(): string {
  const raw =
    process.env.INSFORGE_BASE_URL?.trim() ||
    process.env.VITE_INSFORGE_BASE_URL?.trim() ||
    '';
  if (!raw) {
    throw new Error(
      'InsForge base URL not configured. Set INSFORGE_BASE_URL or VITE_INSFORGE_BASE_URL (e.g. on Vercel serverless env).'
    );
  }
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/+$/, '');
  }
}

function getAnonKey(): string {
  return process.env.INSFORGE_ANON_KEY || process.env.VITE_INSFORGE_ANON_KEY || '';
}

/** Service role key for server-side inserts that bypass RLS (e.g. platform_operational_events). */
export function getServiceRoleKey(): string {
  return process.env.INSFORGE_SERVICE_ROLE_KEY || '';
}

/** InsForge client using service role; use only in trusted server routes. Returns null if key unset. */
export function getServiceInsforge(): InsforgeClient | null {
  const key = getServiceRoleKey();
  if (!key) return null;
  return createClient({
    baseUrl: getBaseUrl(),
    anonKey: key,
    fetch: getServerFetch(),
    headers: {
      'Cache-Control': NO_STORE_CACHE_CONTROL,
      Pragma: 'no-cache',
      Expires: '0'
    },
    persistSession: false,
    autoRefreshToken: false
  });
}

export function getServerInsforge(authToken?: string | null): InsforgeClient {
  const client = createClient({
    baseUrl: getBaseUrl(),
    anonKey: getAnonKey(),
    fetch: getServerFetch(),
    headers: {
      'Cache-Control': NO_STORE_CACHE_CONTROL,
      Pragma: 'no-cache',
      Expires: '0'
    },
    persistSession: false,
    autoRefreshToken: false
  });

  if (authToken) {
    client.getHttpClient().setAuthToken(authToken);
  }

  return client;
}

export function readBearerToken(req: any): string | null {
  const header = req?.headers?.authorization || req?.headers?.Authorization;
  if (!header || typeof header !== 'string') return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== 'bearer') return null;
  return token.trim() || null;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function addDaysIso(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export type RequestActor = {
  userId: string | null;
  organizationId: string | null;
};

/** Resolve user from Bearer JWT and organization from body.meta.orgId / body.organizationId. */
export async function resolveRequestActor(req: any, body?: Record<string, unknown> | null): Promise<RequestActor> {
  const b = body ?? {};
  const meta = (b as { meta?: Record<string, unknown> }).meta;
  const orgRaw =
    (meta && typeof meta === 'object' && meta !== null ? (meta as any).orgId : null) ??
    (b as { organizationId?: unknown }).organizationId;
  const organizationId = orgRaw != null && String(orgRaw).trim() ? String(orgRaw).trim() : null;

  const token = readBearerToken(req);
  if (!token) {
    return { userId: null, organizationId };
  }
  try {
    const insforge = getServerInsforge(token);
    const sessionResult = await insforge.auth.getCurrentSession();
    const uid = sessionResult.data?.session?.user?.id;
    return { userId: uid ? String(uid) : null, organizationId };
  } catch {
    return { userId: null, organizationId };
  }
}
