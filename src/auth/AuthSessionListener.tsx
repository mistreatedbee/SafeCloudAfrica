import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@insforge/react';
import { RefreshCwIcon } from 'lucide-react';
import { useDraftManager } from '../session/DraftManagerProvider';
import { useTenant } from '../tenant/TenantContext';
import {
  ensureInsforgeSession,
  InsforgeTransientSessionError,
  startProactiveSessionRefresh,
  stopProactiveSessionRefresh
} from '../api/insforge/ensureSession';
import { emitAuthRecovered, subscribeToAuthNeedsAttention } from '../api/liveData';
import { recoverAuthState } from './recoverAuthState';

export const USER_SIGNED_OUT_KEY = 'sca_user_signed_out';

/**
 * Owns the app-wide session-refresh lifecycle (moved here from Layout.tsx,
 * which is mounted per-page rather than once, causing needless cancel/
 * reschedule churn on every navigation) and shows a passive "reconnect"
 * prompt when the session could not be silently refreshed.
 *
 * Deliberately never calls signOut()/clears storage/redirects on its own --
 * only the explicit "Reconnect" button click does. A prior version of this
 * component (see commit 374f094, "remove session expiry auto-logout") did
 * exactly that automatically and was removed because the SDK's internal
 * auth state can wobble transiently, causing false logouts of active users.
 * This version only ever offers the user a choice.
 */
export function AuthSessionListener() {
  const { signOut } = useAuth();
  const { flushAllDrafts } = useDraftManager();
  const { refreshTenant } = useTenant();
  const [needsAttention, setNeedsAttention] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectError, setReconnectError] = useState<string | null>(null);

  useEffect(() => {
    startProactiveSessionRefresh();
    return () => stopProactiveSessionRefresh();
  }, []);

  useEffect(() => subscribeToAuthNeedsAttention(() => setNeedsAttention(true)), []);

  const handleReconnect = useCallback(async () => {
    setReconnecting(true);
    setReconnectError(null);
    try {
      await ensureInsforgeSession({ reason: 'user-reconnect' });
      setNeedsAttention(false);
      setReconnecting(false);
      emitAuthRecovered();
    } catch (err) {
      if (err instanceof InsforgeTransientSessionError) {
        setReconnectError('Still unable to reconnect. Please try again in a moment.');
        setReconnecting(false);
        return;
      }
      // Genuinely dead session: fall through to the same recovery the user
      // would otherwise have to discover for themselves (log out, log back
      // in) -- but only because they clicked Reconnect, never automatically.
      try {
        await flushAllDrafts();
      } catch {
        // best effort
      }
      await recoverAuthState(signOut, refreshTenant);
      window.location.assign('/login?reason=reconnect_failed');
    }
  }, [flushAllDrafts, refreshTenant, signOut]);

  if (!needsAttention) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[200] flex justify-center px-4 pt-3 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-warning/30 bg-white shadow-xl px-4 py-3 max-w-lg w-full">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-charcoal">Your session needs attention</p>
          <p className="text-sm text-charcoal-600 mt-0.5">
            {reconnectError ?? 'We had trouble keeping you signed in. Some data may be out of date.'}
          </p>
        </div>
        <button
          type="button"
          disabled={reconnecting}
          onClick={() => void handleReconnect()}
          className="shrink-0 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-teal text-white text-sm font-medium hover:bg-teal-600 disabled:opacity-60"
        >
          <RefreshCwIcon className={`w-4 h-4 ${reconnecting ? 'animate-spin' : ''}`} />
          {reconnecting ? 'Reconnecting…' : 'Reconnect'}
        </button>
      </div>
    </div>
  );
}
