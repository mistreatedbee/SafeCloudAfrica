import React, { useEffect, useRef } from 'react';
import { useAuth } from '@insforge/react';
import { insforge } from '../api/insforge/client';
import { useDraftManager } from '../session/DraftManagerProvider';

const SESSION_EXPIRED_KEY = 'sca_session_expired';
const SESSION_EXPIRED_MESSAGE_KEY = 'sca_session_expired_message';
const USER_SIGNED_OUT_KEY = 'sca_user_signed_out';

/**
 * When the auth session is cleared (e.g. after 401 on token refresh), set a flag
 * so the login page can show "Your session expired". Skips the flag when the user
 * explicitly signed out (LogoutPage sets USER_SIGNED_OUT_KEY before signOut).
 */
export function AuthSessionListener() {
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const { flushAllDrafts } = useDraftManager();
  const wasSignedInRef = useRef(false);

  useEffect(() => {
    const onAuthFailure = () => {
      void (async () => {
        try {
          sessionStorage.setItem(SESSION_EXPIRED_KEY, '1');
          sessionStorage.setItem(SESSION_EXPIRED_MESSAGE_KEY, 'Your session expired. Please log in again.');
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
          // RequireSignedIn will still handle navigation if auth state clears elsewhere.
        }
      })();
    };
    window.addEventListener('sca:auth-failure', onAuthFailure);
    return () => window.removeEventListener('sca:auth-failure', onAuthFailure);
  }, [flushAllDrafts, signOut]);

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) {
      wasSignedInRef.current = true;
      return;
    }
    if (wasSignedInRef.current) {
      wasSignedInRef.current = false;
      const userSignedOut = typeof sessionStorage !== 'undefined' && sessionStorage.getItem(USER_SIGNED_OUT_KEY);
      if (userSignedOut) {
        sessionStorage.removeItem(USER_SIGNED_OUT_KEY);
      } else {
        const currentHeaders = (() => {
          try {
            return insforge.getHttpClient().getHeaders();
          } catch {
            return {};
          }
        })();
        const authHeader = String((currentHeaders as any).Authorization ?? (currentHeaders as any).authorization ?? '').trim();
        if (authHeader) {
          // If a bearer token is still attached to the shared client, treat this as a recoverable
          // auth-state wobble and avoid showing the "session expired" banner.
          return;
        }
        // Best-effort: persist any local draft snapshots before redirecting to login.
        void (async () => {
          try {
            await flushAllDrafts();
          } catch {
            // keep going; session recovery will still work for the user
          }

          sessionStorage.setItem(SESSION_EXPIRED_KEY, '1');
          // Preserve any more specific message already set by SessionManagerProvider.
          // This prevents refresh-failure from being shown as an inactivity expiration.
          const existingMessage = sessionStorage.getItem(SESSION_EXPIRED_MESSAGE_KEY);
          if (!existingMessage) {
            sessionStorage.setItem(
              SESSION_EXPIRED_MESSAGE_KEY,
              'Your session expired. Please log in again.'
            );
          }
        })();
      }
    }
  }, [flushAllDrafts, isLoaded, isSignedIn]);

  return null;
}

export { SESSION_EXPIRED_KEY, SESSION_EXPIRED_MESSAGE_KEY, USER_SIGNED_OUT_KEY };
