import React, { createContext, useCallback, useContext, useMemo, useRef } from 'react';

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
  flush?: () => Promise<void>;
};

type DraftManagerContextValue = {
  registerDraft: (registration: DraftRegistration) => () => void;
  flushAllDrafts: () => Promise<void>;
  restoreDraft: <T>(key: string) => T | null;
  clearDraft: (key: string) => void;
};

const STORAGE_PREFIX = 'sca_draft_snapshot_v1:';
const DraftManagerContext = createContext<DraftManagerContextValue | null>(null);

function persistDraftSnapshot(snapshot: DraftSnapshot): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${snapshot.key}`, JSON.stringify(snapshot));
  } catch {
    // ignore storage failures; flush still attempts server-side persistence.
  }
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
      const snapshot: DraftSnapshot = {
        key: registration.key,
        updatedAt: Date.now(),
        route: typeof window !== 'undefined' ? window.location.pathname + window.location.search : undefined,
        payload: registration.serialize()
      };
      persistDraftSnapshot(snapshot);
      if (registration.flush) {
        try {
          await registration.flush();
        } catch {
          // Keep local snapshot available for post-login restore.
        }
      }
    }
  }, []);

  const restoreDraft = useCallback(<T,>(key: string): T | null => {
    return readDraftSnapshot<T>(key);
  }, []);

  const clearDraft = useCallback((key: string) => {
    removeDraftSnapshot(key);
  }, []);

  const value = useMemo<DraftManagerContextValue>(
    () => ({
      registerDraft,
      flushAllDrafts,
      restoreDraft,
      clearDraft
    }),
    [registerDraft, flushAllDrafts, restoreDraft, clearDraft]
  );

  return <DraftManagerContext.Provider value={value}>{children}</DraftManagerContext.Provider>;
}

export function useDraftManager(): DraftManagerContextValue {
  const context = useContext(DraftManagerContext);
  if (!context) throw new Error('useDraftManager must be used within DraftManagerProvider.');
  return context;
}
