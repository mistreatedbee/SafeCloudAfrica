import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToAuthRecovered, subscribeToLiveDataMutations } from '../liveData';

export type AsyncState<T> = {
  data: T | null;
  error: Error | null;
  loading: boolean;
  retry: () => void;
  refetch: () => void;
  /** Alias for `refetch` / `retry` (invalidate and reload). */
  refresh: () => void;
  isBackendUnavailable: boolean;
  isAuthFailure: boolean;
};

export type UseAsyncOptions = {
  /** Refetch when the window regains focus. Defaults to true. */
  refreshOnFocus?: boolean;
  /** Refetch when the tab becomes visible again. Defaults to true. */
  refreshOnVisibility?: boolean;
  /** Optional polling interval in milliseconds while the tab is visible. */
  refreshIntervalMs?: number;
  /** Refetch after any successful local data mutation. Defaults to true. */
  refreshOnMutation?: boolean;
};

const noop = () => undefined;

function isBackendUnavailableError(error: unknown): boolean {
  if (!error) return false;
  const message = String((error as any)?.message ?? error).toLowerCase();
  return (
    message.includes('502') ||
    message.includes('503') ||
    message.includes('bad gateway') ||
    message.includes('service unavailable') ||
    message.includes('pgrst001') ||
    message.includes('pgrst002')
  );
}

function isAuthFailureError(error: unknown): boolean {
  if (!error) return false;
  const status = Number((error as any)?.status ?? (error as any)?.statusCode ?? 0);
  // Only 401 (Unauthorized / token missing or expired) is a true auth failure.
  // 403 (Forbidden) means the user is authenticated but an RLS policy denied access
  // to a specific record — that is NOT a session failure and must NOT trigger logout.
  if (status === 401) return true;
  if (status === 403) return false;
  const message = String((error as any)?.message ?? (error as any)?.error ?? error).toLowerCase();
  return (
    message.includes('401') ||
    message.includes('unauthorized') ||
    message.includes('not authorised')
    // 'forbidden' and '403' deliberately excluded: these come from RLS policy denials,
    // not from an expired or missing session.
  );
}


export function useAsync<T>(fn: () => Promise<T>, deps: any[], options: UseAsyncOptions = {}): AsyncState<T> {
  const [reloadToken, setReloadToken] = useState(0);
  const lastRefreshAtRef = useRef(0);
  const backendUnavailableUntilRef = useRef(0);
  const authFailureRef = useRef(false);
  const authFailureEmittedRef = useRef(false);
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    error: null,
    loading: true,
    retry: noop,
    refetch: noop,
    refresh: noop,
    isBackendUnavailable: false,
    isAuthFailure: false
  });
  const retry = useCallback(() => {
    authFailureRef.current = false;
    authFailureEmittedRef.current = false;
    lastRefreshAtRef.current = Date.now();
    setReloadToken((n) => n + 1);
  }, []);

  const refreshOnFocus = options.refreshOnFocus ?? true;
  const refreshOnVisibility = options.refreshOnVisibility ?? true;
  const refreshIntervalMs = options.refreshIntervalMs ?? 0;
  const refreshOnMutation = options.refreshOnMutation ?? true;

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({
      ...s,
      loading: true,
      error: null,
      retry,
      refetch: retry,
      refresh: retry,
      isBackendUnavailable: false,
      isAuthFailure: false
    }));
    fn()
      .then((data) => {
        if (cancelled) return;
        backendUnavailableUntilRef.current = 0;
        authFailureRef.current = false;
        authFailureEmittedRef.current = false;
        setState({ data, error: null, loading: false, retry, refetch: retry, refresh: retry, isBackendUnavailable: false, isAuthFailure: false });
      })
      .catch((error) => {
        if (cancelled) return;
        const unavailable = isBackendUnavailableError(error);
        const authFailure = isAuthFailureError(error);
        // Back off auto-refresh for a short period when the backend is unavailable to avoid spamming requests.
        if (unavailable) backendUnavailableUntilRef.current = Date.now() + 15_000;
        if (authFailure) {
          authFailureRef.current = true;
          if (!authFailureEmittedRef.current) {
            authFailureEmittedRef.current = true;
          }
        }
        setState((prev) => ({
          // Preserve last-known-good data so dashboards/forms don’t clear during an outage.
          data: prev.data,
          error: error as Error,
          loading: false,
          retry,
          refetch: retry,
          refresh: retry,
          isBackendUnavailable: unavailable,
          isAuthFailure: authFailure
        }));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadToken, retry]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const maybeRefresh = () => {
      if (authFailureRef.current) return;
      const now = Date.now();
      if (now < backendUnavailableUntilRef.current) return;
      if (now - lastRefreshAtRef.current < 1500) return;
      retry();
    };

    const onFocus = () => {
      if (!refreshOnFocus) return;
      maybeRefresh();
    };

    const onVisibilityChange = () => {
      if (!refreshOnVisibility) return;
      if (document.visibilityState !== 'visible') return;
      maybeRefresh();
    };

    const onPageShow = () => {
      maybeRefresh();
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pageshow', onPageShow);

    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [refreshOnFocus, refreshOnVisibility, retry]);

  useEffect(() => {
    if (!refreshOnMutation) return;
    return subscribeToLiveDataMutations(() => {
      if (authFailureRef.current) return;
      const now = Date.now();
      if (now - lastRefreshAtRef.current < 250) return;
      retry();
    });
  }, [refreshOnMutation, retry]);

  // When the user (or a proactive refresh) successfully reconnects a dead
  // session, un-stick every already-mounted consumer instead of leaving it
  // showing the old failed state until its own next natural refetch trigger.
  useEffect(() => {
    return subscribeToAuthRecovered(() => {
      if (!authFailureRef.current) return;
      authFailureRef.current = false;
      authFailureEmittedRef.current = false;
      retry();
    });
  }, [retry]);

  useEffect(() => {
    if (!refreshIntervalMs || refreshIntervalMs <= 0) return;

    const interval = window.setInterval(() => {
      if (authFailureRef.current) return;
      if (document.visibilityState !== 'visible') return;
      retry();
    }, refreshIntervalMs);

    return () => window.clearInterval(interval);
  }, [refreshIntervalMs, retry]);

  return {
    ...state,
    retry,
    refetch: retry,
    refresh: retry,
    isBackendUnavailable: isBackendUnavailableError(state.error),
    isAuthFailure: isAuthFailureError(state.error)
  };
}
