import React, { useEffect, useState, lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangleIcon,
  RefreshCwIcon,
  SearchIcon,
  MapPinIcon,
  CalendarIcon,
  UserIcon } from
'lucide-react';
import { Layout } from '../components/layout/Layout';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import { listIncidentsPage, getIncidentListStats, deleteIncident } from '../api/services/incidentsService';
import type { IncidentsPage as IncidentsPageResult, IncidentListStats } from '../api/services/incidentsService';
import type { Incident } from '../api/models/entities';
import { useUser } from '@insforge/react';
import { toUserFacingError } from '../utils/userFacingMessage';

const IncidentCreateModal = lazy(() => import('../components/incidents/IncidentCreateModal').then(m => ({ default: m.IncidentCreateModal })));
const IncidentDetailModal = lazy(() => import('../components/incidents/IncidentDetailModal').then(m => ({ default: m.IncidentDetailModal })));

function formatDateZA(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // DD/MM/YYYY
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function shortId(id?: string | null): string {
  if (!id) return 'n/a';
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

const PAGE_SIZE = 25;

function dateFilterToRange(filter: DateFilter): { from?: string } {
  if (filter === 'all') return {};
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - (filter === '1month' ? 1 : 2));
  return { from: cutoff.toISOString() };
}

export function IncidentsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [page, setPage] = useState(0);
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const isNew = location.pathname.endsWith('/new');
  const [createOpen, setCreateOpen] = useState(isNew);
  const [editingIncident, setEditingIncident] = useState<Incident | null>(null);
  const [viewIncident, setViewIncident] = useState<Incident | null>(null);
  const [saveFlashMessage, setSaveFlashMessage] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const canEditInvestigation = activeRole === 'owner' || activeRole === 'admin' || activeRole === 'manager' || activeRole === 'supervisor';

  // Employee-role scoping now happens server-side (createdByUserId filter)
  // instead of fetching everything and filtering client-side.
  const employeeScopeUserId = activeRole === 'employee' ? user?.id : undefined;

  // Any filter change invalidates the current page position.
  useEffect(() => {
    setPage(0);
  }, [searchQuery, dateFilter]);

  async function handleDeleteIncident(incident: Incident) {
    if (!window.confirm('Delete this incident? This cannot be undone.')) return;
    if (!activeCompanyId || !user?.id) return;
    try {
      await deleteIncident({ companyId: activeCompanyId, incidentId: incident.id, actorUserId: user.id });
      void refetchAll();
    } catch (err) {
      setDeleteError(toUserFacingError(err, 'An error occurred. Please try again.'));
    }
  }

  useEffect(() => {
    setCreateOpen(isNew);
  }, [isNew]);

  useEffect(() => {
    const flash = sessionStorage.getItem('incidents.flash.success');
    if (!flash) return;
    setSaveFlashMessage(flash);
    sessionStorage.removeItem('incidents.flash.success');
    const timer = window.setTimeout(() => setSaveFlashMessage(null), 4500);
    return () => window.clearTimeout(timer);
  }, []);

  const { data: incidentsPage, loading, error, retry, isBackendUnavailable } = useAsync<IncidentsPageResult>(
    async () => {
      if (!activeCompanyId) return { items: [], total: 0 };
      return await listIncidentsPage({
        companyId: activeCompanyId,
        search: searchQuery,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        createdByUserId: employeeScopeUserId,
        ...dateFilterToRange(dateFilter)
      });
    },
    [activeCompanyId, searchQuery, page, dateFilter, employeeScopeUserId]
  );

  // If the current page becomes empty but matching rows still exist elsewhere
  // (e.g. deleting the last item on the last page), step back instead of
  // showing a blank page.
  useEffect(() => {
    if (!incidentsPage) return;
    if (incidentsPage.items.length === 0 && incidentsPage.total > 0 && page > 0) {
      setPage((p) => Math.max(0, p - 1));
    }
  }, [incidentsPage, page]);

  const { data: stats, retry: retryStats } = useAsync<IncidentListStats>(
    async () => {
      if (!activeCompanyId) return { total: 0, open: 0, investigating: 0, nearMiss: 0 };
      return await getIncidentListStats({
        companyId: activeCompanyId,
        search: searchQuery,
        createdByUserId: employeeScopeUserId,
        ...dateFilterToRange(dateFilter)
      });
    },
    [activeCompanyId, searchQuery, dateFilter, employeeScopeUserId]
  );

  async function refetchAll() {
    await Promise.all([retry(), retryStats()]);
  }

  const list = incidentsPage?.items ?? [];
  const total = incidentsPage?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const openCount = stats?.open ?? 0;
  const investigatingCount = stats?.investigating ?? 0;
  const nearMissCount = stats?.nearMiss ?? 0;
  return (
    <Layout title="Incidents & Near Misses">
      {activeCompanyId && user?.id && (
        <Suspense fallback={null}>
          <IncidentCreateModal
            open={createOpen || Boolean(editingIncident)}
            onClose={() => {
              setCreateOpen(false);
              setEditingIncident(null);
              if (isNew) navigate('/dashboard/incidents/management', { replace: true });
            }}
            companyId={activeCompanyId}
            createdByUserId={user.id}
            incident={editingIncident}
            defaultModule="safety"
            onCreated={() => {
              setPage(0);
              void refetchAll();
              navigate('/dashboard/incidents/management', { replace: true });
            }}
            onUpdated={() => {
              setEditingIncident(null);
              void refetchAll();
            }}
          />
          <IncidentDetailModal
            open={Boolean(viewIncident)}
            onClose={() => setViewIncident(null)}
            companyId={activeCompanyId}
            incident={viewIncident}
            actorUserId={user.id}
            canEditInvestigation={canEditInvestigation}
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
            <p className="text-2xl font-bold text-charcoal mt-1">{stats?.total ?? total}</p>
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
              onClick={() => navigate('/dashboard/incidents/analysis')}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors"
            >
              Analytics
            </button>
            <button
              type="button"
              onClick={() => navigate('/dashboard/incidents/management/new')}
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
            {isBackendUnavailable && (
              <button
                type="button"
                onClick={retry}
                className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-critical text-white text-sm font-medium hover:bg-critical-600 transition-colors"
              >
                <RefreshCwIcon className="w-4 h-4" />
                Retry
              </button>
            )}
          </motion.div>
        )}

        {saveFlashMessage && (
          <motion.div variants={itemVariants} className="bg-success/10 rounded-xl border border-success/30 p-4 shadow-card">
            <p className="text-sm font-semibold text-success">{saveFlashMessage}</p>
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
            <div className="bg-white rounded-xl border border-surface-300 p-8 shadow-card flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-teal border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-charcoal-500">Loading incidents…</p>
            </div>
          )}

          {deleteError && (
            <div className="bg-white rounded-xl border border-critical/30 p-4 shadow-card">
              <p className="text-sm text-critical">{deleteError}</p>
            </div>
          )}

          {!loading && list.length === 0 && activeCompanyId && (
            <div className="bg-white rounded-xl border border-surface-300 p-8 shadow-card flex flex-col items-center gap-2 text-center">
              <AlertTriangleIcon className="w-10 h-10 text-charcoal-300" />
              <p className="text-sm font-medium text-charcoal-600">
                {total === 0
                  ? 'No incidents recorded yet. Report your first incident.'
                  : 'No incidents on this page.'}
              </p>
            </div>
          )}

          {list.map((incident) => (
          <div
            key={incident.id}
            onClick={() => setViewIncident(incident)}
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
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/dashboard/management/capa/new?sourceType=incident&sourceId=${incident.id}&title=${encodeURIComponent(`Incident CAPA: ${incident.title}`)}`);
                        }}
                        className="text-teal hover:text-teal-700 text-sm"
                      >
                        Create Improvement/CAPA
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingIncident(incident);
                          setCreateOpen(false);
                        }}
                        className="text-blue hover:text-blue-600 text-sm"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDeleteIncident(incident);
                        }}
                        className="text-critical hover:text-critical-600 text-sm"
                      >Delete</button>
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

        {!loading && total > 0 && (
          <motion.div variants={itemVariants} className="flex items-center justify-between gap-4 pt-2">
            <p className="text-sm text-charcoal-500">
              Showing {Math.min(page * PAGE_SIZE + 1, total)}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="px-3 py-2 rounded-lg text-sm font-medium bg-white border border-surface-300 text-charcoal hover:bg-surface-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <span className="text-sm text-charcoal-500">
                Page {page + 1} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                className="px-3 py-2 rounded-lg text-sm font-medium bg-white border border-surface-300 text-charcoal hover:bg-surface-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </motion.div>
        )}
      </motion.div>
    </Layout>
  );
}
