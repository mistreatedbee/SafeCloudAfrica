import { insforge } from '../insforge/client';
import { ensureInsforgeSession } from '../insforge/ensureSession';

export type RealtimeChannel = 'incidents' | 'tasks' | 'approvals' | 'notifications';

export interface RealtimeCallback<T = any> {
  (payload: {
    eventType: 'INSERT' | 'UPDATE' | 'DELETE';
    new: T | null;
    old: T | null;
    table: string;
  }): void;
}

/**
 * Subscribe to real-time updates for a table
 */
export async function subscribeToTable<T = any>(
  table: string,
  callback: RealtimeCallback<T>,
  filter?: Record<string, any>
): Promise<() => void> {
  await ensureInsforgeSession();

  const channel = insforge.channel(`realtime:${table}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table,
      filter: filter ? Object.entries(filter).map(([key, value]) => `${key}=eq.${value}`).join(',') : undefined
    }, callback)
    .subscribe();

  // Return unsubscribe function
  return () => {
    insforge.removeChannel(channel);
  };
}

/**
 * Subscribe to company-specific updates
 */
export async function subscribeToCompanyUpdates(
  companyId: string,
  callbacks: {
    onIncident?: RealtimeCallback;
    onTask?: RealtimeCallback;
    onApproval?: RealtimeCallback;
    onNotification?: RealtimeCallback;
  }
): Promise<() => void> {
  const unsubscribers: (() => void)[] = [];

  if (callbacks.onIncident) {
    unsubscribers.push(
      await subscribeToTable('incidents', callbacks.onIncident, { company_id: companyId })
    );
  }

  if (callbacks.onTask) {
    unsubscribers.push(
      await subscribeToTable('tasks', callbacks.onTask, { company_id: companyId })
    );
  }

  if (callbacks.onApproval) {
    unsubscribers.push(
      await subscribeToTable('approvals', callbacks.onApproval, { company_id: companyId })
    );
  }

  if (callbacks.onNotification) {
    unsubscribers.push(
      await subscribeToTable('notifications', callbacks.onNotification, { company_id: companyId })
    );
  }

  return () => {
    unsubscribers.forEach(unsub => unsub());
  };
}

/**
 * Subscribe to user-specific notifications
 */
export async function subscribeToUserNotifications(
  userId: string,
  callback: RealtimeCallback
): Promise<() => void> {
  return subscribeToTable('notifications', callback, { user_id: userId });
}

/**
 * Generic real-time hook for React components
 */
export function useRealtimeSubscription<T = any>(
  table: string,
  callback: RealtimeCallback<T>,
  filter?: Record<string, any>,
  enabled = true
) {
  React.useEffect(() => {
    if (!enabled) return;

    let unsubscribe: (() => void) | undefined;

    subscribeToTable(table, callback, filter).then(unsub => {
      unsubscribe = unsub;
    });

    return () => {
      unsubscribe?.();
    };
  }, [table, filter, enabled]);
}

// Note: This requires React import, but since this is a service file,
// we'll assume it's available or move to a hooks file
// For now, this is a placeholder for the hook