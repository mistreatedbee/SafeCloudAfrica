import { formatRecordNumber } from './recordNumber';

/** Display number for an inspection: the stored INS-YYYYMM-0001 number, or a short id-based fallback. */
export function formatInspectionNumber(inspection: { id: string; inspection_number?: string | null }): string {
  return formatRecordNumber(inspection.inspection_number, 'INS', inspection.id);
}
