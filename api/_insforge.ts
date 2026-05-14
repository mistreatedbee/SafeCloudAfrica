import { createClient } from '@insforge/sdk';
import { resolveInsforgeOrigin } from './_insforge-origin.js';

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
  const origin = resolveInsforgeOrigin({ allowViteEnv: true, allowLinkedProjectFallback: true });
  if (!origin) {
    throw new Error(
      'InsForge base URL not configured. Set INSFORGE_BASE_URL (recommended) or VITE_INSFORGE_BASE_URL, or link the project to generate `.insforge/project.json`.'
    );
  }
  return origin;
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

type BearerJwtClaims = {
  sub?: string;
  email?: string;
};

function decodeBearerJwtClaims(token: string | null | undefined): BearerJwtClaims | null {
  if (!token) return null;
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = `${normalized}${'='.repeat((4 - (normalized.length % 4)) % 4)}`;
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as BearerJwtClaims;
  } catch {
    return null;
  }
}

export async function resolveServerUser(insforge: InsforgeClient, authToken: string): Promise<{ userId: string | null; email: string | null }> {
  try {
    const getSession = (insforge.auth as any).getCurrentSession;
    const sessionResult = await (typeof getSession === 'function'
      ? getSession.call(insforge.auth)
      : insforge.auth.getCurrentUser());
    const sessionUser = sessionResult.data?.session?.user ?? sessionResult.data?.user ?? null;
    const userId = sessionUser?.id ? String(sessionUser.id) : null;
    const email = sessionUser?.email ? String(sessionUser.email).trim().toLowerCase() : null;
    if (userId) {
      return { userId, email };
    }
  } catch {
    // Fall through to JWT claim decoding.
  }

  const claims = decodeBearerJwtClaims(authToken);
  return {
    userId: claims?.sub ? String(claims.sub) : null,
    email: claims?.email ? String(claims.email).trim().toLowerCase() : null
  };
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
    const actor = await resolveServerUser(insforge, token);
    return { userId: actor.userId ? String(actor.userId) : null, organizationId };
  } catch {
    return { userId: null, organizationId };
  }
}
