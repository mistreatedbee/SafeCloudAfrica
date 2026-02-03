import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  SearchIcon,
  PlusIcon,
  CalendarIcon,
  ClipboardCheckIcon,
  AlertCircleIcon,
  CheckCircle,
  Clock } from
'lucide-react';
import { Layout } from '../components/layout/Layout';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useTenant } from '../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../api/hooks/useAsync';
import { listAudits } from '../api/services/auditsService';
import { listInspections } from '../api/services/inspectionsService';
import type { Inspection } from '../api/models/entities';
import { AuditScheduleModal } from '../components/audits/AuditScheduleModal';

const auditTypeColors = {
  internal: 'bg-teal-50 text-teal-700',
  external: 'bg-navy-50 text-navy-700',
  client: 'bg-blue-50 text-blue-700',
  supplier: 'bg-purple-50 text-purple-700',
  certification: 'bg-green-50 text-green-700',
  inspection: 'bg-orange-50 text-orange-700',
  unknown: 'bg-gray-50 text-gray-700'
};
const containerVariants = {
  hidden: {
    opacity: 0
  },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
};
const itemVariants = {
  hidden: {
    opacity: 0,
    y: 20
  },
  visible: {
    opacity: 1,
    y: 0
  }
};
export function AuditsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [auditTypeFilter, setAuditTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const { user } = useUser();
  const { activeCompanyId, activeRole } = useTenant();

  const isNew = location.pathname.endsWith('/new');
  const [createOpen, setCreateOpen] = useState(isNew);
  useEffect(() => setCreateOpen(isNew), [isNew]);

  const canSchedule = activeRole === 'admin' || activeRole === 'manager' || activeRole === 'supervisor' || activeRole === 'consultant';

  // Load audits from new audits module
  const { data: audits, loading: auditsLoading, error: auditsError } = useAsync(
    async () => {
      if (!activeCompanyId) return [];
      return await listAudits({ companyId: activeCompanyId, limit: 500 });
    },
    [activeCompanyId]
  );

  // Load inspections (for separate display if needed)
  const { data: inspections, loading: inspectionsLoading } = useAsync<Inspection[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listInspections({ companyId: activeCompanyId, limit: 500 });
    },
    [activeCompanyId]
  );

  const stats = useMemo(() => {
    if (!audits) return { scheduled: 0, inProgress: 0, completed: 0, total: 0 };
    return {
      scheduled: audits.filter(a => a.status === 'scheduled').length,
      inProgress: audits.filter(a => a.status === 'in-progress').length,
      completed: audits.filter(a => a.status === 'completed').length,
      total: audits.length
    };
  }, [audits]);

  const openFindings = useMemo(() => {
    return (audits ?? []).reduce((sum, a) => sum + (a.findings_count ?? 0), 0);
  }, [audits]);

  const nonconformances = useMemo(() => {
    return (audits ?? []).reduce((sum, a) => sum + (a.nonconformances_count ?? 0), 0);
  }, [audits]);

  // Filter audits
  let filtered = audits ?? [];
  if (auditTypeFilter !== 'all') {
    filtered = filtered.filter(a => a.audit_type === auditTypeFilter);
  }
  if (statusFilter !== 'all') {
    filtered = filtered.filter(a => a.status === statusFilter);
  }
  if (searchQuery) {
    filtered = filtered.filter(a => 
      a.audit_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.objectives.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }

  const auditTypeColors: Record<string, string> = {
    'internal': 'bg-teal-50 text-teal-700 border-teal-200',
    'external': 'bg-navy-50 text-navy-700 border-navy-200',
    'client': 'bg-blue-50 text-blue-700 border-blue-200',
    'supplier': 'bg-purple-50 text-purple-700 border-purple-200',
    'certification': 'bg-green-50 text-green-700 border-green-200'
  };

  const statusIcons: Record<string, JSX.Element> = {
    'planned': <Clock className="w-4 h-4" />,
    'scheduled': <CalendarIcon className="w-4 h-4" />,
    'in-progress': <Clock className="w-4 h-4" />,
    'completed': <CheckCircle className="w-4 h-4" />
  };

  return (
    <Layout title="Audits & Inspections">
      {activeCompanyId && user?.id && (
        <AuditScheduleModal
          open={createOpen}
          onClose={() => {
            setCreateOpen(false);
            if (isNew) navigate('/audits', { replace: true });
          }}
          companyId={activeCompanyId}
          createdByUserId={user.id}
          onCreated={() => navigate('/audits', { replace: true })}
        />
      )}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-6">

        {/* Stats */}
        <motion.div
          variants={itemVariants}
          className="grid grid-cols-2 md:grid-cols-4 gap-4">

          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Scheduled</p>
            <p className="text-2xl font-bold text-teal mt-1">{stats.scheduled}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">In Progress</p>
            <p className="text-2xl font-bold text-warning mt-1">{stats.inProgress}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Open Findings</p>
            <p className="text-2xl font-bold text-critical mt-1">{openFindings}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Non-Conformances</p>
            <p className="text-2xl font-bold text-charcoal mt-1">{nonconformances}</p>
          </div>
        </motion.div>

        {/* Header Actions */}
        <motion.div
          variants={itemVariants}
          className="flex flex-col sm:flex-row gap-4 justify-between">

          <div className="flex-1 max-w-md space-y-3">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-400" />
              <input
                type="search"
                placeholder="Search audits..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent" />
            </div>
            <div className="flex gap-2">
              <select
                value={auditTypeFilter}
                onChange={(e) => setAuditTypeFilter(e.target.value)}
                className="px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                <option value="all">All Types</option>
                <option value="internal">Internal</option>
                <option value="external">External</option>
                <option value="client">Client</option>
                <option value="supplier">Supplier</option>
                <option value="certification">Certification</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                <option value="all">All Status</option>
                <option value="planned">Planned</option>
                <option value="scheduled">Scheduled</option>
                <option value="in-progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>
          <button
            type="button"
            disabled={!canSchedule}
            onClick={() => navigate('/audits/new')}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <PlusIcon className="w-4 h-4" />
            Schedule Audit
          </button>
        </motion.div>

        {/* Audits List */}
        <motion.div variants={itemVariants} className="space-y-3">
          {auditsError && (
            <div className="bg-white rounded-xl border border-critical/30 p-4 shadow-card">
              <p className="text-sm font-semibold text-critical">Unable to load audits</p>
              <p className="text-sm text-charcoal-500 mt-1">{(auditsError as any)?.message || 'Unknown error'}</p>
            </div>
          )}
          {auditsLoading && (
            <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <p className="text-sm text-charcoal-500">Loading audits…</p>
            </div>
          )}
          {!auditsLoading && !auditsError && filtered.length === 0 && (
            <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <p className="text-sm text-charcoal-500">No audits found.</p>
            </div>
          )}
          {filtered.map((audit) =>
            <div
              key={audit.id}
              className="bg-white rounded-xl border border-surface-300 p-4 shadow-card hover:shadow-card-hover transition-all cursor-pointer">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-surface-100 rounded-lg">
                  <ClipboardCheckIcon className="w-5 h-5 text-charcoal-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-charcoal">{audit.objectives}</p>
                      <p className="text-sm text-teal mt-0.5">{audit.audit_number}</p>
                    </div>
                    <StatusBadge status={audit.status as any} size="sm" />
                  </div>
                  <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-charcoal-500">
                    {audit.selected_date ? (
                      <span className="flex items-center gap-1.5">
                        <CalendarIcon className="w-4 h-4" />
                        {new Date(audit.selected_date).toLocaleDateString('en-ZA')}
                      </span>
                    ) : audit.proposed_dates?.length ? (
                      <span className="flex items-center gap-1.5">
                        <CalendarIcon className="w-4 h-4" />
                        {new Date(audit.proposed_dates[0]).toLocaleDateString('en-ZA')}
                      </span>
                    ) : null}
                    <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize border ${auditTypeColors[audit.audit_type] || 'bg-gray-50 text-gray-700'}`}>
                      {audit.audit_type}
                    </span>
                    <span className="px-2 py-0.5 bg-surface-100 rounded text-xs font-medium">
                      {audit.scope_of_audit}
                    </span>
                    {audit.findings_count > 0 &&
                      <span className="flex items-center gap-1 text-warning">
                        <AlertCircleIcon className="w-4 h-4" />
                        {audit.findings_count} findings
                      </span>
                    }
                    {audit.nonconformances_count > 0 &&
                      <span className="flex items-center gap-1 text-critical">
                        <AlertCircleIcon className="w-4 h-4" />
                        {audit.nonconformances_count} NC
                      </span>
                    }
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </Layout>);
}