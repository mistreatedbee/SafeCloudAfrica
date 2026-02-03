import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  SearchIcon,
  PlusIcon,
  CalendarIcon,
  ClipboardCheckIcon,
  AlertCircleIcon } from
'lucide-react';
import { Layout } from '../components/layout/Layout';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useTenant } from '../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../api/hooks/useAsync';
import { countInspections, listInspections } from '../api/services/inspectionsService';
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
  const { user } = useUser();
  const { activeCompanyId, activeRole } = useTenant();

  const isNew = location.pathname.endsWith('/new');
  const [createOpen, setCreateOpen] = useState(isNew);
  useEffect(() => setCreateOpen(isNew), [isNew]);

  const canSchedule = activeRole === 'admin' || activeRole === 'manager' || activeRole === 'supervisor' || activeRole === 'consultant';

  const { data: inspections, loading, error } = useAsync<Inspection[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listInspections({ companyId: activeCompanyId, limit: 500 });
    },
    [activeCompanyId]
  );

  const { data: counts } = useAsync(async () => {
    if (!activeCompanyId) return null;
    const [scheduled, inProgress, overdue] = await Promise.all([
      countInspections(activeCompanyId, { status: 'scheduled' }),
      countInspections(activeCompanyId, { status: 'in-progress' }),
      countInspections(activeCompanyId, { status: 'overdue' })
    ]);
    return { scheduled, inProgress, overdue };
  }, [activeCompanyId]);

  const openFindings = useMemo(() => (inspections ?? []).reduce((sum, i) => sum + (i.findings_count ?? 0), 0), [inspections]);
  const thisYearCount = useMemo(() => {
    const y = new Date().getFullYear();
    return (inspections ?? []).filter((i) => new Date(i.created_at).getFullYear() === y).length;
  }, [inspections]);

  const rows = (inspections ?? []).map((i) => {
    const isAudit = i.title.startsWith('[') && (i.title.includes('INTERNAL') || i.title.includes('EXTERNAL') || i.title.includes('CLIENT') || i.title.includes('SUPPLIER') || i.title.includes('CERTIFICATION'));
    const isInspection = i.title.startsWith('[INSPECTION]');
    let auditType: 'internal' | 'external' | 'client' | 'supplier' | 'certification' | 'inspection' | 'unknown' = 'unknown';
    if (isAudit) {
      if (i.title.includes('INTERNAL')) auditType = 'internal';
      else if (i.title.includes('EXTERNAL')) auditType = 'external';
      else if (i.title.includes('CLIENT')) auditType = 'client';
      else if (i.title.includes('SUPPLIER')) auditType = 'supplier';
      else if (i.title.includes('CERTIFICATION')) auditType = 'certification';
    } else if (isInspection) {
      auditType = 'inspection';
    }
    return {
      id: isAudit ? `AUD-${String(i.id).slice(0, 8)}` : `INS-${String(i.id).slice(0, 8)}`,
      title: i.title,
      type: auditType,
      module: i.module,
      scheduledDate: i.scheduled_at ? new Date(i.scheduled_at).toLocaleDateString('en-ZA') : new Date(i.created_at).toLocaleDateString('en-ZA'),
      status: i.status,
      findings: i.findings_count ?? 0,
      nonConformances: i.nonconformances_count ?? 0
    };
  });

  const filteredAudits = rows.filter((audit) => audit.title.toLowerCase().includes(searchQuery.toLowerCase()) || audit.id.toLowerCase().includes(searchQuery.toLowerCase()));

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
            <p className="text-2xl font-bold text-teal mt-1">{counts?.scheduled ?? 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">In Progress</p>
            <p className="text-2xl font-bold text-warning mt-1">{counts?.inProgress ?? 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Open Findings</p>
            <p className="text-2xl font-bold text-critical mt-1">{openFindings}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">This Year</p>
            <p className="text-2xl font-bold text-charcoal mt-1">{thisYearCount}</p>
          </div>
        </motion.div>

        {/* Header Actions */}
        <motion.div
          variants={itemVariants}
          className="flex flex-col sm:flex-row gap-4 justify-between">

          <div className="relative flex-1 max-w-md">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-400" />
            <input
              type="search"
              placeholder="Search audits..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent" />

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
          {error && (
            <div className="bg-white rounded-xl border border-critical/30 p-4 shadow-card">
              <p className="text-sm font-semibold text-critical">Unable to load audits</p>
              <p className="text-sm text-charcoal-500 mt-1">{error.message}</p>
            </div>
          )}
          {loading && (
            <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <p className="text-sm text-charcoal-500">Loading audits…</p>
            </div>
          )}
          {!loading && !error && filteredAudits.length === 0 && (
            <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <p className="text-sm text-charcoal-500">No audits yet.</p>
            </div>
          )}
          {filteredAudits.map((audit) =>
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
                      <p className="font-medium text-charcoal">{audit.title}</p>
                      <p className="text-sm text-teal mt-0.5">{audit.id}</p>
                    </div>
                    <StatusBadge status={audit.status as any} size="sm" />
                  </div>
                  <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-charcoal-500">
                    <span className="flex items-center gap-1.5">
                      <CalendarIcon className="w-4 h-4" />
                      {audit.scheduledDate}
                    </span>
                    <span
                    className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${auditTypeColors[audit.type as keyof typeof auditTypeColors]}`}>

                      {audit.type}
                    </span>
                    <span className="px-2 py-0.5 bg-surface-100 rounded text-xs font-medium">
                      {audit.module}
                    </span>
                    {audit.findings > 0 &&
                  <span className="flex items-center gap-1 text-warning">
                        <AlertCircleIcon className="w-4 h-4" />
                        {audit.findings} findings
                      </span>
                  }
                    {audit.nonConformances > 0 &&
                  <span className="flex items-center gap-1 text-critical">
                        <AlertCircleIcon className="w-4 h-4" />
                        {audit.nonConformances} NC
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