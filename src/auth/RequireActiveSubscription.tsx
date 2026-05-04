import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useTenant } from '../tenant/TenantContext';
import { insforge } from '../api/insforge/client';
import { withInsforgeSession } from '../api/insforge/ensureSession';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';

const BILLING_PATHS = ['/billing', '/billing/status'];

type SubscriptionStatus = 'loading' | 'allowed' | 'expired' | 'suspended';

/**
 * Redirects to /billing/status if the active company has no active subscription (expired/suspended).
 * Skips check for platform admins and when current path is /billing or /billing/status.
 * Shows loading spinner while checking; allows through when no license row (legacy) or license is active.
 */
export function RequireActiveSubscription({ children }: { children: React.ReactElement }) {
  const location = useLocation();
  const { activeCompanyId, isPlatformAdmin, isTenantLoaded } = useTenant();
  const [status, setStatus] = useState<SubscriptionStatus>('loading');

  const pathname = location.pathname;
  const skipCheck = isPlatformAdmin || BILLING_PATHS.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (skipCheck) {
      setStatus('allowed');
      return;
    }
    if (!isTenantLoaded || !activeCompanyId) {
      setStatus('loading');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    (async () => {
      try {
        const { company, licenses } = await withInsforgeSession('subscription:active-check', async () => {
          const { data: company } = await insforge.database
            .from('companies')
            .select('status')
            .eq('id', activeCompanyId)
            .maybeSingle();
          const { data: licenses } = await insforge.database
            .from('org_licenses')
            .select('id, status, end_date')
            .eq('company_id', activeCompanyId)
            .order('end_date', { ascending: false })
            .limit(1);
          return { company, licenses };
        });
        const companySuspended = (company as { status?: string } | null)?.status === 'suspended';
        if (companySuspended && !cancelled) {
          setStatus('suspended');
          return;
        }
        const license = Array.isArray(licenses) && licenses.length > 0 ? (licenses[0] as { status: string; end_date: string }) : null;
        if (!license) {
          if (!cancelled) setStatus('allowed');
          return;
        }
        const suspended = license.status === 'suspended';
        const expired = license.status === 'expired' || suspended || new Date(license.end_date) < new Date();
        if (!cancelled) setStatus(expired ? (suspended ? 'suspended' : 'expired') : 'allowed');
      } catch {
        if (!cancelled) setStatus('allowed');
      }
    })();
    return () => { cancelled = true; };
  }, [skipCheck, activeCompanyId, isTenantLoaded]);

  if (skipCheck) return children;
  if (status === 'loading') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingSpinner className="w-8 h-8 border-charcoal-300 border-t-teal" />
      </div>
    );
  }
  if (status === 'suspended' || status === 'expired') {
    return <Navigate to={`/billing/status?reason=${status}`} replace />;
  }
  return children;
}
