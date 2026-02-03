import { useEffect, useState } from 'react';

export type AsyncState<T> = {
  data: T | null;
  error: Error | null;
  loading: boolean;
};

export function useAsync<T>(fn: () => Promise<T>, deps: any[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    error: null,
    loading: true
  });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn()
      .then((data) => {
        if (cancelled) return;
        setState({ data, error: null, loading: false });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({ data: null, error: error as Error, loading: false });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

