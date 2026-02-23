import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShieldAlertIcon, HomeIcon } from 'lucide-react';
import { useTenant } from '../tenant/TenantContext';
import { Layout } from '../components/layout/Layout';

function dashboardPathForRole(role: string | null): string {
  if (!role) return '/app';
  const map: Record<string, string> = {
    owner: '/owner',
    admin: '/admin',
    manager: '/manager',
    supervisor: '/manager',
    employee: '/employee',
    consultant: '/external',
    auditor: '/external'
  };
  return map[role] ?? '/app';
}

export function AccessDeniedPage() {
  const location = useLocation();
  const { activeRole } = useTenant();
  const from = (location.state as { from?: string })?.from;
  const dashboardPath = dashboardPathForRole(activeRole);

  return (
    <Layout title="Access denied">
      <div className="max-w-md mx-auto text-center py-12">
        <div className="inline-flex p-4 rounded-full bg-amber-100 mb-6">
          <ShieldAlertIcon className="w-12 h-12 text-amber-600" />
        </div>
        <h1 className="text-xl font-semibold text-charcoal mb-2">Access denied</h1>
        <p className="text-charcoal-500 mb-6">
          You don&apos;t have permission to view this page.
          {from && (
            <span className="block mt-2 text-sm">
              Blocked: <code className="bg-surface-200 px-1 rounded">{from}</code>
            </span>
          )}
        </p>
        <Link
          to={dashboardPath}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-teal text-white font-medium hover:bg-teal-600 transition-colors"
        >
          <HomeIcon className="w-5 h-5" />
          Back to my dashboard
        </Link>
      </div>
    </Layout>
  );
}
