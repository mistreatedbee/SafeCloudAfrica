// sessionState helpers are used only when an explicit auth failure is dispatched from outside this module.


const LIVE_DATA_MUTATED_EVENT = 'sca:data-mutated';
const BACKEND_UNAVAILABLE_EVENT = 'sca:backend-unavailable';
const AUTH_NEEDS_ATTENTION_EVENT = 'sca:auth-needs-attention';
const AUTH_RECOVERED_EVENT = 'sca:auth-recovered';
const AUTH_NEEDS_ATTENTION_DEBOUNCE_MS = 30_000;
let lastAuthNeedsAttentionEmitAt = 0;

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

export type AuthNeedsAttentionDetail = {
  source: 'reactive-fetch' | 'proactive-refresh';
  at: number;
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

export type PerformanceMetrics = {
  url: string;
  method: string;
  responseTimeMs: number;
  status: number | null;
  memoryUsedBytes: number | null;
  at: number;
};

const PERFORMANCE_METRICS_EVENT = 'sca:performance-metrics';

export function emitPerformanceMetrics(metrics: PerformanceMetrics): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<PerformanceMetrics>(PERFORMANCE_METRICS_EVENT, { detail: metrics })
  );
}

export function subscribeToPerformanceMetrics(listener: (metrics: PerformanceMetrics) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = (event: Event) => {
    const ev = event as CustomEvent<PerformanceMetrics>;
    if (!ev?.detail) return;
    listener(ev.detail);
  };
  window.addEventListener(PERFORMANCE_METRICS_EVENT, handler as EventListener);
  return () => window.removeEventListener(PERFORMANCE_METRICS_EVENT, handler as EventListener);
}

function collectMemoryUsage(): number | null {
  try {
    const mem = (performance as any).memory;
    return mem ? mem.usedJSHeapSize : null;
  } catch {
    return null;
  }
}

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

/**
 * Signals that the session could not be silently refreshed and the user may
 * need to manually reconnect (see AuthSessionListener). Debounced at the
 * emit site so several `useAsync` instances failing within the same episode
 * (e.g. multiple widgets on one dashboard) only surface one prompt.
 */
export function emitAuthNeedsAttention(detail: Omit<AuthNeedsAttentionDetail, 'at'>): void {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  if (now - lastAuthNeedsAttentionEmitAt < AUTH_NEEDS_ATTENTION_DEBOUNCE_MS) return;
  lastAuthNeedsAttentionEmitAt = now;
  window.dispatchEvent(
    new CustomEvent<AuthNeedsAttentionDetail>(AUTH_NEEDS_ATTENTION_EVENT, { detail: { ...detail, at: now } })
  );
}

export function subscribeToAuthNeedsAttention(listener: (detail: AuthNeedsAttentionDetail) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = (event: Event) => {
    const ev = event as CustomEvent<AuthNeedsAttentionDetail>;
    if (!ev?.detail) return;
    listener(ev.detail);
  };
  window.addEventListener(AUTH_NEEDS_ATTENTION_EVENT, handler as EventListener);
  return () => window.removeEventListener(AUTH_NEEDS_ATTENTION_EVENT, handler as EventListener);
}

/** Signals a successful session recovery (e.g. after the user clicks "Reconnect"). */
export function emitAuthRecovered(): void {
  if (typeof window === 'undefined') return;
  // Reset the debounce so a future genuine failure can alert immediately
  // instead of being suppressed by the window that guarded the last one.
  lastAuthNeedsAttentionEmitAt = 0;
  window.dispatchEvent(new CustomEvent(AUTH_RECOVERED_EVENT));
}

export function subscribeToAuthRecovered(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = () => listener();
  window.addEventListener(AUTH_RECOVERED_EVENT, handler as EventListener);
  return () => window.removeEventListener(AUTH_RECOVERED_EVENT, handler as EventListener);
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
    const fetchStart = performance.now();
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
      emitPerformanceMetrics({
        url,
        method,
        responseTimeMs: performance.now() - fetchStart,
        status: null,
        memoryUsedBytes: collectMemoryUsage(),
        at: Date.now()
      });
      throw err;
    }
    emitPerformanceMetrics({
      url: request?.url ?? String(input),
      method,
      responseTimeMs: performance.now() - fetchStart,
      status: response.status,
      memoryUsedBytes: collectMemoryUsage(),
      at: Date.now()
    });

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
