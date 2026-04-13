import { insforge } from '../insforge/client';
import { ensureInsforgeSession } from '../insforge/ensureSession';

export type DraftSnapshotUpsert = {
  key: string;
  updatedAt: number;
  route?: string;
  payload: unknown;
};

type BackendStatus = 'unknown' | 'available' | 'missing';
let backendStatus: BackendStatus = 'unknown';

function looksLikeMissingDraftSnapshotsTable(error: unknown): boolean {
  const message = (error as any)?.message;
  if (typeof message !== 'string') return false;
  const normalized = message.toLowerCase();
  return normalized.includes('draft_snapshots') && normalized.includes('does not exist');
}

/**
 * Best-effort backend persistence for draft snapshots.
 *
 * Requires a `draft_snapshots` table in InsForge (Postgres). If the table is missing,
 * we disable backend persistence for the remainder of the session to avoid noisy retries.
 */
export async function saveDraftSnapshotToBackend(snapshot: DraftSnapshotUpsert): Promise<void> {
  if (backendStatus === 'missing') return;

  try {
    const { userId } = await ensureInsforgeSession();

    const { error } = await insforge.database.from('draft_snapshots').upsert(
      {
        user_id: userId,
        draft_key: snapshot.key,
        client_updated_at_ms: snapshot.updatedAt,
        updated_at: new Date(snapshot.updatedAt).toISOString(),
        route: snapshot.route ?? null,
        payload: snapshot.payload
      },
      { onConflict: 'user_id,draft_key' }
    );

    if (error) {
      if (looksLikeMissingDraftSnapshotsTable(error)) backendStatus = 'missing';
      throw error;
    }

    backendStatus = 'available';
  } catch (error) {
    if (looksLikeMissingDraftSnapshotsTable(error)) backendStatus = 'missing';
    throw error;
  }
}

