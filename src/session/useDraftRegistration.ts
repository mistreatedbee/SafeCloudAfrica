import { useEffect, useRef } from 'react';
import { useDraftManager } from './DraftManagerProvider';
import { useAutosave } from '../hooks/useAutosave';

type UseDraftRegistrationArgs = {
  key: string;
  enabled?: boolean;
  isDirty: () => boolean;
  serialize: () => unknown;
  flush?: (snapshot: { key: string; updatedAt: number; route?: string; payload: unknown }) => Promise<void>;
};

export function useDraftRegistration(args: UseDraftRegistrationArgs) {
  const { registerDraft, persistDraftSnapshotLocally } = useDraftManager();
  const { key, isDirty, serialize, flush } = args;

  const enabled = args.enabled !== false;

  // Coalesce server writes separately from local snapshot persistence.
  // Local saves stay fast; server flush runs at a slower "best effort" cadence.
  const serverDebounceMs = 5000;
  const serverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serverSnapshotRef = useRef<{
    key: string;
    updatedAt: number;
    route?: string;
    payload: unknown;
  } | null>(null);
  const isDirtyRef = useRef(isDirty);
  const serializeRef = useRef(serialize);
  const flushRef = useRef(flush);

  useEffect(() => {
    isDirtyRef.current = isDirty;
    serializeRef.current = serialize;
    flushRef.current = flush;
  }, [isDirty, serialize, flush]);

  // Phase 3: hybrid saving
  // - Local draft snapshots are persisted frequently (debounced) for crash/refresh safety.
  // - Optional `flush()` is used for best-effort server-side persistence.
  useAutosave({
    enabled,
    debounceMs: 400,
    skipFirstSave: true,
    getSnapshot: () => serializeRef.current(),
    save: async (payload) => {
      if (!isDirtyRef.current()) return;
      const snapshot = persistDraftSnapshotLocally(key, payload);
      if (!flushRef.current) return;

      // Debounce/coalesce server writes.
      serverSnapshotRef.current = snapshot;
      if (serverTimerRef.current) clearTimeout(serverTimerRef.current);
      serverTimerRef.current = setTimeout(() => {
        serverTimerRef.current = null;
        const toFlush = serverSnapshotRef.current;
        if (!toFlush) return;
        // Fire-and-forget server flush; errors are swallowed so local drafts remain primary.
        void (async () => {
          try {
            await flushRef.current?.(toFlush);
          } catch {
            // Best-effort: if the server is unavailable, keep local snapshots.
          }
        })();
      }, serverDebounceMs);
    }
  });

  // Extra safety: if the user closes/navigates away quickly, persist synchronously.
  useEffect(() => {
    if (!enabled) return;
    const persistIfDirty = () => {
      try {
        if (!isDirtyRef.current()) return;
        // Synchronous localStorage write.
        persistDraftSnapshotLocally(key, serializeRef.current());
      } catch {
        // ignore storage/serialization errors
      }
    };

    window.addEventListener('pagehide', persistIfDirty);
    window.addEventListener('beforeunload', persistIfDirty);
    return () => {
      window.removeEventListener('pagehide', persistIfDirty);
      window.removeEventListener('beforeunload', persistIfDirty);
    };
  }, [enabled, key, persistDraftSnapshotLocally]);

  // Cleanup any pending server flush timer.
  useEffect(() => {
    return () => {
      if (serverTimerRef.current) clearTimeout(serverTimerRef.current);
      serverTimerRef.current = null;
      serverSnapshotRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    return registerDraft({
      key,
      isDirty: () => isDirtyRef.current(),
      serialize: () => serializeRef.current(),
      flush: async (snapshot) => flushRef.current?.(snapshot)
    });
  }, [enabled, key, registerDraft]);
}
