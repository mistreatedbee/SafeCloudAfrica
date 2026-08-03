import { insforge } from '../api/insforge/client';
import { getErrorMessage } from '../api/insforge/errors';
import type { DocumentEmbeddingMatch, UUID } from '../api/models/entities';
import { embedText } from './aiClient';

const CHUNK_SIZE_CHARS = 1800;
const CHUNK_OVERLAP_CHARS = 200;

/**
 * Splits long text into overlapping chunks small enough to embed cleanly and
 * to cite individually. Overlap keeps a hazard/control pair that straddles a
 * chunk boundary from losing context in either half.
 */
export function chunkText(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= CHUNK_SIZE_CHARS) return [trimmed];

  const chunks: string[] = [];
  let start = 0;
  while (start < trimmed.length) {
    const end = Math.min(start + CHUNK_SIZE_CHARS, trimmed.length);
    chunks.push(trimmed.slice(start, end).trim());
    if (end >= trimmed.length) break;
    start = end - CHUNK_OVERLAP_CHARS;
  }
  return chunks.filter(Boolean);
}

/**
 * Writes (or overwrites) the embedding chunks for one source record. Upsert
 * on (company_id, entity_type, entity_id, chunk_index) so re-indexing after
 * an edit replaces rather than duplicates. Callers (aiEmbeddingIndexService)
 * are responsible for calling this in a non-blocking, best-effort way --
 * see the createActivityLog fix this codebase already applies for why an
 * indexing failure must never abort the save it's indexing.
 */
export async function indexEntityText(input: {
  companyId: UUID;
  entityType: string;
  entityId: UUID;
  text: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const chunks = chunkText(input.text);
  if (chunks.length === 0) return;

  const embeddings = await embedText(chunks);

  const rows = chunks.map((chunk, index) => ({
    company_id: input.companyId,
    entity_type: input.entityType,
    entity_id: input.entityId,
    chunk_index: index,
    chunk_text: chunk,
    embedding: embeddings[index],
    metadata: input.metadata ?? null,
    updated_at: new Date().toISOString()
  }));

  const { error } = await insforge.database
    .from('document_embeddings')
    .upsert(rows, { onConflict: 'company_id,entity_type,entity_id,chunk_index' });
  if (error) throw new Error(getErrorMessage(error));
}

/**
 * Company-scoped semantic search over the RAG index. Always returns the
 * source entity reference alongside each match so callers can cite it --
 * per the governance requirement that no AI answer is presented without the
 * record it came from.
 */
export async function searchSimilarChunks(input: {
  companyId: UUID;
  query: string;
  entityTypes?: string[];
  limit?: number;
}): Promise<DocumentEmbeddingMatch[]> {
  const [queryEmbedding] = await embedText(input.query);
  if (!queryEmbedding) return [];

  const { data, error } = await insforge.database.rpc('match_document_embeddings', {
    query_embedding: queryEmbedding,
    match_company_id: input.companyId,
    match_entity_types: input.entityTypes ?? null,
    match_count: input.limit ?? 8
  });
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as DocumentEmbeddingMatch[];
}

/** Formats retrieved chunks into a single context block + citation list for a prompt. */
export function buildRetrievalContext(matches: DocumentEmbeddingMatch[]): {
  contextBlock: string;
  citations: Array<{ entityType: string; entityId: UUID; label: string; similarity: number }>;
} {
  if (matches.length === 0) {
    return { contextBlock: 'No related company records were found.', citations: [] };
  }

  const contextBlock = matches
    .map((match, index) => `[Source ${index + 1}: ${match.entity_type} ${match.entity_id}]\n${match.chunk_text}`)
    .join('\n\n');

  const citations = matches.map((match) => ({
    entityType: match.entity_type,
    entityId: match.entity_id,
    label: String(match.metadata?.title ?? `${match.entity_type} ${match.entity_id.slice(0, 8)}`),
    similarity: match.similarity
  }));

  return { contextBlock, citations };
}
