import { useEffect, useRef } from 'react';
import { useUser } from '@insforge/react';
import { paaq } from '../../lib/paaq';

// @paaq/web-sdk already auto-tracks every route change itself (it patches
// history.pushState/replaceState and listens for popstate — see
// installAutoPageTracking in the SDK), so this component no longer needs to
// fire page_view manually. Keeping a manual call here as well as before
// would double-count every navigation as two separate page views on the
// dashboard's page-by-page breakdown ($page_view from the SDK + page_view
// from here) — this component now only handles identifying the signed-in
// user, which the SDK still has no way to know on its own.
export function PaaqActivityTracker() {
  const { user, isLoaded } = useUser();
  const identifiedUserId = useRef<string | null>(null);
  const loggedMount = useRef(false);

  // Real, verbose diagnostic logging — temporary, to answer definitively
  // whether this component ever sees a signed-in user at all, instead of
  // guessing from PAAQ's own database (which can only ever show that
  // identify() was or wasn't called, never why).
  if (!loggedMount.current) {
    loggedMount.current = true;
    console.log('[paaq-tracker] mounted');
  }

  useEffect(() => {
    console.log('[paaq-tracker] auth state', { isLoaded, hasUser: !!user, userId: user?.id, email: user?.email });
    const externalUserId = user?.id as string | undefined;
    const email = user?.email as string | undefined;
    if (externalUserId && identifiedUserId.current !== externalUserId) {
      identifiedUserId.current = externalUserId;
      console.log('[paaq-tracker] calling paaq.identify()', externalUserId);
      void paaq.identify(externalUserId, email ? { email } : {});
    }
  }, [user, user?.id, user?.email, isLoaded]);

  return null;
}
