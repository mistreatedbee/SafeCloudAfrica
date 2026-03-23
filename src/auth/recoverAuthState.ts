import type { useAuth } from '@insforge/react';
import { insforge } from '../api/insforge/client';
import { clearSession } from './session';
import { USER_SIGNED_OUT_KEY } from './AuthSessionListener';

type SignOutFn = ReturnType<typeof useAuth>['signOut'];

const LOCAL_KEYS_TO_CLEAR = ['sca_session_v1', 'sca_active_company_id_v3'];
const SESSION_KEYS_TO_CLEAR = ['sca_session_expired', 'sca_session_expired_message', USER_SIGNED_OUT_KEY];

function clearStorage(): void {
  try {
    clearSession();
  } catch {
    // ignore
  }

  try {
    for (const key of LOCAL_KEYS_TO_CLEAR) {
      localStorage.removeItem(key);
    }
    // Clear stale SDK auth keys if present.
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      const normalized = key.toLowerCase();
      if (normalized.includes('insforge') && normalized.includes('auth')) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // ignore
  }

  try {
    for (const key of SESSION_KEYS_TO_CLEAR) {
      sessionStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

/**
 * Clears partial auth/session state so failed or broken auth flows can recover cleanly.
 */
export async function recoverAuthState(signOut?: SignOutFn, refreshTenant?: () => Promise<void>): Promise<void> {
  try {
    insforge.getHttpClient().setAuthToken(null);
  } catch {
    // ignore
  }

  if (signOut) {
    try {
      sessionStorage.setItem(USER_SIGNED_OUT_KEY, '1');
    } catch {
      // ignore
    }
    try {
      await signOut();
    } catch {
      // ignore
    }
  }

  clearStorage();

  if (refreshTenant) {
    try {
      await refreshTenant();
    } catch {
      // ignore
    }
  }
}
