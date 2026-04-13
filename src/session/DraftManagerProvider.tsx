import React, { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import { stableStringify } from '../services/autosave/stableStringify';

export type DraftSnapshot = {
  key: string;
  updatedAt: number;
  route?: string;
  payload: unknown;
};

export type DraftRegistration = {
  key: string;
  isDirty: () => boolean;
  serialize: () => unknown;
  /**
   * Optional server-side persistence.
   * Called best-effort whenever the draft is flushed (debounced autosave and/or logout).
   *
   * It receives the same snapshot we store locally.
   */
  flush?: (snapshot: DraftSnapshot) => Promise<void>;
};

type DraftManagerContextValue = {
  registerDraft: (registration: DraftRegistration) => () => void;
  flushAllDrafts: () => Promise<void>;
  restoreDraft: <T>(key: string) => T | null;
  hasDirtyDrafts: () => boolean;
  restoreLatestDraftByPrefix: <T>(keyPrefix: string) => { key: string; updatedAt: number; payload: T } | null;
  clearDraft: (key: string) => void;
  persistDraftSnapshotLocally: (key: string, payload: unknown) => DraftSnapshot;
};

const STORAGE_PREFIX = 'sca_draft_snapshot_v1:';
const DraftManagerContext = createContext<DraftManagerContextValue | null>(null);

function persistDraftSnapshot(snapshot: DraftSnapshot): void {
  try {
    // Use stableStringify so payloads with `Date` / `File` become storage-safe.
    localStorage.setItem(`${STORAGE_PREFIX}${snapshot.key}`, stableStringify(snapshot));
  } catch {
    // ignore storage failures; flush still attempts server-side persistence.
  }
}

function createDraftSnapshot(key: string, payload: unknown): DraftSnapshot {
  return {
    key,
    updatedAt: Date.now(),
    route: typeof window !== 'undefined' ? window.location.pathname + window.location.search : undefined,
    payload
  };
}

function persistDraftSnapshotLocally(key: string, payload: unknown): DraftSnapshot {
  const snapshot = createDraftSnapshot(key, payload);
  persistDraftSnapshot(snapshot);
  return snapshot;
}

function readDraftSnapshot<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftSnapshot;
    return (parsed.payload as T) ?? null;
  } catch {
    return null;
  }
}

function removeDraftSnapshot(key: string): void {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
  } catch {
    // ignore
  }
}

function readDraftSnapshotFromStorageKey<T>(storageKey: string): DraftSnapshot & { payload: T } | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftSnapshot;
    return { ...parsed, payload: parsed.payload as T };
  } catch {
    return null;
  }
}

export function DraftManagerProvider({ children }: { children: React.ReactNode }) {
  const registrationsRef = useRef<Map<string, DraftRegistration>>(new Map());

  const registerDraft = useCallback((registration: DraftRegistration) => {
    registrationsRef.current.set(registration.key, registration);
    return () => {
      registrationsRef.current.delete(registration.key);
    };
  }, []);

  const flushAllDrafts = useCallback(async () => {
    const registrations = Array.from(registrationsRef.current.values());
    for (const registration of registrations) {
      if (!registration.isDirty()) continue;
      const snapshot = persistDraftSnapshotLocally(registration.key, registration.serialize());
      if (registration.flush) {
        try {
          await registration.flush(snapshot);
        } catch {
          // Keep local snapshot available for post-login restore.
        }
      }
    }
  }, []);

  const hasDirtyDrafts = useCallback(() => {
    const registrations = registrationsRef.current.values();
    for (const registration of registrations) {
      try {
        if (registration.isDirty()) return true;
      } catch {
        // If a draft's `isDirty()` throws, treat it as non-blocking.
      }
    }
    return false;
  }, []);

  const restoreDraft = useCallback(<T,>(key: string): T | null => {
    return readDraftSnapshot<T>(key);
  }, []);

  const restoreLatestDraftByPrefix = useCallback(
    <T,>(keyPrefix: string): { key: string; updatedAt: number; payload: T } | null => {
      try {
        if (typeof localStorage === 'undefined') return null;

        let latest: { key: string; updatedAt: number; payload: T } | null = null;

        for (let i = 0; i < localStorage.length; i += 1) {
          const storageKey = localStorage.key(i);
          if (!storageKey) continue;
          if (!storageKey.startsWith(STORAGE_PREFIX)) continue;

          const draftKey = storageKey.slice(STORAGE_PREFIX.length);
          if (!draftKey.startsWith(keyPrefix)) continue;

          const snapshot = readDraftSnapshotFromStorageKey<T>(storageKey);
          if (!snapshot) continue;

          if (!latest || snapshot.updatedAt > latest.updatedAt) {
            latest = { key: snapshot.key, updatedAt: snapshot.updatedAt, payload: snapshot.payload as T };
          }
        }

        return latest;
      } catch {
        return null;
      }
    },
    []
  );

  const clearDraft = useCallback((key: string) => {
    removeDraftSnapshot(key);
  }, []);

  const value = useMemo<DraftManagerContextValue>(
    () => ({
      registerDraft,
      flushAllDrafts,
      restoreDraft,
      hasDirtyDrafts,
      restoreLatestDraftByPrefix,
      clearDraft,
      persistDraftSnapshotLocally
    }),
    [registerDraft, flushAllDrafts, restoreDraft, hasDirtyDrafts, restoreLatestDraftByPrefix, clearDraft]
  );

  return <DraftManagerContext.Provider value={value}>{children}</DraftManagerContext.Provider>;
}

export function useDraftManager(): DraftManagerContextValue {
  const context = useContext(DraftManagerContext);
  if (!context) throw new Error('useDraftManager must be used within DraftManagerProvider.');
  return context;
}
