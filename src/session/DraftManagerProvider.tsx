import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { deleteDraftSnapshotFromBackend, type DraftSnapshotMetadata } from '../api/services/draftSnapshotsService';

export type DraftSnapshot = {
  key: string;
  updatedAt: number;
  route?: string;
  payload: unknown;
  metadata?: DraftSnapshotMetadata;
};

export type DraftLifecycleStatus =
  | 'idle'
  | 'pending'
  | 'saving-local'
  | 'saved-local'
  | 'syncing-server'
  | 'saved-server'
  | 'retrying'
  | 'error'
  | 'restored'
  | 'discarded';

export type DraftState = {
  key: string;
  label: string;
  status: DraftLifecycleStatus;
  updatedAt: number | null;
  lastSavedAt: number | null;
  lastError: string | null;
  route?: string;
  metadata?: DraftSnapshotMetadata;
  isDirty: boolean;
  isRegistered: boolean;
  hasPendingUploads: boolean;
  pendingUploadsMessage: string | null;
};

export type DraftRegistration = {
  key: string;
  label?: string;
  metadata?: DraftSnapshotMetadata;
  isDirty: () => boolean;
  serialize: () => unknown;
  flush?: (snapshot: DraftSnapshot) => Promise<void>;
  hasPendingUploads?: () => boolean;
  pendingUploadsMessage?: () => string | null;
};

type DraftPromptState = {
  key: string;
  label: string;
  updatedAt: number;
  route?: string;
};

type DraftManagerContextValue = {
  registerDraft: (registration: DraftRegistration) => () => void;
  flushAllDrafts: () => Promise<void>;
  persistDraftSnapshotLocally: (key: string, payload: unknown, metadata?: DraftSnapshotMetadata) => DraftSnapshot;
  restoreDraft: <T>(key: string) => T | null;
  hasDirtyDrafts: () => boolean;
  restoreLatestDraftByPrefix: <T>(keyPrefix: string) => { key: string; updatedAt: number; payload: T } | null;
  clearDraft: (key: string) => void;
  updateDraftState: (key: string, patch: Partial<DraftState>) => void;
  primaryDraftState: DraftState | null;
  pendingPrompt: DraftPromptState | null;
  resolvePendingPrompt: (choice: 'restore' | 'discard') => Promise<void>;
  shouldWarnOnNavigation: boolean;
};

const STORAGE_PREFIX = 'sca_draft_snapshot_v2:';
const STALE_DRAFT_MS = 30 * 24 * 60 * 60 * 1000;
const DraftManagerContext = createContext<DraftManagerContextValue | null>(null);

function humanizeDraftKey(key: string): string {
  const first = key.split(':')[0] ?? key;
  return first
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function createDefaultDraftState(key: string): DraftState {
  return {
    key,
    label: humanizeDraftKey(key),
    status: 'idle',
    updatedAt: null,
    lastSavedAt: null,
    lastError: null,
    metadata: undefined,
    route: undefined,
    isDirty: false,
    isRegistered: false,
    hasPendingUploads: false,
    pendingUploadsMessage: null
  };
}

function persistDraftSnapshot(snapshot: DraftSnapshot): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${snapshot.key}`, JSON.stringify(snapshot));
  } catch {
    // ignore storage failures; local autosave remains best effort
  }
}

function readDraftSnapshot<T>(key: string): (DraftSnapshot & { payload: T }) | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftSnapshot;
    return { ...parsed, payload: parsed.payload as T };
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

function readDraftSnapshotFromStorageKey<T>(storageKey: string): (DraftSnapshot & { payload: T }) | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftSnapshot;
    return { ...parsed, payload: parsed.payload as T };
  } catch {
    return null;
  }
}

function isStatusRiskyForNavigation(status: DraftLifecycleStatus): boolean {
  return status === 'pending' || status === 'saving-local' || status === 'syncing-server' || status === 'retrying' || status === 'error';
}

export function DraftManagerProvider({ children }: { children: React.ReactNode }) {
  const registrationsRef = useRef<Map<string, DraftRegistration>>(new Map());
  const recoveryDecisionsRef = useRef<Map<string, 'restore' | 'discard'>>(new Map());
  const activeKeyRef = useRef<string | null>(null);
  const [draftStates, setDraftStates] = useState<Record<string, DraftState>>({});
  const [pendingPrompt, setPendingPrompt] = useState<DraftPromptState | null>(null);
  const [recoveryRevision, setRecoveryRevision] = useState(0);

  const updateDraftState = useCallback((key: string, patch: Partial<DraftState>) => {
    activeKeyRef.current = key;
    setDraftStates((prev) => {
      const current = prev[key] ?? createDefaultDraftState(key);
      const normalizedPatch = Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined)
      ) as Partial<DraftState>;
      return {
        ...prev,
        [key]: {
          ...current,
          ...normalizedPatch,
          key,
          label: normalizedPatch.label ?? current.label ?? humanizeDraftKey(key)
        }
      };
    });
  }, []);

  const clearDraft = useCallback((key: string) => {
    removeDraftSnapshot(key);
    recoveryDecisionsRef.current.delete(key);
    if (pendingPrompt?.key === key) setPendingPrompt(null);
    setDraftStates((prev) => {
      const current = prev[key];
      if (!current) return prev;
      return {
        ...prev,
        [key]: {
          ...current,
          status: 'discarded',
          updatedAt: null,
          lastSavedAt: null,
          lastError: null
        }
      };
    });
    void deleteDraftSnapshotFromBackend(key).catch(() => undefined);
  }, [pendingPrompt?.key]);

  const enqueueRestorePrompt = useCallback((snapshot: DraftSnapshot) => {
    setPendingPrompt((current) => {
      if (current?.key === snapshot.key) return current;
      return {
        key: snapshot.key,
        label: snapshot.metadata?.label ?? humanizeDraftKey(snapshot.key),
        updatedAt: snapshot.updatedAt,
        route: snapshot.route
      };
    });
  }, []);

  const registerDraft = useCallback((registration: DraftRegistration) => {
    registrationsRef.current.set(registration.key, registration);
    updateDraftState(registration.key, {
      label: registration.label ?? humanizeDraftKey(registration.key),
      metadata: registration.metadata,
      isRegistered: true,
      isDirty: registration.isDirty(),
      hasPendingUploads: registration.hasPendingUploads?.() ?? false,
      pendingUploadsMessage: registration.pendingUploadsMessage?.() ?? null
    });

    return () => {
      registrationsRef.current.delete(registration.key);
      setDraftStates((prev) => {
        const current = prev[registration.key];
        if (!current) return prev;
        return {
          ...prev,
          [registration.key]: {
            ...current,
            isRegistered: false
          }
        };
      });
    };
  }, [updateDraftState]);

  const persistDraftSnapshotLocally = useCallback((key: string, payload: unknown, metadata?: DraftSnapshotMetadata): DraftSnapshot => {
    const existing = readDraftSnapshot(key);
    const snapshot: DraftSnapshot = {
      key,
      updatedAt: Date.now(),
      route: typeof window !== 'undefined' ? window.location.pathname + window.location.search : undefined,
      payload,
      metadata: {
        ...(existing?.metadata ?? {}),
        ...(metadata ?? {})
      }
    };
    persistDraftSnapshot(snapshot);
    updateDraftState(key, {
      label: snapshot.metadata?.label ?? humanizeDraftKey(key),
      route: snapshot.route,
      metadata: snapshot.metadata,
      updatedAt: snapshot.updatedAt,
      lastSavedAt: snapshot.updatedAt,
      lastError: null
    });
    return snapshot;
  }, [updateDraftState]);

  const flushAllDrafts = useCallback(async () => {
    const registrations = Array.from(registrationsRef.current.values());
    for (const registration of registrations) {
      if (!registration.isDirty()) continue;
      const snapshot = persistDraftSnapshotLocally(registration.key, registration.serialize(), registration.metadata);
      if (registration.flush) {
        try {
          await registration.flush(snapshot);
        } catch {
          updateDraftState(registration.key, {
            status: 'retrying',
            lastError: 'Server sync will retry when the connection is available.'
          });
        }
      }
    }
  }, [persistDraftSnapshotLocally, updateDraftState]);

  const hasDirtyDrafts = useCallback(() => {
    const registrations = registrationsRef.current.values();
    for (const registration of registrations) {
      try {
        if (registration.isDirty()) return true;
      } catch {
        // ignore non-critical draft inspection failures
      }
    }
    return false;
  }, []);

  const restoreDraft = useCallback(<T,>(key: string): T | null => {
    const snapshot = readDraftSnapshot<T>(key);
    if (!snapshot) return null;

    const decision = recoveryDecisionsRef.current.get(key);
    if (decision === 'discard') {
      removeDraftSnapshot(key);
      return null;
    }

    if (decision !== 'restore') {
      enqueueRestorePrompt(snapshot);
      return null;
    }

    updateDraftState(key, {
      label: snapshot.metadata?.label ?? humanizeDraftKey(key),
      metadata: snapshot.metadata,
      route: snapshot.route,
      updatedAt: snapshot.updatedAt,
      lastSavedAt: snapshot.updatedAt,
      status: 'restored',
      lastError: null
    });
    return snapshot.payload as T;
  }, [enqueueRestorePrompt, recoveryRevision, updateDraftState]);

  const restoreLatestDraftByPrefix = useCallback(
    <T,>(keyPrefix: string): { key: string; updatedAt: number; payload: T } | null => {
      try {
        if (typeof localStorage === 'undefined') return null;

        let latest: { key: string; updatedAt: number; payload: T; route?: string; metadata?: DraftSnapshotMetadata } | null = null;

        for (let i = 0; i < localStorage.length; i += 1) {
          const storageKey = localStorage.key(i);
          if (!storageKey || !storageKey.startsWith(STORAGE_PREFIX)) continue;
          const draftKey = storageKey.slice(STORAGE_PREFIX.length);
          if (!draftKey.startsWith(keyPrefix)) continue;

          const snapshot = readDraftSnapshotFromStorageKey<T>(storageKey);
          if (!snapshot) continue;
          if (!latest || snapshot.updatedAt > latest.updatedAt) {
            latest = {
              key: snapshot.key,
              updatedAt: snapshot.updatedAt,
              payload: snapshot.payload as T,
              route: snapshot.route,
              metadata: snapshot.metadata
            };
          }
        }

        if (!latest) return null;

        const decision = recoveryDecisionsRef.current.get(latest.key);
        if (decision === 'discard') {
          removeDraftSnapshot(latest.key);
          return null;
        }

        if (decision !== 'restore') {
          enqueueRestorePrompt({
            key: latest.key,
            updatedAt: latest.updatedAt,
            payload: latest.payload,
            route: latest.route,
            metadata: latest.metadata
          });
          return null;
        }

        updateDraftState(latest.key, {
          label: latest.metadata?.label ?? humanizeDraftKey(latest.key),
          metadata: latest.metadata,
          route: latest.route,
          updatedAt: latest.updatedAt,
          lastSavedAt: latest.updatedAt,
          status: 'restored',
          lastError: null
        });

        return {
          key: latest.key,
          updatedAt: latest.updatedAt,
          payload: latest.payload
        };
      } catch {
        return null;
      }
    },
    [enqueueRestorePrompt, recoveryRevision, updateDraftState]
  );

  const resolvePendingPrompt = useCallback(async (choice: 'restore' | 'discard') => {
    const prompt = pendingPrompt;
    if (!prompt) return;

    recoveryDecisionsRef.current.set(prompt.key, choice);

    if (choice === 'discard') {
      clearDraft(prompt.key);
    } else {
      updateDraftState(prompt.key, {
        label: prompt.label,
        updatedAt: prompt.updatedAt,
        lastSavedAt: prompt.updatedAt,
        status: 'restored',
        lastError: null
      });
    }

    setPendingPrompt(null);
    setRecoveryRevision((value) => value + 1);
  }, [clearDraft, pendingPrompt, updateDraftState]);

  useEffect(() => {
    try {
      if (typeof localStorage === 'undefined') return;
      const now = Date.now();
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const storageKey = localStorage.key(i);
        if (!storageKey || !storageKey.startsWith(STORAGE_PREFIX)) continue;
        const snapshot = readDraftSnapshotFromStorageKey(storageKey);
        if (!snapshot) continue;
        if (now - snapshot.updatedAt > STALE_DRAFT_MS) keysToRemove.push(storageKey);
      }

      for (const storageKey of keysToRemove) {
        localStorage.removeItem(storageKey);
      }
    } catch {
      // ignore cleanup failures
    }
  }, []);

  const primaryDraftState = useMemo(() => {
    const values = Object.values(draftStates).filter((state) => state.isRegistered || state.lastSavedAt);
    if (!values.length) return null;

    const activeKey = activeKeyRef.current;
    if (activeKey && draftStates[activeKey]) return draftStates[activeKey];

    return values.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0] ?? null;
  }, [draftStates]);

  const shouldWarnOnNavigation = Boolean(
    primaryDraftState &&
      primaryDraftState.isRegistered &&
      primaryDraftState.isDirty &&
      (isStatusRiskyForNavigation(primaryDraftState.status) || primaryDraftState.hasPendingUploads)
  );

  const value = useMemo<DraftManagerContextValue>(
    () => ({
      registerDraft,
      flushAllDrafts,
      persistDraftSnapshotLocally,
      restoreDraft,
      hasDirtyDrafts,
      restoreLatestDraftByPrefix,
      clearDraft,
      updateDraftState,
      primaryDraftState,
      pendingPrompt,
      resolvePendingPrompt,
      shouldWarnOnNavigation
    }),
    [
      registerDraft,
      flushAllDrafts,
      persistDraftSnapshotLocally,
      restoreDraft,
      hasDirtyDrafts,
      restoreLatestDraftByPrefix,
      clearDraft,
      updateDraftState,
      primaryDraftState,
      pendingPrompt,
      resolvePendingPrompt,
      shouldWarnOnNavigation
    ]
  );

  return <DraftManagerContext.Provider value={value}>{children}</DraftManagerContext.Provider>;
}

export function useDraftManager(): DraftManagerContextValue {
  const context = useContext(DraftManagerContext);
  if (!context) throw new Error('useDraftManager must be used within DraftManagerProvider.');
  return context;
}
