/**
 * Display number for a record: its stored PREFIX-YYYYMM-0001 number, or — for records
 * saved before numbering existed / before the migration ran — a short id-based fallback.
 */
export function formatRecordNumber(stored: string | null | undefined, prefix: string, id: string): string {
  return stored || `${prefix}-${String(id).slice(0, 8).toUpperCase()}`;
}
