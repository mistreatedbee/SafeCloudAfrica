import { useEffect, useMemo, useRef } from 'react';
import { useDraftManager } from './DraftManagerProvider';
import { useAutosave } from '../hooks/useAutosave';
import { saveDraftSnapshotToBackend, type DraftSnapshotMetadata } from '../api/services/draftSnapshotsService';
import type { DraftSnapshot } from './DraftManagerProvider';

type UseDraftRegistrationArgs = {
  key: string;
  label?: string;
  enabled?: boolean;
  isDirty: () => boolean;
  serialize: () => unknown;
  flush?: (snapshot: { key: string; updatedAt: number; route?: string; payload: unknown; metadata?: DraftSnapshotMetadata }) => Promise<void>;
  metadata?: DraftSnapshotMetadata;
  hasPendingUploads?: boolean | (() => boolean);
  pendingUploadsMessage?: string | (() => string | null);
};

const SERVER_RETRY_MS = 15_000;

function deriveMetadata(key: string, label: string | undefined, metadata: DraftSnapshotMetadata | undefined): DraftSnapshotMetadata {
  const prefix = key.split(':')[0] ?? key;
  const normalized = prefix.replace(/_/g, '-');
  const moduleName = metadata?.moduleName ?? normalized.split('-')[0] ?? 'general';
  return {
    moduleName,
    formType: metadata?.formType ?? normalized,
    label: metadata?.label ?? label ?? undefined,
    ...metadata
  };
}

function normalizePendingUploads(value: UseDraftRegistrationArgs['hasPendingUploads']): boolean {
  if (typeof value === 'function') return value();
  return Boolean(value);
}

function normalizePendingUploadsMessage(value: UseDraftRegistrationArgs['pendingUploadsMessage']): string | null {
  if (typeof value === 'function') return value();
  return value ?? null;
}

export function useDraftRegistration(args: UseDraftRegistrationArgs) {
  const { registerDraft, persistDraftSnapshotLocally, updateDraftState } = useDraftManager();
  const { key, isDirty, serialize, flush, label, metadata } = args;
  const enabled = args.enabled !== false;
  const resolvedMetadata = useMemo(() => deriveMetadata(key, label, metadata), [key, label, metadata]);

  const serverDebounceMs = 5000;
  const serverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serverSnapshotRef = useRef<DraftSnapshot | null>(null);
  const isDirtyRef = useRef(isDirty);
  const serializeRef = useRef(serialize);
  const metadataRef = useRef(resolvedMetadata);
  const pendingUploadsRef = useRef(args.hasPendingUploads);
  const pendingUploadsMessageRef = useRef(args.pendingUploadsMessage);
  const flushRef = useRef(flush ?? (async (snapshot: { key: string; updatedAt: number; route?: string; payload: unknown; metadata?: DraftSnapshotMetadata }) => saveDraftSnapshotToBackend(snapshot as any)));

  useEffect(() => {
    isDirtyRef.current = isDirty;
    serializeRef.current = serialize;
    metadataRef.current = resolvedMetadata;
    pendingUploadsRef.current = args.hasPendingUploads;
    pendingUploadsMessageRef.current = args.pendingUploadsMessage;
    flushRef.current = flush ?? (async (snapshot: { key: string; updatedAt: number; route?: string; payload: unknown; metadata?: DraftSnapshotMetadata }) => saveDraftSnapshotToBackend(snapshot as any));
  }, [args.hasPendingUploads, args.pendingUploadsMessage, flush, isDirty, resolvedMetadata, serialize]);

  const pendingUploads = useMemo(() => normalizePendingUploads(args.hasPendingUploads), [args.hasPendingUploads]);
  const pendingUploadsMessage = useMemo(() => normalizePendingUploadsMessage(args.pendingUploadsMessage), [args.pendingUploadsMessage]);

  const { status, error } = useAutosave({
    enabled,
    debounceMs: 1500,
    skipFirstSave: true,
    getSnapshot: () => serializeRef.current(),
    save: async (payload) => {
      if (!isDirtyRef.current()) return;

      updateDraftState(key, {
        label: label,
        metadata: metadataRef.current,
        status: 'saving-local',
        isDirty: true,
        hasPendingUploads: normalizePendingUploads(pendingUploadsRef.current),
        pendingUploadsMessage: normalizePendingUploadsMessage(pendingUploadsMessageRef.current),
        lastError: null
      });

      const snapshot = persistDraftSnapshotLocally(key, payload, metadataRef.current);
      serverSnapshotRef.current = snapshot;
      updateDraftState(key, {
        label,
        metadata: snapshot.metadata,
        route: snapshot.route,
        status: 'saved-local',
        lastSavedAt: snapshot.updatedAt,
        updatedAt: snapshot.updatedAt,
        isDirty: true,
        hasPendingUploads: normalizePendingUploads(pendingUploadsRef.current),
        pendingUploadsMessage: normalizePendingUploadsMessage(pendingUploadsMessageRef.current),
        lastError: null
      });

      if (serverTimerRef.current) clearTimeout(serverTimerRef.current);
      serverTimerRef.current = setTimeout(() => {
        serverTimerRef.current = null;
        void flushServerSnapshot();
      }, serverDebounceMs);
    }
  });

  async function flushServerSnapshot() {
    const snapshot = serverSnapshotRef.current;
    if (!snapshot) return;

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      scheduleRetry('Waiting for a network connection to sync this draft.');
      return;
    }

    updateDraftState(key, {
      label,
      metadata: snapshot.metadata,
      route: snapshot.route,
      status: 'syncing-server',
      lastSavedAt: snapshot.updatedAt,
      updatedAt: snapshot.updatedAt,
      isDirty: isDirtyRef.current(),
      hasPendingUploads: normalizePendingUploads(pendingUploadsRef.current),
      pendingUploadsMessage: normalizePendingUploadsMessage(pendingUploadsMessageRef.current),
      lastError: null
    });

    try {
      await flushRef.current(snapshot);
      serverSnapshotRef.current = null;
      updateDraftState(key, {
        label,
        metadata: snapshot.metadata,
        route: snapshot.route,
        status: 'saved-server',
        lastSavedAt: snapshot.updatedAt,
        updatedAt: snapshot.updatedAt,
        isDirty: isDirtyRef.current(),
        hasPendingUploads: normalizePendingUploads(pendingUploadsRef.current),
        pendingUploadsMessage: normalizePendingUploadsMessage(pendingUploadsMessageRef.current),
        lastError: null
      });
      console.info('[autosave] server sync success', { key });
    } catch (syncError) {
      scheduleRetry(syncError instanceof Error ? syncError.message : 'Draft sync failed. Retrying automatically.');
      console.warn('[autosave] server sync failed', { key, error: syncError });
    }
  }

  function scheduleRetry(message: string) {
    updateDraftState(key, {
      label,
      status: 'retrying',
      isDirty: isDirtyRef.current(),
      hasPendingUploads: normalizePendingUploads(pendingUploadsRef.current),
      pendingUploadsMessage: normalizePendingUploadsMessage(pendingUploadsMessageRef.current),
      lastError: message
    });

    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      void flushServerSnapshot();
    }, SERVER_RETRY_MS);
  }

  useEffect(() => {
    updateDraftState(key, {
      label,
      metadata: resolvedMetadata,
      status:
        status === 'pending'
          ? 'pending'
          : status === 'error'
            ? 'error'
            : undefined,
      lastError: status === 'error' ? error ?? 'Draft could not be saved.' : null,
      isDirty: enabled ? isDirty() : false,
      isRegistered: enabled,
      hasPendingUploads: pendingUploads,
      pendingUploadsMessage
    });
  }, [enabled, error, isDirty, key, label, pendingUploads, pendingUploadsMessage, resolvedMetadata, status, updateDraftState]);

  useEffect(() => {
    if (!enabled) return;

    const onOnline = () => {
      if (!serverSnapshotRef.current) return;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      void flushServerSnapshot();
    };

    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const persistIfDirty = () => {
      try {
        if (!isDirtyRef.current()) return;
        persistDraftSnapshotLocally(key, serializeRef.current(), metadataRef.current);
      } catch {
        // ignore storage failures during unload
      }
    };

    window.addEventListener('pagehide', persistIfDirty);
    window.addEventListener('beforeunload', persistIfDirty);
    return () => {
      window.removeEventListener('pagehide', persistIfDirty);
      window.removeEventListener('beforeunload', persistIfDirty);
    };
  }, [enabled, key, persistDraftSnapshotLocally]);

  useEffect(() => {
    return () => {
      if (serverTimerRef.current) clearTimeout(serverTimerRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      serverTimerRef.current = null;
      retryTimerRef.current = null;
      serverSnapshotRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    return registerDraft({
      key,
      label,
      metadata: resolvedMetadata,
      isDirty: () => isDirtyRef.current(),
      serialize: () => serializeRef.current(),
      flush: async (snapshot) => flushRef.current(snapshot),
      hasPendingUploads: () => normalizePendingUploads(pendingUploadsRef.current),
      pendingUploadsMessage: () => normalizePendingUploadsMessage(pendingUploadsMessageRef.current)
    });
  }, [enabled, key, label, registerDraft, resolvedMetadata]);
}
