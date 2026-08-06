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
  const { user } = useUser();
  const identifiedUserId = useRef<string | null>(null);

  useEffect(() => {
    const externalUserId = user?.id as string | undefined;
    const email = user?.email as string | undefined;
    if (externalUserId && identifiedUserId.current !== externalUserId) {
      identifiedUserId.current = externalUserId;
      void paaq.identify(externalUserId, email ? { email } : {});
    }
  }, [user?.id, user?.email]);

  return null;
}
