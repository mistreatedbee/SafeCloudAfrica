import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';

function isDuplicateKeyError(error: unknown): boolean {
  const msg = getErrorMessage(error).toLowerCase();
  return msg.includes('duplicate') || msg.includes('unique') || msg.includes('23505');
}

/** Ensures a counter row exists without resetting last_number on conflict. */
export async function ensureCounterRow(
  table: string,
  filters: Record<string, string | number>,
  seed: Record<string, unknown>
): Promise<void> {
  let query = insforge.database.from(table).select('last_number');
  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value);
  }
  const { data: existing, error: readError } = await query.maybeSingle();
  if (readError) throw new Error(getErrorMessage(readError));
  if (existing) return;

  const { error: insertError } = await insforge.database.from(table).insert({ ...seed, ...filters });
  if (insertError && !isDuplicateKeyError(insertError)) {
    throw new Error(getErrorMessage(insertError));
  }
}
