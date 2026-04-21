import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AutosaveEngine } from '../services/autosave/AutosaveEngine';
import { stableStringify } from '../services/autosave/stableStringify';

export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'error';

export type UseAutosaveArgs<S> = {
  enabled: boolean;
  /**
   * How long to wait after the last change before autosaving.
   * Defaults to 4000ms.
   */
  debounceMs?: number;
  /**
   * If true, the first snapshot observed after enabling is treated as "already saved"
   * to prevent immediate dirty autosave loops after restore.
   */
  skipFirstSave?: boolean;
  /**
   * Called on each render while enabled to return a snapshot of all relevant form values.
   * The snapshot should be JSON-serializable OR at least compatible with `stableStringify`.
   */
  getSnapshot: () => S;
  /**
   * Persist the latest snapshot.
   * Keep it fast; uploads can happen here, but should be represented as stable metadata in the snapshot.
   */
  save: (snapshot: S) => Promise<void>;
};

export function useAutosave<S>(args: UseAutosaveArgs<S>) {
  const { enabled, getSnapshot, save } = args;
  const debounceMs = args.debounceMs ?? 4000;
  const skipFirstSave = args.skipFirstSave ?? true;

  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const engineRef = useRef<AutosaveEngine<S> | null>(null);
  const prevKeyRef = useRef<string | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  const snapshot = getSnapshot();

  const snapshotKey = useMemo(() => {
    return stableStringify(snapshot);
  }, [snapshot]);

  // Engine lifecycle
  useEffect(() => {
    if (!enabled) {
      engineRef.current?.cancel();
      prevKeyRef.current = null;
      setStatus('idle');
      setError(null);
      return;
    }

    // (Re)create engine when debounce/skip behavior changes.
    engineRef.current = new AutosaveEngine<S>({
      debounceMs,
      skipFirstSave,
      save: async (snap) => {
        setStatus('saving');
        setError(null);
        try {
          await saveRef.current(snap);
          setStatus('idle');
        } catch (e) {
          setStatus('error');
          setError(e instanceof Error ? e.message : 'Autosave failed');
          throw e;
        }
      }
    });

    prevKeyRef.current = null;
    return () => {
      engineRef.current?.cancel();
    };
  }, [enabled, debounceMs, skipFirstSave]);

  // Schedule on snapshot key changes
  useEffect(() => {
    if (!enabled) return;
    const engine = engineRef.current;
    if (!engine) return;

    if (prevKeyRef.current === snapshotKey) return;
    prevKeyRef.current = snapshotKey;

    setStatus((current) => (current === 'saving' ? current : 'pending'));
    engine.schedule(snapshotKey, snapshot);
  }, [enabled, snapshotKey, snapshot]);

  const flush = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    await engine.flush();
  }, []);

  return { status, error, flush };
}
