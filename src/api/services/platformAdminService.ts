import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import type { UUID } from '../models/entities';

export async function isPlatformAdmin(userId: UUID): Promise<boolean> {
  try {
    const { data, error } = await insforge.database.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return !!data;
  } catch (err) {
    const msg = getErrorMessage(err);
    // If the table doesn't exist yet, treat as not a platform admin.
    if (msg.toLowerCase().includes('does not exist')) return false;
    return false;
  }
}

