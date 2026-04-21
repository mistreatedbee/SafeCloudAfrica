import { insforge } from '../insforge/client';
import { ensureInsforgeSession } from '../insforge/ensureSession';
import { ACTIVE_COMPANY_STORAGE_KEY } from '../../tenant/TenantContext';

export type DraftSnapshotMetadata = {
  organizationId?: string | null;
  moduleName?: string | null;
  formType?: string | null;
  linkedRecordId?: string | null;
  draftStatus?: 'active' | 'submitted' | 'discarded';
  version?: number;
  label?: string | null;
};

export type DraftSnapshotUpsert = {
  key: string;
  updatedAt: number;
  route?: string;
  payload: unknown;
  metadata?: DraftSnapshotMetadata;
};

type BackendStatus = 'unknown' | 'enhanced' | 'legacy' | 'missing';
let backendStatus: BackendStatus = 'unknown';

function getErrorMessage(error: unknown): string {
  return String((error as any)?.message ?? (error as any)?.error ?? '').toLowerCase();
}

function looksLikeMissingDraftSnapshotsTable(error: unknown): boolean {
  const normalized = getErrorMessage(error);
  return normalized.includes('draft_snapshots') && normalized.includes('does not exist');
}

function looksLikeLegacySchema(error: unknown): boolean {
  const normalized = getErrorMessage(error);
  return (
    normalized.includes('draft_snapshots') &&
    (normalized.includes('organization_id') ||
      normalized.includes('module_name') ||
      normalized.includes('form_type') ||
      normalized.includes('linked_record_id') ||
      normalized.includes('draft_status') ||
      normalized.includes('version') ||
      normalized.includes('last_saved_at'))
  );
}

function readActiveOrganizationId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_COMPANY_STORAGE_KEY);
  } catch {
    return null;
  }
}

function buildEnhancedRow(userId: string, snapshot: DraftSnapshotUpsert) {
  return {
    user_id: userId,
    organization_id: snapshot.metadata?.organizationId ?? readActiveOrganizationId(),
    draft_key: snapshot.key,
    module_name: snapshot.metadata?.moduleName ?? null,
    form_type: snapshot.metadata?.formType ?? null,
    linked_record_id: snapshot.metadata?.linkedRecordId ?? null,
    draft_status: snapshot.metadata?.draftStatus ?? 'active',
    payload: snapshot.payload,
    version: snapshot.metadata?.version ?? 1,
    route: snapshot.route ?? null,
    client_updated_at_ms: snapshot.updatedAt,
    last_saved_at: new Date(snapshot.updatedAt).toISOString(),
    updated_at: new Date(snapshot.updatedAt).toISOString()
  };
}

function buildLegacyRow(userId: string, snapshot: DraftSnapshotUpsert) {
  return {
    user_id: userId,
    draft_key: snapshot.key,
    client_updated_at_ms: snapshot.updatedAt,
    updated_at: new Date(snapshot.updatedAt).toISOString(),
    route: snapshot.route ?? null,
    payload: {
      payload: snapshot.payload,
      metadata: snapshot.metadata ?? null
    }
  };
}

async function upsertLegacySnapshot(userId: string, snapshot: DraftSnapshotUpsert): Promise<void> {
  const { error } = await insforge.database.from('draft_snapshots').upsert(buildLegacyRow(userId, snapshot), {
    onConflict: 'user_id,draft_key'
  });

  if (error) {
    if (looksLikeMissingDraftSnapshotsTable(error)) backendStatus = 'missing';
    throw error;
  }

  backendStatus = 'legacy';
}

export async function saveDraftSnapshotToBackend(snapshot: DraftSnapshotUpsert): Promise<void> {
  if (backendStatus === 'missing') return;

  try {
    const { userId } = await ensureInsforgeSession();

    if (backendStatus !== 'legacy') {
      const { error } = await insforge.database.from('draft_snapshots').upsert(buildEnhancedRow(userId, snapshot), {
        onConflict: 'user_id,draft_key'
      });

      if (!error) {
        backendStatus = 'enhanced';
        return;
      }

      if (looksLikeMissingDraftSnapshotsTable(error)) {
        backendStatus = 'missing';
        throw error;
      }

      if (!looksLikeLegacySchema(error)) {
        throw error;
      }
    }

    await upsertLegacySnapshot(userId, snapshot);
  } catch (error) {
    if (looksLikeMissingDraftSnapshotsTable(error)) backendStatus = 'missing';
    throw error;
  }
}

export async function deleteDraftSnapshotFromBackend(key: string): Promise<void> {
  if (backendStatus === 'missing') return;

  try {
    const { userId } = await ensureInsforgeSession();
    const { error } = await insforge.database.from('draft_snapshots').delete().eq('user_id', userId).eq('draft_key', key);

    if (error) {
      if (looksLikeMissingDraftSnapshotsTable(error)) backendStatus = 'missing';
      throw error;
    }
  } catch (error) {
    if (looksLikeMissingDraftSnapshotsTable(error)) backendStatus = 'missing';
    throw error;
  }
}
