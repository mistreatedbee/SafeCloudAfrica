import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ClipboardCheckIcon, PlusIcon, SearchIcon, DownloadIcon, XIcon } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { useTenant } from '../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../api/hooks/useAsync';
import type { PjoObservation, PjoResponse } from '../api/models/entities';
import type { UUID } from '../api/models/core';
import { listPjos, listPjoResponses } from '../api/services/pjoService';
import { listDistinctJobTitles } from '../api/services/hrService';
import { PjoCreateModal } from '../components/pjo/PjoCreateModal';
import { PjoDetailModal } from '../components/pjo/PjoDetailModal';
import { PjoQuestionManager } from '../components/pjo/PjoQuestionManager';
import { HrEmployeeSelect } from '../components/ui/HrEmployeeSelect';
import { toUserFacingError } from '../utils/userFacingMessage';
import { toCsv, downloadTextFile } from '../utils/csv';
import { useIdentity } from '../hooks/useIdentity';
import { getCompanyLogoUrl } from '../utils/companyLogo';
import { exportPjoDetailPdf, exportPjoListExcel, pjoDetailPdfFileName } from '../api/services/pjoReportExportService';
import { downloadFile } from '../api/services/exportService';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

const CURRENT_YEAR_START = `${new Date().getFullYear()}-01-01`;

export function PjoPage() {
  const { activeCompanyId, activeRole, activeCompany } = useTenant();
  const { user } = useUser();
  const canManage = activeRole === 'owner' || activeRole === 'admin' || activeRole === 'manager' || activeRole === 'supervisor' || activeRole === 'consultant';
  const { fullName, organisationName } = useIdentity();
  const logoUrl = useMemo(
    () => getCompanyLogoUrl((activeCompany?.metadata ?? {}) as Record<string, unknown>),
    [activeCompany?.metadata]
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<PjoObservation | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState<'observations' | 'questions'>('observations');
  const [error, setError] = useState<string | null>(null);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdfId, setExportingPdfId] = useState<UUID | null>(null);

  const [filterEmployeeId, setFilterEmployeeId] = useState<UUID | ''>('');
  const [filterJobTitle, setFilterJobTitle] = useState('');
  const [filterFromDate, setFilterFromDate] = useState(CURRENT_YEAR_START);
  const [filterToDate, setFilterToDate] = useState('');

  function clearFilters() {
    setFilterEmployeeId('');
    setFilterJobTitle('');
    setFilterFromDate(CURRENT_YEAR_START);
    setFilterToDate('');
  }

  const { data: jobTitles } = useAsync<string[]>(
    async () => (activeCompanyId ? await listDistinctJobTitles(activeCompanyId) : []),
    [activeCompanyId]
  );

  const { data, loading, error: loadError } = useAsync<PjoObservation[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listPjos({
        companyId: activeCompanyId,
        limit: 500,
        employeeHrEmployeeId: filterEmployeeId || undefined,
        jobTitle: filterJobTitle || undefined,
        fromDate: filterFromDate || undefined,
        toDate: filterToDate || undefined
      });
    },
    [activeCompanyId, refreshKey, filterEmployeeId, filterJobTitle, filterFromDate, filterToDate]
  );

  const list = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const all = data ?? [];
    if (!q) return all;
    return all.filter((p) => {
      return (
        p.employee_name.toLowerCase().includes(q) ||
        p.job_observed.toLowerCase().includes(q) ||
        (p.department ?? '').toLowerCase().includes(q) ||
        (p.site ?? '').toLowerCase().includes(q)
      );
    });
  }, [data, searchQuery]);

  const openCount = (data ?? []).filter((p) => p.status === 'open').length;

  async function handleDownloadPjoPdf(pjo: PjoObservation) {
    if (!activeCompanyId) return;
    setExportingPdfId(pjo.id);
    setError(null);
    try {
      const responses = await listPjoResponses(activeCompanyId, pjo.id);
      const blob = await exportPjoDetailPdf({
        pjo,
        responses,
        companyName: organisationName,
        generatedBy: fullName,
        logoUrl
      });
      downloadFile(blob, pjoDetailPdfFileName(pjo));
    } catch (err) {
      setError(toUserFacingError(err, 'Failed to generate PJO PDF.'));
    } finally {
      setExportingPdfId(null);
    }
  }

  async function handleExportExcel() {
    if (!activeCompanyId || list.length === 0) return;
    setExportingExcel(true);
    setError(null);
    try {
      const responsesByPjoId = new Map<string, PjoResponse[]>();
      for (const pjo of list) {
        responsesByPjoId.set(pjo.id, await listPjoResponses(activeCompanyId, pjo.id));
      }
      await exportPjoListExcel({
        pjos: list,
        responsesByPjoId,
        companyName: organisationName,
        generatedBy: fullName,
        dateFrom: filterFromDate,
        dateTo: filterToDate
      });
    } catch (err) {
      setError(toUserFacingError(err, 'Failed to generate PJO Excel report.'));
    } finally {
      setExportingExcel(false);
    }
  }

  function handleExportCsv() {
    if (!activeCompanyId || list.length === 0) return;

    const rows = list.map((p) => ({
      employee_name: p.employee_name,
      job_observed: p.job_observed,
      department: p.department ?? '',
      site: p.site ?? '',
      observed_at: p.observed_at,
      next_observation_at: p.next_observation_at ?? '',
      status: p.status,
    }));

    const metaLines = [
      `Company: ${organisationName}`,
      `Generated by: ${fullName}`,
      `Generated at: ${new Date().toISOString()}`,
      '',
    ];

    const csvBody = toCsv(rows);
    const content = `${metaLines.join('\r\n')}\r\n${csvBody}`;
    const safeOrg = organisationName.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'safecloudafrica';
    const today = new Date().toISOString().slice(0, 10);
    const filename = `${safeOrg}-pjo-${today}.csv`;

    downloadTextFile(filename, content, 'text/csv;charset=utf-8');
  }

  return (
    <Layout title="Plan Job Observations (PJO)">
      {activeCompanyId && user?.id && (
        <>
          <PjoCreateModal
            open={createOpen}
            onClose={() => setCreateOpen(false)}
            companyId={activeCompanyId}
            actorUserId={user.id}
            onCreated={() => {
              setCreateOpen(false);
              setRefreshKey((k) => k + 1);
            }}
          />
          <PjoDetailModal
            open={detailOpen}
            onClose={() => setDetailOpen(false)}
            companyId={activeCompanyId}
            actorUserId={user.id}
            activeRole={activeRole}
            pjo={selected}
          />
        </>
      )}

      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
        <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Open PJOs</p>
            <p className="text-2xl font-bold text-warning mt-1">{openCount}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Total PJOs</p>
            <p className="text-2xl font-bold text-charcoal mt-1">{(data ?? []).length}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Module</p>
            <p className="text-2xl font-bold text-teal mt-1">HR / Training</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Automation</p>
            <p className="text-sm font-semibold text-success mt-1">NCR auto-link</p>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="flex gap-1 border-b border-surface-200">
          <button
            type="button"
            onClick={() => setActiveTab('observations')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${activeTab === 'observations' ? 'border-teal text-teal' : 'border-transparent text-charcoal-500 hover:text-charcoal'}`}
          >
            Observations
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('questions')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${activeTab === 'questions' ? 'border-teal text-teal' : 'border-transparent text-charcoal-500 hover:text-charcoal'}`}
          >
            Questions
          </button>
        </motion.div>

        {activeTab === 'questions' && activeCompanyId && user?.id && (
          <motion.div variants={itemVariants}>
            <PjoQuestionManager companyId={activeCompanyId} actorUserId={user.id as UUID} canManage={canManage} />
          </motion.div>
        )}

        {activeTab === 'observations' && (
        <>
        <motion.div variants={itemVariants} className="bg-white rounded-xl border border-surface-300 p-4 shadow-card space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <HrEmployeeSelect
              companyId={activeCompanyId}
              value={filterEmployeeId}
              valueField="id"
              includeUnlinked
              label="Employee"
              onChange={(selected) => setFilterEmployeeId(selected)}
            />
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">Job description</label>
              <select
                value={filterJobTitle}
                onChange={(e) => setFilterJobTitle(e.target.value)}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
              >
                <option value="">All job titles</option>
                {(jobTitles ?? []).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">From date</label>
              <input
                type="date"
                value={filterFromDate}
                onChange={(e) => setFilterFromDate(e.target.value)}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">To date</label>
              <input
                type="date"
                value={filterToDate}
                onChange={(e) => setFilterToDate(e.target.value)}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 text-sm text-charcoal-500 hover:text-charcoal hover:underline"
              >
                <XIcon className="w-3.5 h-3.5" />
                Clear filters
              </button>
            </div>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="relative flex-1 max-w-md">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-400" />
            <input
              type="search"
              placeholder="Search PJOs…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!activeCompanyId || list.length === 0}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-navy text-white rounded-lg text-sm font-medium hover:bg-navy-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => void handleExportExcel()}
              disabled={!activeCompanyId || list.length === 0 || exportingExcel}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-navy text-white rounded-lg text-sm font-medium hover:bg-navy-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <DownloadIcon className="w-4 h-4" />
              {exportingExcel ? 'Generating…' : 'Export Excel'}
            </button>
            <button
              type="button"
              disabled={!canManage || !activeCompanyId || !user?.id}
              onClick={() => setCreateOpen(true)}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <PlusIcon className="w-4 h-4" />
              New PJO
            </button>
          </div>
        </motion.div>

        {loadError && (
          <motion.div variants={itemVariants} className="bg-white rounded-xl border border-critical/30 p-4 shadow-card">
            <p className="text-sm font-semibold text-critical">Unable to load PJOs</p>
            <p className="text-sm text-charcoal-500 mt-1">{loadError.message}</p>
          </motion.div>
        )}
        {error && (
          <motion.div variants={itemVariants} className="bg-white rounded-xl border border-critical/30 p-4 shadow-card">
            <p className="text-sm font-semibold text-critical">Action failed</p>
            <p className="text-sm text-charcoal-500 mt-1">{error}</p>
          </motion.div>
        )}

        <motion.div variants={itemVariants} className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
            <h3 className="font-semibold text-charcoal flex items-center gap-2">
              <ClipboardCheckIcon className="w-5 h-5 text-teal" />
              Observations
            </h3>
            <span className="text-sm text-charcoal-400">{list.length} records</span>
          </div>

          <div className="divide-y divide-surface-100">
            {loading && <div className="px-5 py-4 text-sm text-charcoal-500">Loading PJOs…</div>}
            {!loading && list.length === 0 && <div className="px-5 py-4 text-sm text-charcoal-500">No PJOs yet.</div>}
            {list.map((p) => (
              <div key={p.id} className="w-full px-5 py-4 hover:bg-surface-50 transition-colors flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelected(p);
                    setDetailOpen(true);
                  }}
                  className="text-left flex-1 min-w-0"
                >
                  <p className="text-sm font-semibold text-charcoal">{p.employee_name}</p>
                  <p className="text-sm text-charcoal-500 mt-0.5">
                    {p.job_observed} • {p.department ?? '—'} / {p.site ?? '—'}
                    {p.job_title ? ` • ${p.job_title}` : ''}
                  </p>
                  <p className="text-xs text-charcoal-400 mt-0.5">
                    Observed: {p.observed_at} • Next: {p.next_observation_at ?? '—'}
                  </p>
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleDownloadPjoPdf(p)}
                    disabled={exportingPdfId === p.id}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-surface-300 text-xs font-medium text-charcoal hover:bg-surface-100 disabled:opacity-50"
                  >
                    <DownloadIcon className="w-3 h-3" />
                    {exportingPdfId === p.id ? '…' : 'PDF'}
                  </button>
                  <span className={`text-xs px-2 py-1 rounded-lg border ${p.status === 'open' ? 'bg-warning/10 border-warning/30 text-warning' : 'bg-success/10 border-success/30 text-success'}`}>
                    {p.status.toUpperCase()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
        </>
        )}
      </motion.div>
    </Layout>
  );
}

