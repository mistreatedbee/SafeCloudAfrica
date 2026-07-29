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
    .select('id', { count: 'planned', head: true })
    .eq('status', 'failure')
    .gte('created_at', since);
  if (error) throw error;
  return count ?? 0;
}

/** Track journey events to capture user conversion paths. */
export async function trackJourneyEvent(sessionId: string, journeyStep: string, metadata?: Record<string, unknown>): Promise<void> {
  const { error } = await insforge.database
    .from('journey_events')
    .insert({
      session_id: sessionId,
      journey_step: journeyStep,
      metadata,
      created_at: new Date().toISOString(),
      enabled: true
    });
  if (error) throw error;
}

/** Count completed journeys for conversion measurement. */
export async function countCompletedJourneys(): Promise<number> {
  const { count, error } = await insforge.database
    .from('journey_events')
    .select('id', { count: 'planned', head: true })
    .eq('journey_step', 'completed')
    .eq('enabled', true);
  if (error) throw error;
  return count ?? 0;
}

/** Get journey completion rate against session count. */
export async function getJourneyCompletionMetrics(): Promise<{ completedJourneys: number; sessionCount: number; completionRate: number }> {
  const completedJourneys = await countCompletedJourneys();
  const { count: sessionCount, error } = await insforge.database
    .from('sessions')
    .select('id', { count: 'planned', head: true });
  if (error) throw error;
  const totalSessions = sessionCount ?? 0;
  const completionRate = totalSessions > 0 ? (completedJourneys / totalSessions) * 100 : 0;
  return { completedJourneys, sessionCount: totalSessions, completionRate };
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
