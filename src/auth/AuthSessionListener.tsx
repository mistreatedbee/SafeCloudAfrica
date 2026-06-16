import { useEffect } from 'react';
import { useAuth } from '@insforge/react';
import { insforge } from '../api/insforge/client';
import { useDraftManager } from '../session/DraftManagerProvider';

const SESSION_EXPIRED_KEY = 'sca_session_expired';
const SESSION_EXPIRED_MESSAGE_KEY = 'sca_session_expired_message';
const USER_SIGNED_OUT_KEY = 'sca_user_signed_out';

/**
 * Listens for explicit sca:auth-failure events (dispatched only when the backend
 * returns a definitive 401/403 on a protected call) and signs the user out cleanly.
 *
 * We do NOT watch isSignedIn here. The SDK's internal auth state can wobble when
 * autoRefreshToken is off and getCurrentSession is called — watching that flag would
 * cause false logouts whenever any background call temporarily loses its token.
 */
export function AuthSessionListener() {
  const { signOut } = useAuth();
  const { flushAllDrafts } = useDraftManager();

  useEffect(() => {
    const onAuthFailure = () => {
      void (async () => {
        try {
          sessionStorage.setItem(SESSION_EXPIRED_KEY, '1');
          sessionStorage.setItem(SESSION_EXPIRED_MESSAGE_KEY, 'Your session has expired. Please log in again.');
          sessionStorage.removeItem(USER_SIGNED_OUT_KEY);
        } catch {
          // ignore storage errors
        }
        try {
          insforge.getHttpClient().setAuthToken(null);
        } catch {
          // ignore cleanup errors
        }
        try {
          await flushAllDrafts();
        } catch {
          // best effort
        }
        try {
          await signOut();
        } catch {
          // ignore — RequireSignedIn will redirect to login if auth state clears
        }
      })();
    };

    window.addEventListener('sca:auth-failure', onAuthFailure);
    return () => window.removeEventListener('sca:auth-failure', onAuthFailure);
  }, [flushAllDrafts, signOut]);

  return null;
}

export { SESSION_EXPIRED_KEY, SESSION_EXPIRED_MESSAGE_KEY, USER_SIGNED_OUT_KEY };
