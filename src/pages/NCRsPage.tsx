import { useEffect, useState } from 'react';
import { Plus, AlertTriangle, CheckCircle, Clock, Filter } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '../tenant/TenantContext';
import { useUser } from '@insforge/react';
import {
  listQualityNcrs,
  closeQualityNcr,
  managerApproveQualityNcr,
  auditorVerifyQualityNcr,
  setQualityNcrStatus
} from '../api/services/qualityNcrsService';
import { createCorrectiveAction } from '../api/services/correctiveActionsService';
import { listSites } from '../api/services/sitesService';
import { listDepartments } from '../api/services/departmentsService';
import { listUserProfiles } from '../api/services/profilesService';
import type { QualityNcr, UUID, Site, Department, UserProfile } from '../api/models/entities';
import { NcrCreateModal } from '../components/ncrs/NcrCreateModal';
import NCRDetailModal from '../components/ncrs/NCRDetailModal';
import { Layout } from '../components/layout/Layout';
import { downloadTextFile, toCsv } from '../utils/csv';
import {
  createRiskAssessmentFromNcr,
  flagAssessmentsForReviewFromEvent
} from '../api/services/risksService';
import { useIdentity } from '../hooks/useIdentity';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

export default function NCRsPage() {
  const navigate = useNavigate();
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const { fullName, organisationName } = useIdentity();

  const [ncrs, setNcrs] = useState<QualityNcr[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [selectedSiteId, setSelectedSiteId] = useState<string>('all');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>('all');
  const [selectedPersonUserId, setSelectedPersonUserId] = useState<string>('all');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  const [sites, setSites] = useState<Site[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedNCR, setSelectedNCR] = useState<QualityNcr | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canManageWorkflow = activeRole === 'admin' || activeRole === 'manager' || activeRole === 'auditor' || activeRole === 'consultant';

  useEffect(() => {
    if (!activeCompanyId || !user?.id) return;
    (async () => {
      try {
        const [s, d, p] = await Promise.all([
          listSites(activeCompanyId),
          listDepartments(activeCompanyId),
          listUserProfiles(activeCompanyId)
        ]);
        setSites(s);
        setDepartments(d);
        setProfiles(p);
      } catch {
        // best-effort
      }
    })();
  }, [activeCompanyId, user?.id]);

  useEffect(() => {
    if (!activeCompanyId || !user?.id) return;
    loadNCRs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanyId, user?.id, selectedStatus, selectedSource, selectedSiteId, selectedDepartmentId, selectedPersonUserId, fromDate, toDate]);

  async function loadNCRs() {
    if (!activeCompanyId) return;
    try {
      setLoading(true);
      setError('');
      const data = await listQualityNcrs({
        companyId: activeCompanyId,
        status: selectedStatus === 'all' ? undefined : (selectedStatus as any),
        sourceEntityType: selectedSource === 'all' ? undefined : selectedSource,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        siteId: selectedSiteId === 'all' ? undefined : (selectedSiteId as any),
        departmentId: selectedDepartmentId === 'all' ? undefined : (selectedDepartmentId as any),
        personUserId: selectedPersonUserId === 'all' ? undefined : (selectedPersonUserId as any),
        limit: 500
      });
      setNcrs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load NCRs');
    } finally {
      setLoading(false);
    }
  }

  async function handleCloseNCR(ncrId: UUID) {
    if (!activeCompanyId || !user?.id) return;
    try {
      const updated = await closeQualityNcr(ncrId, activeCompanyId, user.id as any, user.id as any);
      setNcrs((prev) => prev.map((ncr) => (ncr.id === ncrId ? updated : ncr)));
      setSelectedNCR((prev) => (prev?.id === ncrId ? updated : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to close NCR');
    }
  }

  async function handleSetStatus(ncrId: UUID, status: QualityNcr['status']) {
    if (!activeCompanyId || !user?.id) return;
    try {
      const updated = await setQualityNcrStatus({ companyId: activeCompanyId, ncrId, actorUserId: user.id as any, status });
      setNcrs((prev) => prev.map((ncr) => (ncr.id === ncrId ? updated : ncr)));
      setSelectedNCR((prev) => (prev?.id === ncrId ? updated : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update NCR status');
    }
  }

  async function handleManagerApprove(ncrId: UUID) {
    if (!activeCompanyId || !user?.id) return;
    try {
      const updated = await managerApproveQualityNcr({ companyId: activeCompanyId, ncrId, actorUserId: user.id as any });
      setNcrs((prev) => prev.map((ncr) => (ncr.id === ncrId ? updated : ncr)));
      setSelectedNCR((prev) => (prev?.id === ncrId ? updated : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign off NCR');
    }
  }

  async function handleAuditorVerify(ncrId: UUID) {
    if (!activeCompanyId || !user?.id) return;
    try {
      const updated = await auditorVerifyQualityNcr({ companyId: activeCompanyId, ncrId, actorUserId: user.id as any });
      setNcrs((prev) => prev.map((ncr) => (ncr.id === ncrId ? updated : ncr)));
      setSelectedNCR((prev) => (prev?.id === ncrId ? updated : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify NCR');
    }
  }

  async function handleCreateCapa(ncr: QualityNcr) {
    if (!activeCompanyId || !user?.id) return;
    try {
      const due =
        (ncr as any).corrective_action_due_date && String((ncr as any).corrective_action_due_date)
          ? String((ncr as any).corrective_action_due_date).slice(0, 10)
          : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const severity = String(ncr.severity).toLowerCase();
      const priority: 'low' | 'medium' | 'high' | 'urgent' =
        severity === 'critical'
          ? 'urgent'
          : severity === 'high'
            ? 'high'
            : severity === 'low'
              ? 'low'
              : 'medium';

      await createCorrectiveAction({
        companyId: activeCompanyId,
        title: `CAPA: ${(ncr as any).nc_number ?? 'NCR'} - ${ncr.title}`,
        description: ncr.corrective_action ?? ncr.description ?? undefined,
        actionType: 'corrective',
        sourceType: 'ncr',
        sourceId: ncr.id,
        priority,
        dueDate: due,
        assignedToUserId: ((ncr as any).auditee_user_id as any) || undefined,
        rootCause: (ncr as any).root_cause ?? undefined,
        proposedSolution: ncr.corrective_action ?? undefined,
        createdByUserId: user.id as any
      });
      if (ncr.status === 'open') await handleSetStatus(ncr.id, 'in-progress');
      navigate('/tasks?view=capa');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create linked CAPA');
    }
  }

  async function handleCreateRiskAssessmentFromNcr(ncr: QualityNcr) {
    if (!activeCompanyId || !user?.id) return;
    const isCritical = String(ncr.severity).toLowerCase() === 'critical' || String(ncr.severity).toLowerCase() === 'high';
    const title = `Baseline RA for NCR ${String((ncr as any).nc_number ?? '').slice(0, 12)}`;
    const reviewDue = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    await createRiskAssessmentFromNcr(ncr.id as any, {
      companyId: activeCompanyId,
      assessmentType: 'baseline',
      title,
      description: ncr.description ?? undefined,
      processInvolved: ncr.process_involved ?? undefined,
      location: ncr.location ?? undefined,
      createdByUserId: user.id as any,
      isCritical,
      isPrework: false,
      reviewDueAt: reviewDue
    });

    navigate('/risks');
  }

  async function handleFlagAssessmentsFromNcr(ncr: QualityNcr) {
    if (!activeCompanyId) return;
    const reviewDue = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await flagAssessmentsForReviewFromEvent({
      sourceEntityType: 'ncr',
      sourceEntityId: ncr.id as any,
      reviewDueAt: reviewDue
    });
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
      case 'awaiting-evidence': return <Clock className="w-4 h-4 text-orange-600" />;
      case 'under-review': return <Clock className="w-4 h-4 text-purple-600" />;
      case 'approved': return <CheckCircle className="w-4 h-4 text-teal-600" />;
      case 'overdue': return <AlertTriangle className="w-4 h-4 text-red-600" />;
      default: return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'closed': return 'bg-green-50 border-green-200';
      case 'open': return 'bg-red-50 border-red-200';
      case 'in-progress': return 'bg-blue-50 border-blue-200';
      case 'awaiting-evidence': return 'bg-orange-50 border-orange-200';
      case 'under-review': return 'bg-purple-50 border-purple-200';
      case 'approved': return 'bg-teal-50 border-teal-200';
      case 'overdue': return 'bg-red-50 border-red-200';
      default: return 'bg-gray-50 border-gray-200';
    }
  };

  const profileLabelByUserId = (id: string | null | undefined): string => {
    if (!id) return '—';
    const p = profiles.find((x: any) => String((x as any).user_id) === String(id));
    return String((p as any)?.full_name || (p as any)?.email || id);
  };

  function exportCsv() {
    if (!activeCompanyId || ncrs.length === 0) return;

    const rows = ncrs.map((n) => ({
      nc_number: (n as any).nc_number ?? '',
      status: n.status,
      module: (n as any).module ?? '',
      severity: n.severity,
      date_identified: String((n as any).date_identified ?? '').slice(0, 10),
      occurred_at: n.occurred_at,
      project_client: (n as any).project_client ?? '',
      ncr_type: (n as any).ncr_type ?? '',
      ncr_category: (n as any).ncr_category ?? '',
      requirement_reference_type: (n as any).requirement_reference_type ?? '',
      requirement_reference_text: (n as any).requirement_reference_text ?? '',
      site_id: (n as any).site_id ?? '',
      department_id: (n as any).department_id ?? '',
      auditee: profileLabelByUserId((n as any).auditee_user_id),
      auditor: profileLabelByUserId((n as any).auditor_user_id),
      manager: profileLabelByUserId((n as any).department_manager_user_id),
      title: n.title,
      location: n.location ?? '',
      process_involved: n.process_involved ?? '',
      activity_involved: n.activity_involved ?? '',
      risk_rating: (n as any).risk_rating ?? '',
      source_entity_type: n.source_entity_type ?? '',
      source_entity_id: String(n.source_entity_id ?? '')
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
    const filename = `${safeOrg}-ncrs-${today}.csv`;

    downloadTextFile(filename, content, 'text/csv;charset=utf-8');
  }

  return (
    <Layout title="Non-Conformance Reports">
      <div className="max-w-7xl mx-auto px-0 sm:px-2 lg:px-4 py-2">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-8"
        >
          <div>
            <h1 className="text-3xl font-bold text-navy-900">Non-Conformance Reports</h1>
            <p className="text-gray-600 mt-1">Manage non-conformances and corrective actions across modules</p>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            New NCR
          </button>
        </motion.div>

        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
            {error}
          </motion.div>
        )}

        {/* Filters */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6 flex gap-2 flex-wrap">
          <button
            onClick={() => setSelectedStatus('all')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
              selectedStatus === 'all'
                ? 'bg-teal-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            <Filter className="w-4 h-4" />
            All ({ncrs.length})
          </button>
          {(['open', 'in-progress', 'awaiting-evidence', 'under-review', 'approved', 'overdue', 'closed'] as const).map((status) => {
            const count = ncrs.filter((n) => n.status === status).length;
            return (
              <button
                key={status}
                onClick={() => setSelectedStatus(status)}
                className={`px-3 py-2 rounded-lg transition-colors capitalize ${
                  selectedStatus === status
                    ? 'bg-teal-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {status} ({count})
              </button>
            );
          })}
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6 grid grid-cols-1 md:grid-cols-6 gap-3">
          <select value={selectedSource} onChange={(e) => setSelectedSource(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm">
            <option value="all">All sources</option>
            <option value="audit">Audit</option>
            <option value="inspection">Inspection</option>
            <option value="incident">Incident</option>
            <option value="risk_assessment">Risk Assessment</option>
            <option value="complaint">Complaint</option>
            <option value="management_review">Management Review</option>
            <option value="pjo">PJO</option>
            <option value="other">Other</option>
          </select>
          <select value={selectedSiteId} onChange={(e) => setSelectedSiteId(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm">
            <option value="all">All sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select value={selectedDepartmentId} onChange={(e) => setSelectedDepartmentId(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm">
            <option value="all">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <select value={selectedPersonUserId} onChange={(e) => setSelectedPersonUserId(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm">
            <option value="all">All people</option>
            {profiles.map((p: any) => (
              <option key={String(p.user_id)} value={String(p.user_id)}>
                {String(p.full_name || p.email || p.user_id)}
              </option>
            ))}
          </select>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm" />
          <div className="flex gap-2">
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="flex-1 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm" />
            <button type="button" onClick={exportCsv} className="px-3 py-2 rounded-lg bg-navy-900 text-white text-sm hover:bg-navy-800">CSV</button>
            <button
              type="button"
              onClick={() => {
                setSelectedSource('all');
                setSelectedSiteId('all');
                setSelectedDepartmentId('all');
                setSelectedPersonUserId('all');
                setFromDate('');
                setToDate('');
              }}
              className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm hover:bg-gray-50"
            >
              Clear
            </button>
          </div>
        </motion.div>

        {/* NCR List */}
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid gap-4">
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-teal-600"></div>
            </div>
          ) : ncrs.length === 0 ? (
            <motion.div variants={itemVariants} className="text-center py-12 bg-white rounded-lg border border-gray-200">
              <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">No non-conformance reports found</p>
            </motion.div>
          ) : (
            ncrs.map((ncr) => (
              <motion.div
                key={ncr.id}
                variants={itemVariants}
                onClick={() => {
                  setSelectedNCR(ncr);
                  setIsDetailModalOpen(true);
                }}
                className={`p-6 rounded-lg border cursor-pointer transition-all hover:shadow-lg ${getStatusColor(ncr.status)}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {getStatusIcon(ncr.status)}
                      <h3 className="text-lg font-semibold text-gray-900">{String((ncr as any).nc_number ?? '')}</h3>
                      <span className={`text-xs px-2 py-1 rounded border ${getSeverityColor(ncr.severity)}`}>
                        {String(ncr.severity).toUpperCase()}
                      </span>
                    </div>
                    <p className="text-gray-700 font-medium mb-2">{ncr.title}</p>
                    <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                      {(ncr as any).project_client ? <span>🏷️ {String((ncr as any).project_client)}</span> : null}
                      {ncr.location ? <span>📍 {ncr.location}</span> : null}
                      {ncr.process_involved ? <span>⚙️ {ncr.process_involved}</span> : null}
                      <span>📅 {new Date((((ncr as any).date_identified ?? ncr.occurred_at) as any)).toLocaleDateString('en-ZA')}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-block px-3 py-1 bg-gray-200 text-gray-800 rounded text-sm font-medium capitalize">
                      {ncr.status}
                    </span>
                    {ncr.corrective_action_due_date ? (
                      <p className="text-xs text-gray-600 mt-2">
                        Due: {new Date(ncr.corrective_action_due_date).toLocaleDateString('en-ZA')}
                      </p>
                    ) : null}
                    <div className="mt-3 space-y-1 text-xs">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleCreateRiskAssessmentFromNcr(ncr);
                        }}
                        className="block w-full text-left text-teal-700 hover:text-teal-900 underline-offset-2 hover:underline"
                      >
                        Create linked risk assessment
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleFlagAssessmentsFromNcr(ncr);
                        }}
                        className="block w-full text-left text-indigo-700 hover:text-indigo-900 underline-offset-2 hover:underline"
                      >
                        Flag assessments for review
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </motion.div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {isCreateModalOpen && activeCompanyId && user?.id && (
          <NcrCreateModal
            open={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            companyId={activeCompanyId}
            createdByUserId={user.id as any}
            onCreated={() => {
              setIsCreateModalOpen(false);
              loadNCRs();
            }}
          />
        )}
        {isDetailModalOpen && selectedNCR && (
          <NCRDetailModal
            ncr={selectedNCR}
            onClose={() => setIsDetailModalOpen(false)}
            onCloseNCR={handleCloseNCR}
            onSetStatus={handleSetStatus}
            onManagerApprove={handleManagerApprove}
            onAuditorVerify={handleAuditorVerify}
            onCreateCapa={handleCreateCapa}
            canManageWorkflow={canManageWorkflow}
            companyName={organisationName}
            generatedBy={fullName}
          />
        )}
      </AnimatePresence>
    </Layout>
  );
}
