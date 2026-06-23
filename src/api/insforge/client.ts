import { createClient } from '@insforge/sdk';
import { createFreshFetch, getNoStoreHeaders } from '../liveData';
import { readBearerTokenFromHeaders, readStoredAccessToken } from './sessionState';

// IMPORTANT:
// - Vite injects env at build time; set VITE_INSFORGE_BASE_URL in .env / Vercel (no default tenant URL).
// - If baseUrl is empty, @insforge/sdk defaults to http://localhost:7130.
const configuredBaseUrl =
  String(((import.meta as any)?.env?.VITE_INSFORGE_BASE_URL as string | undefined) ?? '').trim();
const configuredAnonKey = ((import.meta as any)?.env?.VITE_INSFORGE_ANON_KEY as string | undefined) ?? '';

function resolveBaseUrl(rawBaseUrl: string): string {
  if (typeof window === 'undefined') return rawBaseUrl;
  const currentOrigin = window.location.origin;
  const currentHost = window.location.hostname.toLowerCase();
  const isLocalHost = currentHost === 'localhost' || currentHost === '127.0.0.1';

  // In production, prefer the Vercel same-origin proxy so auth/session calls and REST calls
  // share the platform rewrites and compatibility shims instead of hitting InsForge directly.
  if (!isLocalHost) {
    return currentOrigin;
  }

  if (!rawBaseUrl) {
    // Prevent SDK fallback to localhost:7130 when env is missing in production.
    // Same-origin may work when the hosting platform proxies `/api/*` to InsForge,
    // but the recommended setup is to provide the actual InsForge base URL.
    return currentOrigin;
  }
  try {
    return new URL(rawBaseUrl).origin;
  } catch {
    // If base URL is relative, normalize to absolute.
    if (rawBaseUrl.startsWith('/')) return `${currentOrigin}${rawBaseUrl}`;
  }
  return rawBaseUrl;
}

export const insforge = createClient({
  baseUrl: resolveBaseUrl(configuredBaseUrl),
  anonKey: configuredAnonKey,
  fetch: createFreshFetch(globalThis.fetch.bind(globalThis), {
    getBaseUrl: () => (insforge.getHttpClient() as { baseUrl: string }).baseUrl,
    getAccessToken: () => {
      try {
        const headers = insforge.getHttpClient().getHeaders();
        const token = readBearerTokenFromHeaders(headers);
        const anonKey = String(((insforge.getHttpClient() as unknown) as { anonKey?: string }).anonKey ?? '').trim();
        if (token && token !== anonKey) return token;
      } catch {
        // fall through to persisted token
      }
      return readStoredAccessToken();
    },
    setAccessToken: (token) => {
      insforge.getHttpClient().setAuthToken(token);
    }
  }),
  headers: Object.fromEntries(getNoStoreHeaders().entries())
  // Token persistence and refresh are handled by this app's own code
  // (sessionState.ts + ensureSession.ts), not by SDK config — InsForgeConfig
  // has no persistSession/autoRefreshToken option in @insforge/sdk@1.2.9.
});

type RuntimeClientConfig = {
  insforge?: {
    baseUrl?: string;
    anonKey?: string;
  };
};

function applyRuntimeConfig(config: RuntimeClientConfig | null | undefined): void {
  const runtimeBaseUrl = String(config?.insforge?.baseUrl ?? '').trim();
  const runtimeAnonKey = String(config?.insforge?.anonKey ?? '').trim();
  const httpClient = (insforge.getHttpClient() as unknown) as { baseUrl: string; anonKey?: string };

  if (runtimeBaseUrl) {
    httpClient.baseUrl = resolveBaseUrl(runtimeBaseUrl);
  }

  if (runtimeAnonKey) {
    httpClient.anonKey = runtimeAnonKey;
  }
}

export const insforgeReady: Promise<void> = (() => {
  if (typeof window === 'undefined') return Promise.resolve();
  if (configuredBaseUrl && configuredAnonKey) return Promise.resolve();

  return fetch('/api/client-config', {
    method: 'GET',
    headers: Object.fromEntries(getNoStoreHeaders().entries()),
    cache: 'no-store'
  })
    .then(async (response) => {
      if (!response.ok) return;
      const config = (await response.json()) as RuntimeClientConfig;
      applyRuntimeConfig(config);
    })
    .catch(() => {
      // Best-effort: leave existing config in place so proxy fallback can still try.
    });
})();
