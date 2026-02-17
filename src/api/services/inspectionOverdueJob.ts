import { insforge } from '../insforge/client';
import type { UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import { createNotification } from './notificationsService';

/**
 * Mark overdue inspection items and notify responsible users.
 * Intended to be called from a scheduled job (e.g. Supabase cron or external scheduler).
 */
export async function markOverdueInspectionItems(companyId: UUID): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await insforge.database
    .from('inspection_run_items')
    .select('*')
    .eq('company_id', companyId)
    .neq('status', 'closed')
    .lte('due_date', today);

  if (error) throw new Error(getErrorMessage(error));
  const items = data ?? [];

  for (const item of items as any[]) {
    await insforge.database
      .from('inspection_run_items')
      .update({ status: 'overdue', updated_at: new Date().toISOString() })
      .eq('company_id', companyId)
      .eq('id', item.id);

    if (item.responsible_person_id) {
      await createNotification(
        companyId,
        item.responsible_person_id as UUID,
        'high',
        'Overdue inspection action',
        `Checklist item "${item.question}" is overdue and requires your attention.`
      );
    }
  }
}

