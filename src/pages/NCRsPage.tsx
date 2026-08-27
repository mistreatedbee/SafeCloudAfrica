import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, AlertTriangle, CheckCircle, Clock, Filter, Download, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTenant } from '../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { listQualityNcrs, createQualityNcr, closeQualityNcr, deleteQualityNcr } from '../api/services/qualityNcrsService';
import { canCloseQualityNcr } from '../api/permissions/ncrPermissions';
import { toUserFacingError } from '../utils/userFacingMessage';
import type { QualityNcr, UUID } from '../api/models/entities';
import { NcrCreateModal } from '../components/ncrs/NcrCreateModal';
import NCRDetailModal from '../components/ncrs/NCRDetailModal';
import { Layout } from '../components/layout/Layout';
import { useDraftManager } from '../session/DraftManagerProvider';
import { toCsv, downloadTextFile } from '../utils/csv';
import { useIdentity } from '../hooks/useIdentity';
import { exportNcrListPdf } from '../api/services/ncrReportExportService';
import { getCompanyLogoUrl } from '../utils/companyLogo';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

export default function NCRsPage() {
  const navigate = useNavigate();
  const { activeCompanyId, activeRole, activeCompany } = useTenant();
  const { user } = useUser();
  const { fullName, organisationName } = useIdentity();
  const [searchQuery, setSearchQuery] = useState('');
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);
  const [ncrs, setNcrs] = useState<QualityNcr[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [selectedRisk, setSelectedRisk] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [departmentIdFilter, setDepartmentIdFilter] = useState('');
  const [assignedUserFilter, setAssignedUserFilter] = useState('');
  const [assignedToMeOnly, setAssignedToMeOnly] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedNCR, setSelectedNCR] = useState<QualityNcr | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [exportOpen, setExportOpen] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const logoUrl = useMemo(
    () => getCompanyLogoUrl((activeCompany?.metadata ?? {}) as Record<string, unknown>),
    [activeCompany?.metadata]
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(event.target as Node)) {
        setExportOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const { restoreLatestDraftByPrefix } = useDraftManager();

  // Resume an in-progress "New NCR" draft automatically when this page loads.
  // NcrCreateModal only unmounts (rather than merely hiding) when isCreateModalOpen
  // is false, so its own restoreDraft() effect never runs until the modal is
  // reopened -- without this, a saved draft sat in localStorage with no
  // affordance to continue it; clicking back into the NCR module did nothing.
  useEffect(() => {
    if (!activeCompanyId || !user?.id) return;
    if (isCreateModalOpen || isDetailModalOpen) return;

    const draftKeyPrefix = `ncr-create:${activeCompanyId}:${user.id}:`;
    const latest = restoreLatestDraftByPrefix<unknown>(draftKeyPrefix);
    if (!latest) return;
    // Only auto-resume drafts started directly from this page (not ones
    // linked from an audit/incident/inspection, which carry their own
    // linkedSource context this page doesn't have).
    if (!latest.key.endsWith(':new')) return;

    setIsCreateModalOpen(true);
  }, [activeCompanyId, isCreateModalOpen, isDetailModalOpen, restoreLatestDraftByPrefix, user?.id]);

  const canCreateNcr = activeRole !== 'employee';
  const canDeleteNcr =
    activeRole === 'owner' || activeRole === 'admin' || activeRole === 'manager' || activeRole === 'supervisor';

  const canUserCloseNcr = (ncr: QualityNcr): boolean => {
    if (!user?.id) return false;
    return canCloseQualityNcr({ ncr, actorUserId: user.id as UUID, actorRole: activeRole });
  };

  const canUploadEvidenceForNcr = (ncr: QualityNcr): boolean => {
    if (!user?.id) return false;
    if (activeRole === 'owner' || activeRole === 'admin' || activeRole === 'manager' || activeRole === 'supervisor') return true;
    if (activeRole === 'employee') return false;
    if (activeRole === 'consultant' || activeRole === 'auditor') {
      const isAssigned =
        ncr.auditor_user_id === user.id ||
        ncr.auditee_user_id === user.id ||
        ncr.corrective_action_owner_user_id === user.id;
      return isAssigned;
    }
    return false;
  };

  useEffect(() => {
    if (activeCompanyId && user?.id) {
      loadNCRs();
    }
  }, [activeCompanyId, selectedStatus, selectedSource, selectedRisk, dateFrom, dateTo, departmentIdFilter, assignedUserFilter, assignedToMeOnly, user?.id, activeRole]);

  async function loadNCRs() {
    if (!activeCompanyId) return;
    try {
      setLoading(true);
      setError('');
      const data = await listQualityNcrs({
        companyId: activeCompanyId,
        status: selectedStatus === 'all' ? undefined : selectedStatus,
        sourceEntityType: selectedSource === 'all' ? undefined : selectedSource,
        riskRating: selectedRisk === 'all' ? undefined : (selectedRisk as any),
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        departmentId: (departmentIdFilter || undefined) as UUID | undefined,
        assignedUserId: (assignedToMeOnly ? user?.id : assignedUserFilter || undefined) as UUID | undefined,
        actorUserId: user?.id as UUID | undefined,
        actorRole: activeRole ?? null
      });
      setNcrs(data);
    } catch (err) {
      setError(toUserFacingError(err, 'Failed to load NCRs. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleCloseNCR(ncrId: UUID) {
    if (!user?.id || !activeCompanyId) return;
    const ncr = ncrs.find((row) => row.id === ncrId) ?? selectedNCR;
    if (!ncr || !canUserCloseNcr(ncr)) {
      throw new Error('You do not have permission to close this NCR.');
    }
    const updated = await closeQualityNcr(ncrId, activeCompanyId, user.id, user.id, activeRole);
    if (updated) {
      setNcrs(ncrs.map(ncr => ncr.id === ncrId ? updated : ncr));
      setSelectedNCR(updated);
    }
  }

  async function handleDeleteNCR(ncrId: UUID) {
    if (!user?.id || !canDeleteNcr || !activeCompanyId) return;
    const target = ncrs.find((n) => n.id === ncrId);
    const label = target?.nc_number ?? `NCR ${ncrId.slice(0, 8)}`;
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    try {
      await deleteQualityNcr(ncrId, activeCompanyId, user.id);
      setNcrs((current) => current.filter((ncr) => ncr.id !== ncrId));
      setSelectedNCR(null);
      setIsDetailModalOpen(false);
    } catch (err) {
      setError(toUserFacingError(err, 'Failed to delete NCR. Please try again.'));
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-300';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default: return 'bg-blue-100 text-blue-800 border-blue-300';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'closed': return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'open': return <AlertTriangle className="w-4 h-4 text-red-600" />;
      case 'in-progress': return <Clock className="w-4 h-4 text-blue-600" />;
      default: return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'closed': return 'bg-green-50 border-green-200';
      case 'open': return 'bg-red-50 border-red-200';
      case 'in-progress': return 'bg-blue-50 border-blue-200';
      default: return 'bg-gray-50 border-gray-200';
    }
  };

  const filteredNCRs = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return ncrs.filter((ncr) => {
      if (showOverdueOnly) {
        const overdue =
          ncr.status !== 'closed' &&
          ncr.corrective_action_due_date &&
          String(ncr.corrective_action_due_date).slice(0, 10) < today;
        if (!overdue && ncr.status !== 'overdue') return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        ncr.nc_number.toLowerCase().includes(q) ||
        ncr.title.toLowerCase().includes(q) ||
        String(ncr.location ?? '').toLowerCase().includes(q) ||
        String(ncr.process_involved ?? '').toLowerCase().includes(q)
      );
    });
  }, [ncrs, searchQuery, showOverdueOnly]);

  async function handleExportPdf() {
    if (filteredNCRs.length === 0) return;
    setExportOpen(false);
    setExportingPdf(true);
    try {
      await exportNcrListPdf({
        ncrs: filteredNCRs,
        companyName: organisationName,
        generatedBy: fullName,
        logoUrl
      });
    } finally {
      setExportingPdf(false);
    }
  }

  function handleExportCsv() {
    setExportOpen(false);
    if (filteredNCRs.length === 0) return;
    const metaLines = [
      `Company: ${organisationName}`,
      `Generated by: ${fullName}`,
      `Generated at: ${new Date().toISOString()}`,
      ''
    ];
    const rows = filteredNCRs.map((ncr) => ({
      nc_number: ncr.nc_number,
      title: ncr.title,
      status: ncr.status,
      severity: ncr.severity,
      location: ncr.location ?? '',
      process: ncr.process_involved ?? '',
      source: (ncr as any).source_entity_type ?? '',
      occurrence_date: ncr.occurrence_date ?? '',
      due_date: ncr.corrective_action_due_date ?? '',
      corrective_action_owner: ncr.corrective_action_owner_user_id ?? ''
    }));
    const safeOrg = organisationName.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'safecloudafrica';
    downloadTextFile(
      `${safeOrg}-ncrs-${new Date().toISOString().slice(0, 10)}.csv`,
      `${metaLines.join('\r\n')}\r\n${toCsv(rows)}`,
      'text/csv;charset=utf-8'
    );
  }

  return (
    <>
      <Layout title="Non-Conformances (NCR)">
        <div className="space-y-6">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between"
          >
            <div>
              <h1 className="text-2xl font-bold text-charcoal">Non-Conformance Reports</h1>
              <p className="text-charcoal-500 mt-1">Manage quality non-conformances and corrective actions</p>
            </div>
            <div className="flex items-center gap-2">
            <div className="relative" ref={exportRef}>
              <button
                type="button"
                onClick={() => setExportOpen((v) => !v)}
                disabled={filteredNCRs.length === 0 || exportingPdf}
                className="flex items-center gap-2 px-4 py-2.5 border border-surface-300 rounded-lg text-sm font-medium hover:bg-surface-50 disabled:opacity-60"
              >
                <Download className="w-4 h-4" />
                {exportingPdf ? 'Exporting…' : 'Export'}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${exportOpen ? 'rotate-180' : ''}`} />
              </button>
              {exportOpen && (
                <div className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-elevated border border-surface-200 overflow-hidden z-50">
                  <button
                    type="button"
                    className="w-full text-left px-4 py-2 text-sm hover:bg-surface-50"
                    onClick={handleExportCsv}
                  >
                    CSV
                  </button>
                  <button
                    type="button"
                    className="w-full text-left px-4 py-2 text-sm hover:bg-surface-50"
                    onClick={() => void handleExportPdf()}
                  >
                    PDF
                  </button>
                </div>
              )}
            </div>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                disabled={!canCreateNcr}
                className="flex items-center gap-2 px-4 py-2.5 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Plus className="w-5 h-5" />
                New NCR
              </button>
            </div>
          </motion.div>

          {error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-4 bg-critical/10 text-critical rounded-lg border border-critical/30"
            >
              {error}
            </motion.div>
          )}

          {/* Filters */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2"
          >
            <button
              onClick={() => setSelectedStatus('all')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                selectedStatus === 'all'
                  ? 'bg-teal text-white'
                  : 'bg-white text-charcoal-600 border border-surface-300 hover:bg-surface-50'
              }`}
            >
              <Filter className="w-4 h-4" />
              All ({ncrs.length})
            </button>
            {['open', 'in-progress', 'awaiting-evidence', 'under-review', 'approved', 'overdue', 'closed'].map(status => {
              const count = ncrs.filter(n => n.status === status).length;
              return (
                <button
                  key={status}
                  onClick={() => setSelectedStatus(status)}
                  className={`px-3 py-2 rounded-lg transition-colors capitalize ${
                    selectedStatus === status
                      ? 'bg-teal text-white'
                      : 'bg-white text-charcoal-600 border border-surface-300 hover:bg-surface-50'
                  }`}
                >
                  {status} ({count})
                </button>
              );
            })}
            <select value={selectedSource} onChange={(e) => setSelectedSource(e.target.value)} className="px-3 py-2 rounded-lg border border-surface-300 text-sm">
              <option value="all">All sources</option>
              <option value="audit">Audit</option>
              <option value="audit_finding">Audit finding</option>
              <option value="incident">Incident</option>
              <option value="inspection">Inspection</option>
              <option value="pjo">PJO</option>
              <option value="complaint">Complaint</option>
              <option value="risk">Risk</option>
            </select>
            <select value={selectedRisk} onChange={(e) => setSelectedRisk(e.target.value)} className="px-3 py-2 rounded-lg border border-surface-300 text-sm">
              <option value="all">All risk levels</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-3 py-2 rounded-lg border border-surface-300 text-sm" />
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-3 py-2 rounded-lg border border-surface-300 text-sm" />
            <input
              value={departmentIdFilter}
              onChange={(e) => setDepartmentIdFilter(e.target.value)}
              placeholder="Department ID"
              className="px-3 py-2 rounded-lg border border-surface-300 text-sm"
            />
            <input
              value={assignedUserFilter}
              onChange={(e) => setAssignedUserFilter(e.target.value)}
              placeholder="Assigned user ID"
              className="px-3 py-2 rounded-lg border border-surface-300 text-sm"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search NCRs..."
              className="px-3 py-2 rounded-lg border border-surface-300 text-sm md:col-span-2"
            />
            <label className="inline-flex items-center gap-2 text-sm text-charcoal-600">
              <input type="checkbox" checked={assignedToMeOnly} onChange={(e) => setAssignedToMeOnly(e.target.checked)} />
              Assigned to me
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-charcoal-600">
              <input type="checkbox" checked={showOverdueOnly} onChange={(e) => setShowOverdueOnly(e.target.checked)} />
              Overdue only
            </label>
          </motion.div>

          {/* NCR List */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid gap-4"
          >
            {loading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-teal-600"></div>
              </div>
            ) : filteredNCRs.length === 0 ? (
              <motion.div
                variants={itemVariants}
                className="text-center py-12 bg-white rounded-xl border border-surface-300 shadow-card"
              >
                <AlertTriangle className="w-12 h-12 text-charcoal-400 mx-auto mb-3" />
                <p className="text-charcoal-600">No non-conformance reports found</p>
              </motion.div>
            ) : (
              filteredNCRs.map((ncr) => (
                <motion.div
                  key={ncr.id}
                  variants={itemVariants}
                  onClick={() => {
                    setSelectedNCR(ncr);
                    setIsDetailModalOpen(true);
                  }}
                  className={`p-6 rounded-xl border cursor-pointer transition-all hover:shadow-card-hover ${getStatusColor(ncr.status)}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        {getStatusIcon(ncr.status)}
                        <h3 className="text-lg font-semibold text-charcoal">{ncr.nc_number}</h3>
                        <span className={`text-xs px-2 py-1 rounded border ${getSeverityColor(ncr.severity)}`}>
                          {ncr.severity.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-charcoal font-medium mb-2">{ncr.title}</p>
                      <div className="flex flex-wrap gap-4 text-sm text-charcoal-500">
                        {ncr.location && <span>📍 {ncr.location}</span>}
                        {ncr.process_involved && <span>⚙️ {ncr.process_involved}</span>}
                        {ncr.occurrence_date && (
                          <span>📅 {new Date(ncr.occurrence_date).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="inline-block px-3 py-1 bg-surface-200 text-charcoal rounded text-sm font-medium capitalize">
                        {ncr.status}
                      </span>
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/dashboard/management/capa/new?sourceType=ncr&sourceId=${ncr.id}&title=${encodeURIComponent(`NCR CAPA: ${ncr.title}`)}`);
                          }}
                          className="text-xs text-teal hover:text-teal-700"
                        >
                          Create Improvement/CAPA
                        </button>
                      </div>
                      {ncr.corrective_action_due_date && (
                        <p className="text-xs text-charcoal-500 mt-2">
                          Due: {new Date(ncr.corrective_action_due_date).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </motion.div>
        </div>
      </Layout>

      {/* Modals */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <NcrCreateModal
            open={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            companyId={activeCompanyId || ''}
            createdByUserId={user?.id || ''}
            onCreated={() => {
              setIsCreateModalOpen(false);
              loadNCRs();
            }}
          />
        )}
        {isDetailModalOpen && selectedNCR && activeCompanyId && user?.id && (
          <NCRDetailModal
            ncr={selectedNCR}
            companyId={activeCompanyId}
            actorUserId={user.id as UUID}
            actorRole={activeRole}
            canDeleteNcr={canDeleteNcr}
            canUploadEvidence={canUploadEvidenceForNcr(selectedNCR)}
            onClose={() => {
              setIsDetailModalOpen(false);
              setSelectedNCR(null);
            }}
            onCloseNCR={handleCloseNCR}
            onDeleteNCR={handleDeleteNCR}
            onNcrUpdated={(updated) => {
              setNcrs((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
              setSelectedNCR(updated);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
