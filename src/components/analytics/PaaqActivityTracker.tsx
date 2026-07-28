import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useUser } from '@insforge/react';
import { paaq } from '../../lib/paaq';

// Fires a real page_view event on every route change, and identifies the
// signed-in user (once) so subsequent events link to a real user record
// instead of just an anonymous session.
export function PaaqActivityTracker() {
  const location = useLocation();
  const { user } = useUser();
  const identifiedUserId = useRef<string | null>(null);

  useEffect(() => {
    paaq.track('page_view', {
      path: location.pathname,
      search: location.search || undefined,
    });
  }, [location.pathname, location.search]);

  useEffect(() => {
    const externalUserId = user?.id as string | undefined;
    const email = user?.email as string | undefined;
    if (externalUserId && identifiedUserId.current !== externalUserId) {
      identifiedUserId.current = externalUserId;
      void paaq.identify(externalUserId, email);
    }
  }, [user?.id, user?.email]);

  return null;
}
