import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangleIcon,
  SearchIcon,
  MapPinIcon,
  CalendarIcon,
  UserIcon
} from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import { listIncidents, listIncidentsWithFilters, raiseNcrFromIncident } from '../api/services/incidentsService';
import {
  createRiskAssessmentFromIncident,
  flagAssessmentsForReviewFromEvent
} from '../api/services/risksService';
import type { Incident } from '../api/models/entities';
import type { IncidentCategory, IncidentType, RiskCategory, IncidentStatus } from '../api/models/core';
import { INCIDENT_CATEGORIES, INCIDENT_TYPES, RISK_CATEGORIES } from '../api/models/core';
import { useUser } from '@insforge/react';
import { toCsv, downloadTextFile } from '../utils/csv';
import { useIdentity } from '../hooks/useIdentity';
import { IncidentCreateModal } from '../components/incidents/IncidentCreateModal';
import { IncidentDetailModal } from '../components/incidents/IncidentDetailModal';
import type { UUID } from '../api/models/core';

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
type DateFilter = 'all' | '1month' | '2months' | '12months';

export function IncidentsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<IncidentCategory | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<IncidentType | 'all'>('all');
  const [riskCategoryFilter, setRiskCategoryFilter] = useState<RiskCategory | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<IncidentStatus | 'all'>('all');
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const { fullName, organisationName } = useIdentity();
  const isNew = location.pathname.endsWith('/new');
  const [createOpen, setCreateOpen] = useState(isNew);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);

  useEffect(() => {
    setCreateOpen(isNew);
  }, [isNew]);

  // Calculate date range for filter
  const dateRange = useMemo(() => {
    if (dateFilter === 'all') return { from: undefined, to: undefined };
    const now = new Date();
    const from = new Date();
    if (dateFilter === '1month') {
      from.setMonth(now.getMonth() - 1);
    } else if (dateFilter === '2months') {
      from.setMonth(now.getMonth() - 2);
    } else if (dateFilter === '12months') {
      from.setMonth(now.getMonth() - 12);
    }
    return { from: from.toISOString(), to: now.toISOString() };
  }, [dateFilter]);

  const { data: incidents, loading, error } = useAsync<Incident[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listIncidentsWithFilters({
        companyId: activeCompanyId,
        search: searchQuery || undefined,
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        incidentType: typeFilter !== 'all' ? typeFilter : undefined,
        riskCategory: riskCategoryFilter !== 'all' ? riskCategoryFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        dateFrom: dateRange.from,
        dateTo: dateRange.to,
        limit: 1000
      });
    },
    [activeCompanyId, searchQuery, categoryFilter, typeFilter, riskCategoryFilter, statusFilter, dateRange]
  );

  const list = incidents ?? [];
  // RBAC: Filter incidents based on role
  // Note: RLS policies already enforce this at DB level, but we add client-side filtering for better UX
  const filteredByRole = useMemo(() => {
    if (!list || !user?.id) return list;

    // Admin/Manager/Supervisor/Consultant: see all incidents (already filtered by RLS)
    if (activeRole === 'admin' || activeRole === 'manager' || activeRole === 'supervisor' || activeRole === 'consultant') {
      return list;
    }

    // Employee: only see incidents they created or are assigned to
    if (activeRole === 'employee') {
      return list.filter(incident =>
        incident.created_by_user_id === user.id ||
        incident.assignee_user_id === user.id ||
        (incident as any).reported_to_user_ids?.includes(user.id as any)
      );
    }

    // Auditor: read-only access (already filtered by RLS)
    if (activeRole === 'auditor') {
      return list;
    }

    return list;
  }, [list, user?.id, activeRole]);
  const openCount = filteredByRole.filter((i) => i.status === 'open').length;
  const investigatingCount = filteredByRole.filter((i) => i.status === 'investigating').length;
  const nearMissCount = filteredByRole.filter((i) => i.category === 'Near Miss').length;

  function handleExportCsv() {
    if (!activeCompanyId || filteredByRole.length === 0) return;

    const rows = filteredByRole.map((incident) => ({
      incident_id: shortId(incident.id),
      title: incident.title,
      category: incident.category,
      subcategory: incident.subcategory,
      severity: incident.severity,
      status: incident.status,
      location: incident.location ?? '',
      occurred_at: incident.occurred_at,
      assignee_user_id: incident.assignee_user_id ?? '',
      module: (incident as any).module ?? '',
    }));

    const metaLines = [
      `Company: ${organisationName}`,
      `Generated by: ${fullName}`,
      `Generated at: ${new Date().toISOString()}`,
      ''
    ];

    const csvBody = toCsv(rows);
    const content = `${metaLines.join('\r\n')}\r\n${csvBody}`;
    const safeOrg = organisationName.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'safecloudafrica';
    const today = new Date().toISOString().slice(0, 10);
    const filename = `${safeOrg}-incidents-${today}.csv`;

    downloadTextFile(filename, content, 'text/csv;charset=utf-8');
  }

  async function handleCreateRiskAssessmentFromIncident(incident: Incident) {
    if (!activeCompanyId || !user?.id) return;
    const isCritical = String(incident.severity).toLowerCase() === 'critical' || String(incident.severity).toLowerCase() === 'high';
    const title = `Task-based RA for incident ${shortId(incident.id)}`;
    const reviewDue = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    await createRiskAssessmentFromIncident(incident.id as any, {
      companyId: activeCompanyId,
      assessmentType: 'task-based',
      title,
      description: incident.description ?? undefined,
      location: incident.location ?? undefined,
      createdByUserId: user.id as any,
      isCritical,
      isPrework: false,
      reviewDueAt: reviewDue
    });

    // Navigate to risks overview so the user can see the new assessment
    navigate('/risks');
  }

  async function handleFlagAssessmentsFromIncident(incident: Incident) {
    if (!activeCompanyId) return;
    const reviewDue = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await flagAssessmentsForReviewFromEvent({
      sourceEntityType: 'incident',
      sourceEntityId: incident.id as any,
      reviewDueAt: reviewDue
    });
  }
  return (
    <Layout title="Incidents & Near Misses">
      {activeCompanyId && user?.id && (
        <>
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
          <IncidentDetailModal
            open={!!selectedIncident}
            onClose={() => setSelectedIncident(null)}
            companyId={activeCompanyId}
            incident={selectedIncident}
            actorUserId={user.id as UUID}
            canEditInvestigation={activeRole === 'admin' || activeRole === 'manager' || activeRole === 'supervisor' || activeRole === 'consultant'}
          />
        </>
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
            <p className="text-sm text-charcoal-500">Filtered Results</p>
            <p className="text-2xl font-bold text-charcoal mt-1">{filteredByRole.length}</p>
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
            <div className="flex flex-wrap gap-2">
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
                1 Month
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
                2 Months
              </button>
              <button
                type="button"
                onClick={() => setDateFilter('12months')}
                className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  dateFilter === '12months'
                    ? 'bg-teal text-white'
                    : 'bg-white border border-surface-300 text-charcoal hover:bg-surface-50'
                }`}
              >
                12 Months
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as IncidentCategory | 'all')}
              className="px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            >
              <option value="all">All Categories</option>
              {INCIDENT_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as IncidentType | 'all')}
              className="px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            >
              <option value="all">All Types</option>
              {INCIDENT_TYPES.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
            <select
              value={riskCategoryFilter}
              onChange={(e) => setRiskCategoryFilter(e.target.value as RiskCategory | 'all')}
              className="px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            >
              <option value="all">All Risk Levels</option>
              {RISK_CATEGORIES.map(risk => (
                <option key={risk} value={risk}>{risk}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as IncidentStatus | 'all')}
              className="px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            >
              <option value="all">All Statuses</option>
              <option value="open">Open</option>
              <option value="investigating">Investigating</option>
              <option value="closed">Closed</option>
            </select>
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
              onClick={handleExportCsv}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-navy text-white rounded-lg text-sm font-medium hover:bg-navy-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={!activeCompanyId || filteredByRole.length === 0}
            >
              Export CSV
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

          {!loading && filteredByRole.length === 0 && activeCompanyId && (
            <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <p className="text-sm text-charcoal-500">No incidents found.</p>
            </div>
          )}

          {filteredByRole.map((incident) => (
          <div
            key={incident.id}
            role="button"
            tabIndex={0}
            onClick={() => setSelectedIncident(incident)}
            onKeyDown={(e) => e.key === 'Enter' && setSelectedIncident(incident)}
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
                      <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedIncident(incident); }} className="text-blue hover:text-blue-600 text-sm">View</button>
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
                    <button
                      type="button"
                      onClick={() => void handleCreateRiskAssessmentFromIncident(incident)}
                      className="text-xs font-medium text-teal hover:text-teal-700 underline-offset-2 hover:underline"
                    >
                      Create risk assessment
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!activeCompanyId || !user?.id) return;
                        await raiseNcrFromIncident({
                          companyId: activeCompanyId,
                          incidentId: incident.id as UUID,
                          actorUserId: user.id as UUID
                        });
                      }}
                      className="text-xs font-medium text-critical hover:text-critical-700 underline-offset-2 hover:underline"
                    >
                      Raise NCR
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleFlagAssessmentsFromIncident(incident)}
                      className="text-xs font-medium text-indigo-700 hover:text-indigo-900 underline-offset-2 hover:underline"
                    >
                      Flag linked assessments for review
                    </button>
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