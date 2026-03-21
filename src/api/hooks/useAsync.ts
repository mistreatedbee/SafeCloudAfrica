import { useCallback, useEffect, useState } from 'react';

export type AsyncState<T> = {
  data: T | null;
  error: Error | null;
  loading: boolean;
  retry: () => void;
  refetch: () => void;
  /** Alias for `refetch` / `retry` (invalidate and reload). */
  refresh: () => void;
  isBackendUnavailable: boolean;
};

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

export function useAsync<T>(fn: () => Promise<T>, deps: any[]): AsyncState<T> {
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    error: null,
    loading: true,
    retry: () => {},
    refetch: () => {},
    refresh: () => {},
    isBackendUnavailable: false
  });
  const retry = useCallback(() => {
    setReloadToken((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null, retry, refetch: retry, refresh: retry, isBackendUnavailable: false }));
    fn()
      .then((data) => {
        if (cancelled) return;
        setState({ data, error: null, loading: false, retry, refetch: retry, refresh: retry, isBackendUnavailable: false });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({
          data: null,
          error: error as Error,
          loading: false,
          retry,
          refetch: retry,
          refresh: retry,
          isBackendUnavailable: isBackendUnavailableError(error)
        });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadToken, retry]);

  return {
    ...state,
    retry,
    refetch: retry,
    refresh: retry,
    isBackendUnavailable: isBackendUnavailableError(state.error)
  };
}

