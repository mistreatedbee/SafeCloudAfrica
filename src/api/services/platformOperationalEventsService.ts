import { insforge } from '../insforge/client';
import type { PlatformOperationalEventRow } from '../models/entities';

export async function listPlatformOperationalEvents(limit = 500): Promise<PlatformOperationalEventRow[]> {
  const { data, error } = await insforge.database
    .from('platform_operational_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as PlatformOperationalEventRow[];
}

export async function countOperationalFailuresLast24h(): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await insforge.database
    .from('platform_operational_events')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'failure')
    .gte('created_at', since);
  if (error) throw error;
  return count ?? 0;
}

/** Lightweight query to confirm API + RLS for the signed-in super-admin. */
export async function checkInsforgeReachable(): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await insforge.database.from('companies').select('id').limit(1);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: String((e as Error)?.message || e) };
  }
}
