import React, { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangleIcon,
  SearchIcon,
  MapPinIcon,
  CalendarIcon,
  UserIcon } from
'lucide-react';
import { Layout } from '../components/layout/Layout';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import { listIncidents } from '../api/services/incidentsService';
import type { Incident } from '../api/models/entities';
import { useUser } from '@insforge/react';

const IncidentCreateModal = lazy(() => import('../components/incidents/IncidentCreateModal').then(m => ({ default: m.IncidentCreateModal })));

function formatDateZA(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // DD/MM/YYYY
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

const severityColors = {
  critical: 'bg-critical text-white',
  high: 'bg-warning text-white',
  medium: 'bg-teal text-white',
  low: 'bg-success text-white'
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
type DateFilter = 'all' | '1month' | '2months';

export function IncidentsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const { activeCompanyId } = useTenant();
  const { user } = useUser();
  const isNew = location.pathname.endsWith('/new');
  const [createOpen, setCreateOpen] = useState(isNew);

  useEffect(() => {
    setCreateOpen(isNew);
  }, [isNew]);

  const { data: incidents, loading, error } = useAsync<Incident[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listIncidents({ companyId: activeCompanyId, search: searchQuery, limit: 100 });
    },
    [activeCompanyId, searchQuery]
  );

  const allIncidents = incidents ?? [];
  
  // Apply date filter
  const list = useMemo(() => {
    if (dateFilter === 'all') return allIncidents;
    const now = new Date();
    const cutoffDate = new Date();
    if (dateFilter === '1month') {
      cutoffDate.setMonth(now.getMonth() - 1);
    } else if (dateFilter === '2months') {
      cutoffDate.setMonth(now.getMonth() - 2);
    }
    return allIncidents.filter(incident => {
      const incidentDate = new Date(incident.occurred_at);
      return incidentDate >= cutoffDate;
    });
  }, [allIncidents, dateFilter]);
  const openCount = list.filter((i) => i.status === 'open').length;
  const investigatingCount = list.filter((i) => i.status === 'investigating').length;
  const nearMissCount = list.filter((i) => i.category === 'Near Miss').length;
  return (
    <Layout title="Incidents & Near Misses">
      {activeCompanyId && user?.id && (
        <Suspense fallback={null}>
          <IncidentCreateModal
            open={createOpen}
            onClose={() => {
              setCreateOpen(false);
              if (isNew) navigate('/incidents', { replace: true });
            }}
            companyId={activeCompanyId}
            createdByUserId={user.id}
            defaultModule="safety"
            onCreated={() => navigate('/incidents', { replace: true })}
          />
        </Suspense>
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
            <p className="text-sm text-charcoal-500">Open Incidents</p>
            <p className="text-2xl font-bold text-critical mt-1">{openCount}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Investigating</p>
            <p className="text-2xl font-bold text-warning mt-1">{investigatingCount}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">This Month</p>
            <p className="text-2xl font-bold text-charcoal mt-1">{list.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Near Misses</p>
            <p className="text-2xl font-bold text-teal mt-1">{nearMissCount}</p>
          </div>
        </motion.div>

        {/* Header Actions */}
        <motion.div
          variants={itemVariants}
          className="flex flex-col sm:flex-row gap-4 justify-between">

          <div className="flex flex-1 gap-3">
            <div className="relative flex-1 max-w-md">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-400" />
              <input
                type="search"
                placeholder="Search incidents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent" />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDateFilter('all')}
                className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  dateFilter === 'all'
                    ? 'bg-teal text-white'
                    : 'bg-white border border-surface-300 text-charcoal hover:bg-surface-50'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setDateFilter('1month')}
                className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  dateFilter === '1month'
                    ? 'bg-teal text-white'
                    : 'bg-white border border-surface-300 text-charcoal hover:bg-surface-50'
                }`}
              >
                View by Month
              </button>
              <button
                type="button"
                onClick={() => setDateFilter('2months')}
                className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  dateFilter === '2months'
                    ? 'bg-teal text-white'
                    : 'bg-white border border-surface-300 text-charcoal hover:bg-surface-50'
                }`}
              >
                View by 2 Months
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => navigate('/incidents/analytics')}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors"
            >
              Analytics
            </button>
            <button
              type="button"
              onClick={() => navigate('/incidents/new')}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-critical text-white rounded-lg text-sm font-medium hover:bg-critical-600 transition-colors"
            >
              <AlertTriangleIcon className="w-4 h-4" />
              Report Incident
            </button>
          </div>
        </motion.div>

        {error && (
          <motion.div variants={itemVariants} className="bg-white rounded-xl border border-critical/30 p-4 shadow-card">
            <p className="text-sm font-semibold text-critical">Unable to load incidents</p>
            <p className="text-sm text-charcoal-500 mt-1">{error instanceof Error ? error.message : String(error)}</p>
          </motion.div>
        )}

        {!activeCompanyId && (
          <motion.div variants={itemVariants} className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">No company selected. Please register or join a company workspace.</p>
          </motion.div>
        )}

        {/* Incidents List */}
        <motion.div variants={itemVariants} className="space-y-3">
          {loading && (
            <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <p className="text-sm text-charcoal-500">Loading incidents…</p>
            </div>
          )}

          {!loading && list.length === 0 && activeCompanyId && (
            <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <p className="text-sm text-charcoal-500">No incidents found.</p>
            </div>
          )}

          {list.map((incident) => (
          <div
            key={incident.id}
            className="bg-white rounded-xl border border-surface-300 p-4 shadow-card hover:shadow-card-hover transition-all cursor-pointer">

              <div className="flex items-start gap-4">
                <div
                className={`px-2.5 py-1 rounded-lg text-xs font-bold ${severityColors[incident.severity as keyof typeof severityColors]}`}>

                  {incident.severity.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-charcoal">
                        {incident.title}
                      </p>
                      <p className="text-sm text-teal mt-0.5">INC-{shortId(incident.id)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={incident.status as any} size="sm" />
                      <button className="text-blue hover:text-blue-600 text-sm">Edit</button>
                      <button className="text-critical hover:text-critical-600 text-sm">Delete</button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-charcoal-500">
                    <span className="flex items-center gap-1.5">
                      <CalendarIcon className="w-4 h-4" />
                      {formatDateZA(incident.occurred_at)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <MapPinIcon className="w-4 h-4" />
                      {incident.location ?? '—'}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <UserIcon className="w-4 h-4" />
                      {incident.assignee_user_id ? `User ${shortId(incident.assignee_user_id)}` : 'Unassigned'}
                    </span>
                    <span className="px-2 py-0.5 bg-surface-100 rounded text-xs font-medium">
                      {incident.category} • {incident.subcategory}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </Layout>
  );
}