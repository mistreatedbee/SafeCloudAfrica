import type { UUID } from '../models/entities';
import { indexEntityText } from '../../ai/retrieval';

/**
 * Best-effort RAG indexing, meant to be called (unawaited or awaited-but-
 * caught) from domain services right after a record is created/updated --
 * e.g. `void indexRecordForAi({ ... })` at the end of createQualityNcr().
 *
 * Deliberately never throws. This mirrors the fix already applied to
 * createActivityLog() in this codebase: a non-critical side effect (writing
 * an audit log, and now writing a search index) must never fail the save it
 * is describing. If indexing fails, the record still saved correctly; it
 * just won't be found by AI search/RAG until the next successful index run.
 */
export async function indexRecordForAi(input: {
  companyId: UUID;
  entityType: string;
  entityId: UUID;
  /** Plain-text representation of the record worth retrieving later (title + description + key fields). */
  text: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!input.text.trim()) return;
  try {
    await indexEntityText({
      companyId: input.companyId,
      entityType: input.entityType,
      entityId: input.entityId,
      text: input.text,
      metadata: input.metadata
    });
  } catch (err) {
    console.warn('[ai-index] failed to index record for AI search (non-fatal)', input.entityType, input.entityId, err);
  }
}
