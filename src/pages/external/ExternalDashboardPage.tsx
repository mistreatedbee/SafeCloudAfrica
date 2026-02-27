import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheckIcon, FileTextIcon, SearchIcon, AlertTriangleIcon } from 'lucide-react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useIdentity } from '../../hooks/useIdentity';

export function ExternalDashboardPage() {
  const { activeRole } = useTenant();
  const { organisationName } = useIdentity();
  const isAuditor = activeRole === 'auditor';

  return (
    <Layout title={isAuditor ? 'Auditor Dashboard' : 'Consultant Dashboard'}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-teal-50">
              <ShieldCheckIcon className="w-8 h-8 text-teal" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-charcoal">
                {isAuditor ? 'Auditor' : 'External Consultant'} access
              </h2>
              <p className="text-sm text-charcoal-500 mt-1">
                You have time-bound, scoped access to {organisationName || 'this organisation'}.
                You can view and work only within your assigned modules, departments, and sites.
              </p>
              <p className="text-xs text-charcoal-400 mt-2">
                All your actions are logged for audit purposes.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <a
            href="/audits"
            className="flex items-center gap-4 p-5 bg-white rounded-xl border border-surface-300 shadow-card hover:shadow-card-hover transition-all text-left"
          >
            <div className="p-3 rounded-lg bg-navy/10">
              <SearchIcon className="w-6 h-6 text-navy" />
            </div>
            <div>
              <p className="font-medium text-charcoal">Audits</p>
              <p className="text-sm text-charcoal-500">View and conduct assigned audits</p>
            </div>
          </a>
          <a
            href="/documents"
            className="flex items-center gap-4 p-5 bg-white rounded-xl border border-surface-300 shadow-card hover:shadow-card-hover transition-all text-left"
          >
            <div className="p-3 rounded-lg bg-teal/10">
              <FileTextIcon className="w-6 h-6 text-teal" />
            </div>
            <div>
              <p className="font-medium text-charcoal">Documents</p>
              <p className="text-sm text-charcoal-500">Assigned documents and uploads</p>
            </div>
          </a>
          <a
            href="/dashboard/incidents/management"
            className="flex items-center gap-4 p-5 bg-white rounded-xl border border-surface-300 shadow-card hover:shadow-card-hover transition-all text-left"
          >
            <div className="p-3 rounded-lg bg-amber-500/10">
              <AlertTriangleIcon className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="font-medium text-charcoal">Incidents</p>
              <p className="text-sm text-charcoal-500">Investigations when allowed</p>
            </div>
          </a>
        </div>

        <div className="rounded-lg bg-surface-100 border border-surface-200 px-4 py-3 text-sm text-charcoal-600">
          If you do not see a menu item, it is outside your assigned scope. Contact the organisation admin for access changes.
        </div>
      </motion.div>
    </Layout>
  );
}
