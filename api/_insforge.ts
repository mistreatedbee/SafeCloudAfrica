import { createClient } from '@insforge/sdk';

const DEFAULT_BASE_URL = 'https://pas375jb.us-west.insforge.app';

type InsforgeClient = ReturnType<typeof createClient>;

function getBaseUrl(): string {
  return (
    process.env.INSFORGE_BASE_URL ||
    process.env.VITE_INSFORGE_BASE_URL ||
    DEFAULT_BASE_URL
  );
}

function getAnonKey(): string {
  return process.env.INSFORGE_ANON_KEY || process.env.VITE_INSFORGE_ANON_KEY || '';
}

export function getServerInsforge(authToken?: string | null): InsforgeClient {
  const client = createClient({
    baseUrl: getBaseUrl(),
    anonKey: getAnonKey(),
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
