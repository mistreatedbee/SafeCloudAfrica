import React, { useEffect, useRef } from 'react';
import { useAuth } from '@insforge/react';

const SESSION_EXPIRED_KEY = 'sca_session_expired';
const SESSION_EXPIRED_MESSAGE_KEY = 'sca_session_expired_message';
const USER_SIGNED_OUT_KEY = 'sca_user_signed_out';

/**
 * When the auth session is cleared (e.g. after 401 on token refresh), set a flag
 * so the login page can show "Your session expired". Skips the flag when the user
 * explicitly signed out (LogoutPage sets USER_SIGNED_OUT_KEY before signOut).
 */
export function AuthSessionListener() {
  const { isLoaded, isSignedIn } = useAuth();
  const wasSignedInRef = useRef(false);

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
        sessionStorage.setItem(SESSION_EXPIRED_KEY, '1');
        sessionStorage.setItem(SESSION_EXPIRED_MESSAGE_KEY, 'Your session expired due to inactivity. Please log in again.');
      }
    }
  }, [isLoaded, isSignedIn]);

  return null;
}

export { SESSION_EXPIRED_KEY, SESSION_EXPIRED_MESSAGE_KEY, USER_SIGNED_OUT_KEY };
