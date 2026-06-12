import {
  clearAuthStorage,
  emitAuthFailure,
  markSessionExpired,
  refreshSessionThroughProxy
} from './insforge/sessionState';

const LIVE_DATA_MUTATED_EVENT = 'sca:data-mutated';
const BACKEND_UNAVAILABLE_EVENT = 'sca:backend-unavailable';

export type LiveDataMutationDetail = {
  source: 'insforge';
  method: string;
  url: string;
  status: number;
  at: number;
  release: string;
};

export type BackendUnavailableDetail = {
  source: 'insforge';
  status: number | null;
  url: string;
  at: number;
  release: string;
};

const NO_STORE_CACHE_CONTROL = 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0';

function mergeHeaders(...headerSets: Array<HeadersInit | undefined>): Headers {
  const headers = new Headers();
  for (const headerSet of headerSets) {
    if (!headerSet) continue;
    const next = new Headers(headerSet);
    next.forEach((value, key) => {
      headers.set(key, value);
    });
  }
  return headers;
}

function normalizeMethod(method?: string): string {
  return String(method ?? 'GET').toUpperCase();
}

function shouldEmitMutation(method: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method);
}

export function getNoStoreHeaders(headers?: HeadersInit): Headers {
  const merged = mergeHeaders(headers);
  if (!merged.has('Cache-Control')) merged.set('Cache-Control', NO_STORE_CACHE_CONTROL);
  if (!merged.has('Pragma')) merged.set('Pragma', 'no-cache');
  if (!merged.has('Expires')) merged.set('Expires', '0');
  if (!merged.has('X-SafeCloud-Release')) merged.set('X-SafeCloud-Release', __APP_VERSION__ || 'dev');
  return merged;
}

export type AuthenticatedFetchHandlers = {
  getBaseUrl: () => string;
  getAccessToken: () => string | null;
  setAccessToken: (token: string | null) => void;
};

export function emitLiveDataMutation(detail: Omit<LiveDataMutationDetail, 'at' | 'release'>): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<LiveDataMutationDetail>(LIVE_DATA_MUTATED_EVENT, {
      detail: {
        ...detail,
        at: Date.now(),
        release: __APP_VERSION__ || 'dev'
      }
    })
  );
}

export function emitBackendUnavailable(detail: Omit<BackendUnavailableDetail, 'at' | 'release'>): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<BackendUnavailableDetail>(BACKEND_UNAVAILABLE_EVENT, {
      detail: {
        ...detail,
        at: Date.now(),
        release: __APP_VERSION__ || 'dev'
      }
    })
  );
}

export function subscribeToLiveDataMutations(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = () => listener();
  window.addEventListener(LIVE_DATA_MUTATED_EVENT, handler as EventListener);
  return () => window.removeEventListener(LIVE_DATA_MUTATED_EVENT, handler as EventListener);
}

export function subscribeToBackendUnavailable(listener: (detail: BackendUnavailableDetail) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = (event: Event) => {
    const ev = event as CustomEvent<BackendUnavailableDetail>;
    if (!ev?.detail) return;
    listener(ev.detail);
  };
  window.addEventListener(BACKEND_UNAVAILABLE_EVENT, handler as EventListener);
  return () => window.removeEventListener(BACKEND_UNAVAILABLE_EVENT, handler as EventListener);
}

function cloneBodyForRetry(request: Request | null, init?: RequestInit): RequestInit['body'] {
  if (init && 'body' in init) return init.body;
  if (!request) return undefined;
  return undefined;
}

function shouldAttemptRefresh(response: Response): boolean {
  return response.status === 401 || response.status === 403;
}

function isAuthRefreshRequest(input: RequestInfo | URL): boolean {
  const raw = input instanceof Request ? input.url : String(input);
  try {
    const url = new URL(raw, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    return url.pathname === '/api/auth/refresh';
  } catch {
    return raw.includes('/api/auth/refresh');
  }
}

export function createFreshFetch(baseFetch: typeof fetch, auth?: AuthenticatedFetchHandlers): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : null;
    const method = normalizeMethod(init?.method ?? request?.method);
    const headers = getNoStoreHeaders(init?.headers ?? request?.headers);
    const accessToken = auth?.getAccessToken();
    if (accessToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }
    const nextInit: RequestInit = {
      ...init,
      credentials: init?.credentials ?? request?.credentials ?? 'include',
      cache: 'no-store',
      headers
    };

    let response: Response;
    try {
      response = request
        ? await baseFetch(new Request(request, nextInit))
        : await baseFetch(input, nextInit);
    } catch (err: any) {
      const url = request?.url ?? String(input);
      emitBackendUnavailable({
        source: 'insforge',
        status: null,
        url
      });
      throw err;
    }

    if (auth && shouldAttemptRefresh(response) && !isAuthRefreshRequest(input)) {
      const refresh = await refreshSessionThroughProxy({
        baseUrl: auth.getBaseUrl(),
        fetch: baseFetch
      });
      if (refresh.ok) {
        auth.setAccessToken(refresh.accessToken);
        const retryHeaders = getNoStoreHeaders(init?.headers ?? request?.headers);
        retryHeaders.set('Authorization', `Bearer ${refresh.accessToken}`);
        const retryInit: RequestInit = {
          ...init,
          credentials: init?.credentials ?? request?.credentials ?? 'include',
          cache: 'no-store',
          headers: retryHeaders,
          body: cloneBodyForRetry(request, init)
        };
        response = request
          ? await baseFetch(new Request(request, retryInit))
          : await baseFetch(input, retryInit);
      }

      if (!refresh.ok && refresh.reason === 'invalid_session') {
        auth.setAccessToken(null);
        clearAuthStorage();
        markSessionExpired();
        emitAuthFailure(refresh.error ?? response.statusText);
      } else if (refresh.ok && shouldAttemptRefresh(response)) {
        // Refresh succeeded but server still rejected the retry → genuine bad token
        auth.setAccessToken(null);
        clearAuthStorage();
        markSessionExpired();
        emitAuthFailure(response.statusText);
      }
      // refresh_unavailable / transient_failure → do NOT clear; session may still be valid
    }

    if (response.status === 502 || response.status === 503 || response.status === 504) {
      const url = request?.url ?? String(input);
      emitBackendUnavailable({
        source: 'insforge',
        status: response.status,
        url
      });
    }

    if (response.ok && shouldEmitMutation(method)) {
      const url = request?.url ?? String(input);
      emitLiveDataMutation({
        source: 'insforge',
        method,
        url,
        status: response.status
      });
    }

    return response;
  };
}
