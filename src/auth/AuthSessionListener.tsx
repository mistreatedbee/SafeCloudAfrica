import { useEffect } from 'react';
import {
  startProactiveSessionRefresh,
  stopProactiveSessionRefresh
} from '../api/insforge/ensureSession';

export const USER_SIGNED_OUT_KEY = 'sca_user_signed_out';

/**
 * App-wide session refresh lifecycle. Runs once at the app shell level
 * (see App.tsx) instead of per-page Layout mounts.
 */
export function AuthSessionListener() {
  useEffect(() => {
    startProactiveSessionRefresh();
    return () => stopProactiveSessionRefresh();
  }, []);

  return null;
}
