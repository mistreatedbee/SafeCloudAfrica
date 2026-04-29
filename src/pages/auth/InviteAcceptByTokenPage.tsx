import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { AuthShell } from '../../components/auth/AuthShell';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { getInviteIdByToken } from '../../api/services/tenantService';

/**
 * Resolves ?token=... to invite id and redirects to /invite/:inviteId.
 */
export function InviteAcceptByTokenPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('Missing invite token.');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const inviteId = await getInviteIdByToken(token);
        if (cancelled) return;
        if (inviteId) navigate(`/invite/${inviteId}`, { replace: true });
        else setError('This invite link is invalid.');
      } catch {
        if (!cancelled) setError('We could not validate this invite right now. Please try again.');
      }
    })();
    return () => { cancelled = true; };
  }, [token, navigate]);

  if (error) {
    return (
      <AuthShell title="Invite" subtitle="">
        <p className="text-sm text-critical">{error}</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Loading invite…" subtitle="">
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    </AuthShell>
  );
}
