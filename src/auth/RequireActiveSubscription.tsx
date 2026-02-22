import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useTenant } from '../tenant/TenantContext';
import { insforge } from '../api/insforge/client';

const BILLING_PATHS = ['/billing', '/billing/status'];

/**
 * Redirects to /billing/status if the active company has no active subscription (expired/suspended).
 * Skips check for platform admins and when current path is /billing or /billing/status.
 */
export function RequireActiveSubscription({ children }: { children: React.ReactElement }) {
  const location = useLocation();
  const { activeCompanyId, isPlatformAdmin } = useTenant();
  const [redirectReason, setRedirectReason] = useState<'expired' | 'suspended' | null>(null);

  const pathname = location.pathname;
  const skipCheck = isPlatformAdmin || BILLING_PATHS.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (skipCheck || !activeCompanyId) {
      setRedirectReason(skipCheck ? null : null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data: company } = await insforge.database
          .from('companies')
          .select('status')
          .eq('id', activeCompanyId)
          .maybeSingle();
        const companySuspended = (company as { status?: string } | null)?.status === 'suspended';
        if (companySuspended && !cancelled) {
          setRedirectReason('suspended');
          return;
        }
        const { data: licenses } = await insforge.database
          .from('org_licenses')
          .select('id, status, end_date')
          .eq('company_id', activeCompanyId)
          .order('end_date', { ascending: false })
          .limit(1);
        const license = Array.isArray(licenses) && licenses.length > 0 ? (licenses[0] as { status: string; end_date: string }) : null;
        if (!license) {
          if (!cancelled) setRedirectReason(null);
          return;
        }
        const suspended = license.status === 'suspended';
        const expired = license.status === 'expired' || suspended || new Date(license.end_date) < new Date();
        if (!cancelled) setRedirectReason(expired ? (suspended ? 'suspended' : 'expired') : null);
      } catch {
        if (!cancelled) setRedirectReason(null);
      }
    })();
    return () => { cancelled = true; };
  }, [skipCheck, activeCompanyId]);

  if (skipCheck) return children;
  if (redirectReason === null) return null;
  if (redirectReason) return <Navigate to={`/billing/status?reason=${redirectReason}`} replace />;
  return children;
}
