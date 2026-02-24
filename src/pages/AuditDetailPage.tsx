import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CalendarIcon, ClipboardCheckIcon, ArrowLeftIcon, AlertCircleIcon, FileTextIcon, DownloadIcon } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import { StatusBadge } from '../components/ui/StatusBadge';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { NcrCreateModal } from '../components/ncrs/NcrCreateModal';
import { EvidenceModal } from '../components/evidence/EvidenceModal';
import type { UUID, Audit, QualityNcr } from '../api/models/entities';
import { exportAuditPDF, exportAuditChecklistCSV, downloadFile } from '../api/services/exportService';
import {
  getAudit,
  listAuditQuestions,
  listAuditResponses,
  startAudit,
  completeAudit,
  updateAuditFindingsCounts,
  submitAuditResponse,
  approveAuditDate,
  declineAuditDate,
  type AuditQuestion,
  type AuditResponse
} from '../api/services/auditsService';
import { listQualityNcrs } from '../api/services/qualityNcrsService';
import { listCorrectiveActions, createCorrectiveAction, type CorrectiveAction } from '../api/services/correctiveActionsService';
import {
  listProgramAuditFindings,
  createProgramAuditFinding,
  updateProgramAuditFinding,
  managerSignOffProgramAuditFinding,
  auditorVerifyAndCloseProgramAuditFinding
} from '../api/services/programAuditFindingsService';
import { listLinkedImprovements } from '../api/services/improvementService';
import { createTask } from '../api/services/tasksService';
import {
  getPreAuditSubmission,
  upsertPreAuditSubmission,
  approvePreAuditSubmissionForAudit,
  addPreAuditUploadedDoc,
  submitPreAuditSubmission
} from '../api/services/preAuditSubmissionsService';
import {
  generateAuditReport,
  listAuditReports,
  renderReportAsHtml
} from '../api/services/auditReportService';
import { updateAudit } from '../api/services/auditsService';
import { useUser } from '@insforge/react';
import { insforge } from '../api/insforge/client';
import { EVIDENCE_BUCKET } from '../components/evidence/EvidenceModal';
import { useIdentity } from '../hooks/useIdentity';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-ZA');
}

export function AuditDetailPage() {
  const { auditId } = useParams<{ auditId: string }>();
  const navigate = useNavigate();
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const { fullName, organisationName } = useIdentity();

  const canEdit =
    activeRole === 'admin' ||
    activeRole === 'manager' ||
    activeRole === 'supervisor' ||
    activeRole === 'consultant' ||
    activeRole === 'auditor';

  const {
    data: audit,
    loading: auditLoading,
    error: auditError,
    refresh: refreshAudit
  } = useAsync<Audit | null>(
    async () => {
      if (!auditId) return null;
      return await getAudit(auditId as UUID);
    },
    [auditId]
  );

  const {
    data: questions,
    loading: questionsLoading,
    error: questionsError,
    refresh: refreshQuestions
  } = useAsync<AuditQuestion[]>(
    async () => {
      if (!auditId) return [];
      return await listAuditQuestions(auditId as UUID);
    },
    [auditId]
  );

  const {
    data: responses,
    loading: responsesLoading,
    error: responsesError,
    refresh: refreshResponses
  } = useAsync<AuditResponse[]>(
    async () => {
      if (!auditId) return [];
      return await listAuditResponses(auditId as UUID);
    },
    [auditId]
  );

  const [savingResponseId, setSavingResponseId] = useState<UUID | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [isNcrModalOpen, setIsNcrModalOpen] = useState(false);
  const [ncrLinkedQuestionId, setNcrLinkedQuestionId] = useState<UUID | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [raisingFindingForQuestionId, setRaisingFindingForQuestionId] = useState<UUID | null>(null);
  const [creatingTaskForFindingId, setCreatingTaskForFindingId] = useState<UUID | null>(null);
  const [dateApprovalLoading, setDateApprovalLoading] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [chosenDate, setChosenDate] = useState('');
  const [preAuditUploadingFor, setPreAuditUploadingFor] = useState<string | null>(null);
  const [preAuditSubmitLoading, setPreAuditSubmitLoading] = useState(false);
  const preAuditFileInputRef = React.useRef<HTMLInputElement>(null);
  const [evidenceUploadQuestionId, setEvidenceUploadQuestionId] = useState<UUID | null>(null);
  const questionEvidenceFileInputRef = React.useRef<HTMLInputElement>(null);
  const [findingSignOffId, setFindingSignOffId] = useState<UUID | null>(null);
  const [findingVerifyId, setFindingVerifyId] = useState<UUID | null>(null);
  const [reportGenerating, setReportGenerating] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const {
    data: ncrs,
    refresh: refreshNcrs
  } = useAsync<QualityNcr[]>(
    async () => {
      if (!activeCompanyId || !auditId) return [];
      return await listQualityNcrs({
        companyId: activeCompanyId,
        sourceEntityType: 'audit',
        sourceEntityId: auditId as UUID,
        limit: 200
      });
    },
    [activeCompanyId, auditId]
  );

  const {
    data: capas,
    refresh: refreshCapas
  } = useAsync<CorrectiveAction[]>(
    async () => {
      if (!activeCompanyId || !auditId) return [];
      return await listCorrectiveActions({
        companyId: activeCompanyId,
        sourceType: 'audit',
        sourceId: auditId as UUID,
        limit: 200
      });
    },
    [activeCompanyId, auditId]
  );

  const { data: auditReports, refresh: refreshAuditReports } = useAsync(
    async () => {
      if (!auditId) return [];
      return await listAuditReports(auditId as UUID);
    },
    [auditId]
  );

  const { data: preSubmission, refresh: refreshPreSubmission } = useAsync(
    async () => {
      if (!auditId) return null;
      return await getPreAuditSubmission(auditId as UUID);
    },
    [auditId]
  );

  const { data: findings, refresh: refreshFindings } = useAsync(
    async () => {
      if (!activeCompanyId || !auditId) return [];
      return await listProgramAuditFindings({
        companyId: activeCompanyId,
        auditId: auditId as UUID
      });
    },
    [activeCompanyId, auditId]
  );
  const { data: linkedImprovements, refresh: refreshLinkedImprovements } = useAsync(
    async () => {
      if (!activeCompanyId || !auditId) return [];
      return await listLinkedImprovements({
        companyId: activeCompanyId,
        sourceType: 'audit',
        sourceId: auditId as UUID
      });
    },
    [activeCompanyId, auditId]
  );

  const responsesByQuestion = useMemo(() => {
    const map = new Map<UUID, AuditResponse>();
    (responses ?? []).forEach((r) => {
      map.set(r.audit_question_id, r);
    });
    return map;
  }, [responses]);

  const isAuditee = useMemo(() => {
    if (!audit || !user?.id) return false;
    const ids = (audit as any).departments_auditee_ids as UUID[] | null | undefined;
    return Array.isArray(ids) && ids.includes(user.id as UUID);
  }, [audit, user?.id]);

  const proposedDates = (audit as any)?.proposed_dates as string[] | null | undefined;
  const dateApprovalStatus = (audit as any)?.date_approval_status as string | null | undefined;
  const dateDeclineReason = (audit as any)?.date_decline_reason as string | null | undefined;
  const awaitingDateApproval = audit?.status === 'draft' && dateApprovalStatus === 'pending';
  const dateDeclined = dateApprovalStatus === 'declined';

  const requiredDocLabels = useMemo(() => {
    const list = (audit as any)?.required_document_list;
    if (!Array.isArray(list)) return [];
    return list.map((d: any) => (d && typeof d === 'object' && 'label' in d ? d.label : String(d)));
  }, [audit]);
  const uploadedByReq = useMemo(() => {
    const docs = preSubmission?.uploaded_docs ?? [];
    const m = new Map<string, { uploadedAt: string }>();
    docs.forEach((u: any) => m.set(u.requirementKey, { uploadedAt: u.uploadedAt }));
    return m;
  }, [preSubmission]);
  const documentDeadline = (audit as any)?.document_submission_deadline;
  const isPastDeadline = documentDeadline ? new Date(documentDeadline) < new Date() : false;
  const canApprovePreAudit = preSubmission?.status === 'submitted' && canEdit;
  const showPreAuditSection =
    (audit?.status === 'scheduled' || audit?.status === 'awaiting-documents' || audit?.status === 'ready-for-audit') &&
    requiredDocLabels.length > 0;

  const checklistStats = useMemo(() => {
    const total = questions?.length ?? 0;
    const answered = (responses ?? []).length;
    const compliant = (responses ?? []).filter((r) => r.is_compliant).length;
    const percentCompliant = answered > 0 ? Math.round((compliant / answered) * 100) : 0;
    return { total, answered, compliant, percentCompliant };
  }, [questions, responses]);

  async function handleStartAudit() {
    if (!audit || !activeCompanyId || !user?.id) return;
    setStatusUpdating(true);
    try {
      await startAudit(audit.id as UUID, activeCompanyId, user.id as any);
      await refreshAudit();
    } finally {
      setStatusUpdating(false);
    }
  }

  async function handleCompleteAudit() {
    if (!audit || !activeCompanyId || !user?.id) return;
    setStatusUpdating(true);
    try {
      await completeAudit(audit.id as UUID, activeCompanyId, null, user.id as any);
      await updateAuditFindingsCounts(audit.id as UUID, activeCompanyId, user.id as any);
      await refreshAudit();
    } finally {
      setStatusUpdating(false);
    }
  }

  async function handleSubmitResponse(question: AuditQuestion, partial: Partial<AuditResponse>) {
    if (!audit || !activeCompanyId || !user?.id) return;
    setSavingResponseId(question.id);
    try {
      const existing = responsesByQuestion.get(question.id);
      await submitAuditResponse({
        auditQuestionId: question.id,
        isCompliant: partial.is_compliant ?? existing?.is_compliant ?? true,
        finding: partial.finding ?? existing?.finding ?? '',
        evidenceDocumentUrl: partial.evidence_document_url ?? existing?.evidence_document_url ?? null,
        riskRating: partial.risk_rating ?? existing?.risk_rating ?? 'low',
        deviationType: (partial as any).deviation_type ?? existing?.deviation_type ?? null,
        allocatedScore: (partial as any).allocated_score ?? existing?.allocated_score ?? question.allocated_score ?? null,
        achievedScore: (partial as any).achieved_score ?? existing?.achieved_score ?? null,
        evidenceFiles: (partial as any).evidence_files ?? existing?.evidence_files ?? null,
        answeredByUserId: user.id as any
      });
      await refreshResponses();
      await updateAuditFindingsCounts(audit.id as UUID, activeCompanyId, user.id as any);
      await refreshAudit();
      await refreshFindings();
      await refreshNcrs();
      await refreshCapas();
      await refreshLinkedImprovements();
    } finally {
      setSavingResponseId(null);
    }
  }

  const loading = auditLoading || questionsLoading || responsesLoading;

  if (!auditId) {
    return (
      <Layout title="Audit not found">
        <div className="p-6">
          <p className="text-sm text-charcoal-500">No audit id provided.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Audit detail">
      <div className="max-w-6xl mx-auto px-4 py-4 space-y-4">
        <button
          type="button"
          onClick={() => navigate('/audits')}
          className="inline-flex items-center gap-2 text-sm text-charcoal-500 hover:text-charcoal-800"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back to audits
        </button>

        {auditError && (
          <div className="bg-white rounded-xl border border-critical/30 p-4 shadow-card">
            <p className="text-sm font-semibold text-critical">Unable to load audit</p>
            <p className="text-sm text-charcoal-500 mt-1">
              {(auditError as any)?.message || 'Unknown error'}
            </p>
          </div>
        )}

        {loading && (
          <div className="bg-white rounded-xl border border-surface-300 p-6 shadow-card flex items-center gap-3">
            <LoadingSpinner size={18} />
            <p className="text-sm text-charcoal-500">Loading audit details…</p>
          </div>
        )}

        {!loading && audit && (
          <>
            <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-surface-100 rounded-lg">
                    <ClipboardCheckIcon className="w-5 h-5 text-charcoal-500" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-charcoal-400">
                      {audit.audit_number} • {audit.module}
                    </p>
                    <p className="mt-1 text-base font-semibold text-charcoal">
                      {audit.title || audit.objectives || 'Program audit'}
                    </p>
                    <p className="mt-1 text-sm text-charcoal-500">
                      {audit.objectives || 'No objectives captured yet.'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge status={audit.status as any} size="sm" />
                  {audit.selected_date && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-charcoal-500">
                      <CalendarIcon className="w-4 h-4" />
                      {formatDate(audit.selected_date)}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-xs text-charcoal-500 mb-0.5">Type</p>
                  <p className="font-medium capitalize">{audit.audit_type}</p>
                </div>
                <div>
                  <p className="text-xs text-charcoal-500 mb-0.5">Scope</p>
                  <p className="font-medium">{audit.scope_of_audit || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-charcoal-500 mb-0.5">Location</p>
                  <p className="font-medium">{audit.location || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-charcoal-500 mb-0.5">Compliance</p>
                  <p className="font-medium">
                    {checklistStats.answered}/{checklistStats.total} answered • {checklistStats.percentCompliant}% compliant
                  </p>
                </div>
              </div>

              {canEdit && (
                <div className="flex flex-wrap gap-2 justify-end">
                  {audit.status === 'scheduled' && (
                    <button
                      type="button"
                      onClick={handleStartAudit}
                      disabled={statusUpdating}
                      className="px-4 py-2 rounded-lg bg-teal text-white text-xs font-semibold hover:bg-teal-600 disabled:opacity-60"
                    >
                      {statusUpdating ? 'Updating…' : 'Start audit'}
                    </button>
                  )}
                  {audit.status === 'in-progress' && (
                    <button
                      type="button"
                      onClick={handleCompleteAudit}
                      disabled={statusUpdating || (responses ?? []).length === 0}
                      className="px-4 py-2 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-navy-600 disabled:opacity-60"
                    >
                      {statusUpdating ? 'Updating…' : 'Complete audit'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {awaitingDateApproval && (
              <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card">
                <p className="text-sm font-semibold text-charcoal mb-2">Audit date approval</p>
                {dateDeclined ? (
                  <div className="space-y-2">
                    <p className="text-sm text-warning-700">The proposed date was declined.</p>
                    {dateDeclineReason && (
                      <p className="text-xs text-charcoal-600">Reason: {dateDeclineReason}</p>
                    )}
                    <p className="text-xs text-charcoal-500">Auditor may propose new dates and resend.</p>
                  </div>
                ) : isAuditee ? (
                  <div className="space-y-3">
                    <p className="text-xs text-charcoal-500">Please approve one of the proposed dates or decline with a reason.</p>
                    {Array.isArray(proposedDates) && proposedDates.length > 0 && (
                      <>
                        <div className="flex flex-wrap gap-2 items-center">
                          <select
                            value={chosenDate}
                            onChange={(e) => setChosenDate(e.target.value)}
                            className="px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm"
                          >
                            <option value="">Select a date</option>
                            {proposedDates.map((d) => (
                              <option key={d} value={d}>
                                {formatDate(d)}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={!chosenDate || !activeCompanyId || dateApprovalLoading}
                            onClick={async () => {
                              if (!activeCompanyId || !user?.id || !chosenDate) return;
                              setDateApprovalLoading(true);
                              try {
                                await approveAuditDate(audit.id as UUID, activeCompanyId, chosenDate, user.id as UUID);
                                await refreshAudit();
                              } finally {
                                setDateApprovalLoading(false);
                              }
                            }}
                            className="px-4 py-2 rounded-lg bg-teal text-white text-sm font-medium hover:bg-teal-600 disabled:opacity-60"
                          >
                            {dateApprovalLoading ? 'Updating…' : 'Approve date'}
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2 items-center pt-2 border-t border-surface-200">
                          <input
                            type="text"
                            value={declineReason}
                            onChange={(e) => setDeclineReason(e.target.value)}
                            placeholder="Reason for decline (optional)"
                            className="flex-1 min-w-[200px] px-3 py-2 border border-surface-300 rounded-lg text-sm"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              if (!activeCompanyId || !user?.id) return;
                              setDateApprovalLoading(true);
                              try {
                                await declineAuditDate(audit.id as UUID, activeCompanyId, declineReason, user.id as UUID);
                                await refreshAudit();
                              } finally {
                                setDateApprovalLoading(false);
                              }
                            }}
                            disabled={dateApprovalLoading}
                            className="px-4 py-2 rounded-lg border border-critical/50 text-critical text-sm font-medium hover:bg-critical/5 disabled:opacity-60"
                          >
                            Decline
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-charcoal-500">Awaiting date approval from the auditee.</p>
                )}
              </div>
            )}

            {showPreAuditSection && (
              <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card">
                <p className="text-sm font-semibold text-charcoal mb-2">Pre-Audit Documents</p>
                {documentDeadline && (
                  <p className="text-xs text-charcoal-500 mb-3">
                    Deadline: {formatDate(documentDeadline)}
                    {isPastDeadline && preSubmission?.status !== 'approved_for_audit' && (
                      <span className="ml-2 text-warning-600">Past deadline</span>
                    )}
                  </p>
                )}
                <ul className="space-y-2 mb-4">
                  {requiredDocLabels.map((label) => {
                    const uploaded = uploadedByReq.get(label);
                    return (
                      <li key={label} className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-charcoal-700">{label}</span>
                        {uploaded ? (
                          <span className="text-success-600 text-xs">Uploaded {formatDate(uploaded.uploadedAt)}</span>
                        ) : (
                          <button
                            type="button"
                            disabled={!activeCompanyId || !user?.id || preAuditUploadingFor !== null}
                            onClick={() => {
                              setPreAuditUploadingFor(label);
                              preAuditFileInputRef.current?.click();
                            }}
                            className="px-2 py-1 rounded border border-surface-300 text-xs font-medium hover:bg-surface-50 disabled:opacity-50"
                          >
                            {preAuditUploadingFor === label ? 'Uploading…' : 'Upload'}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <input
                  ref={preAuditFileInputRef}
                  type="file"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !activeCompanyId || !user?.id || !preAuditUploadingFor || !auditId) return;
                    setPreAuditUploadingFor(preAuditUploadingFor);
                    try {
                      const key = `${activeCompanyId}/audit_pre_submission/${auditId}/${encodeURIComponent(preAuditUploadingFor)}/${Date.now()}-${file.name}`.replace(/\s+/g, '_');
                      const { error: upErr } = await insforge.storage.from(EVIDENCE_BUCKET).upload(key, file);
                      if (upErr) throw upErr;
                      await addPreAuditUploadedDoc(
                        auditId as UUID,
                        activeCompanyId,
                        preAuditUploadingFor,
                        EVIDENCE_BUCKET,
                        key,
                        user.id as UUID
                      );
                      await refreshPreSubmission();
                    } finally {
                      setPreAuditUploadingFor(null);
                      e.target.value = '';
                    }
                  }}
                />
                <div className="flex flex-wrap gap-2">
                  {preSubmission?.status !== 'submitted' && preSubmission?.status !== 'approved_for_audit' && (
                    <button
                      type="button"
                      disabled={!activeCompanyId || !user?.id || preAuditSubmitLoading}
                      onClick={async () => {
                        if (!activeCompanyId || !user?.id) return;
                        setPreAuditSubmitLoading(true);
                        try {
                          await submitPreAuditSubmission(auditId as UUID, activeCompanyId, requiredDocLabels, user.id as UUID);
                          await refreshPreSubmission();
                          await refreshAudit();
                        } finally {
                          setPreAuditSubmitLoading(false);
                        }
                      }}
                      className="px-4 py-2 rounded-lg bg-teal text-white text-sm font-medium hover:bg-teal-600 disabled:opacity-60"
                    >
                      {preAuditSubmitLoading ? 'Submitting…' : 'Submit for audit'}
                    </button>
                  )}
                  {canApprovePreAudit && (
                    <button
                      type="button"
                      disabled={!activeCompanyId || !user?.id || preAuditSubmitLoading}
                      onClick={async () => {
                        if (!activeCompanyId || !user?.id) return;
                        setPreAuditSubmitLoading(true);
                        try {
                          await approvePreAuditSubmissionForAudit(auditId as UUID, activeCompanyId, user.id as UUID);
                          await refreshPreSubmission();
                          await refreshAudit();
                        } finally {
                          setPreAuditSubmitLoading(false);
                        }
                      }}
                      className="px-4 py-2 rounded-lg bg-navy text-white text-sm font-medium hover:bg-navy-600 disabled:opacity-60"
                    >
                      Approve for audit
                    </button>
                  )}
                </div>
                {preSubmission?.status && (
                  <p className="mt-2 text-xs text-charcoal-500">Status: {preSubmission.status.replace(/_/g, ' ')}</p>
                )}
              </div>
            )}

            <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-charcoal">Checklist & responses</p>
                  <p className="text-xs text-charcoal-500">
                    Use this list to capture compliance, findings, and risk ratings during execution.
                  </p>
                </div>

              {questionsError && (
                <div className="mb-3 bg-critical/5 border border-critical/20 rounded-xl p-3">
                  <p className="text-xs font-semibold text-critical">Could not load checklist</p>
                  <p className="text-xs text-charcoal-600 mt-0.5">
                    {(questionsError as any)?.message || 'Unknown error'}
                  </p>
                </div>
              )}
              {responsesError && (
                <div className="mb-3 bg-critical/5 border border-critical/20 rounded-xl p-3">
                  <p className="text-xs font-semibold text-critical">Could not load responses</p>
                  <p className="text-xs text-charcoal-600 mt-0.5">
                    {(responsesError as any)?.message || 'Unknown error'}
                  </p>
                </div>
              )}

              {questions && questions.length === 0 && (
                <p className="text-sm text-charcoal-500">
                  No checklist questions have been added yet. You can manage questions from the audits configuration
                  or a future checklist builder.
                </p>
              )}

              {questions && questions.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-surface-200 text-xs text-charcoal-500">
                        <th className="py-2 pr-3 text-left font-medium">#</th>
                        <th className="py-2 pr-3 text-left font-medium">Question</th>
                        <th className="py-2 pr-3 text-left font-medium">Expected evidence</th>
                        <th className="py-2 pr-3 text-left font-medium">Compliant?</th>
                        <th className="py-2 pr-3 text-left font-medium">Finding type</th>
                        <th className="py-2 pr-3 text-left font-medium">Alloc.</th>
                        <th className="py-2 pr-3 text-left font-medium">Achieved</th>
                        <th className="py-2 pr-3 text-left font-medium">Finding</th>
                        <th className="py-2 pr-3 text-left font-medium">Risk</th>
                        <th className="py-2 pr-3 text-left font-medium">Evidence</th>
                        <th className="py-2 pr-3 text-left font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {questions.map((q, idx) => {
                        const resp = responsesByQuestion.get(q.id);
                        const disabled = !canEdit || audit.status === 'completed' || audit.status === 'archived';
                        return (
                          <tr key={q.id} className="border-b border-surface-100 align-top">
                            <td className="py-2 pr-3 text-xs text-charcoal-500">{idx + 1}</td>
                            <td className="py-2 pr-3">
                              <p className="text-sm text-charcoal">{q.question}</p>
                            </td>
                            <td className="py-2 pr-3">
                              <p className="text-xs text-charcoal-500 whitespace-pre-wrap">
                                {q.expected_evidence || '—'}
                              </p>
                            </td>
                            <td className="py-2 pr-3">
                              <select
                                disabled={disabled}
                                value={resp?.is_compliant ? 'yes' : 'no'}
                                onChange={(e) =>
                                  handleSubmitResponse(q, {
                                    is_compliant: e.target.value === 'yes'
                                  } as any)
                                }
                                className="px-2 py-1 bg-white border border-surface-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-teal focus:border-transparent"
                              >
                                <option value="yes">Yes</option>
                                <option value="no">No</option>
                              </select>
                            </td>
                            <td className="py-2 pr-3">
                              <select
                                disabled={disabled}
                                value={(resp as any)?.deviation_type ?? ''}
                                onChange={(e) =>
                                  handleSubmitResponse(q, {
                                    deviation_type: e.target.value ? (e.target.value as any) : null
                                  } as any)
                                }
                                className="px-2 py-1 bg-white border border-surface-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-teal focus:border-transparent"
                              >
                                <option value="">—</option>
                                <option value="observation">Observation</option>
                                <option value="finding">Finding</option>
                                <option value="non_conformance">Non-conformance</option>
                                <option value="opportunity_for_improvement">OFI</option>
                              </select>
                            </td>
                            <td className="py-2 pr-3 text-xs text-charcoal-500">
                              {q.allocated_score ?? '—'}
                            </td>
                            <td className="py-2 pr-3">
                              <input
                                type="number"
                                min={0}
                                step={0.5}
                                disabled={disabled}
                                value={(resp as any)?.achieved_score ?? ''}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  handleSubmitResponse(q, {
                                    achieved_score: v === '' ? null : Number(v)
                                  } as any);
                                }}
                                className="w-14 px-2 py-1 bg-white border border-surface-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-teal focus:border-transparent"
                              />
                            </td>
                            <td className="py-2 pr-3">
                              <textarea
                                disabled={disabled}
                                defaultValue={resp?.finding || ''}
                                onBlur={(e) =>
                                  handleSubmitResponse(q, {
                                    finding: e.target.value
                                  } as any)
                                }
                                rows={2}
                                className="w-full px-2 py-1 bg-white border border-surface-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-teal focus:border-transparent resize-y"
                              />
                            </td>
                            <td className="py-2 pr-3">
                              <select
                                disabled={disabled}
                                value={resp?.risk_rating || 'low'}
                                onChange={(e) =>
                                  handleSubmitResponse(q, {
                                    risk_rating: e.target.value as any
                                  } as any)
                                }
                                className="px-2 py-1 bg-white border border-surface-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-teal focus:border-transparent"
                              >
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                              </select>
                            </td>
                            <td className="py-2 pr-3">
                              <div className="flex flex-col gap-1">
                                {((resp as any)?.evidence_files ?? []).map((ef: any, i: number) => (
                                  <span key={i} className="text-xs text-charcoal-500 truncate max-w-[120px]" title={ef.fileName}>{ef.fileName}</span>
                                ))}
                                {canEdit && !disabled && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEvidenceUploadQuestionId(q.id);
                                      questionEvidenceFileInputRef.current?.click();
                                    }}
                                    disabled={savingResponseId === q.id || evidenceUploadQuestionId !== null}
                                    className="text-xs text-teal font-medium hover:underline disabled:opacity-50"
                                  >
                                    {evidenceUploadQuestionId === q.id ? 'Uploading…' : 'Add evidence'}
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="py-2 pr-3">
                              <div className="flex flex-col gap-1.5">
                                <button
                                  type="button"
                                  disabled={
                                    !canEdit ||
                                    !activeCompanyId ||
                                    !user?.id ||
                                    !audit ||
                                    audit.status === 'draft'
                                  }
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setNcrLinkedQuestionId(q.id);
                                    setIsNcrModalOpen(true);
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-critical/30 text-xs font-semibold text-critical hover:bg-critical/5 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <AlertCircleIcon className="w-3 h-3" />
                                  Raise NCR
                                </button>
                                <button
                                  type="button"
                                  disabled={
                                    !canEdit ||
                                    !activeCompanyId ||
                                    !user?.id ||
                                    !audit ||
                                    !resp ||
                                    !resp.finding ||
                                    resp.finding.trim().length === 0
                                  }
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (!activeCompanyId || !user?.id || !audit || !resp) return;
                                    setRaisingFindingForQuestionId(q.id);
                                    try {
                                      const deviationType =
                                        (resp as any).deviation_type ??
                                        (!resp.is_compliant || resp.risk_rating === 'high'
                                          ? 'non_conformance'
                                          : 'finding');
                                      await createProgramAuditFinding({
                                        companyId: activeCompanyId,
                                        auditId: audit.id as UUID,
                                        auditQuestionId: q.id,
                                        title: resp.finding || q.question,
                                        deviationType: deviationType as any,
                                        riskLevel: resp.risk_rating as any,
                                        requiredAction: '',
                                        createdByUserId: user.id as any
                                      });
                                      await refreshFindings();
                                    } finally {
                                      setRaisingFindingForQuestionId(null);
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-surface-300 text-xs font-semibold text-charcoal hover:bg-surface-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {raisingFindingForQuestionId === q.id ? 'Saving…' : 'Raise finding'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <input
                ref={questionEvidenceFileInputRef}
                type="file"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file || !activeCompanyId || !user?.id || !evidenceUploadQuestionId || !auditId) return;
                  const q = questions?.find((x) => x.id === evidenceUploadQuestionId);
                  if (!q) return;
                  const existing = responsesByQuestion.get(q.id);
                  const currentFiles = (existing as any)?.evidence_files ?? [];
                  try {
                    const key = `${activeCompanyId}/audit_response/${auditId}/${q.id}/${Date.now()}-${file.name}`.replace(/\s+/g, '_');
                    const { error: upErr } = await insforge.storage.from(EVIDENCE_BUCKET).upload(key, file);
                    if (upErr) throw upErr;
                    const newFiles = [...currentFiles, { storageBucket: EVIDENCE_BUCKET, storageKey: key, fileName: file.name }];
                    await handleSubmitResponse(q, { evidence_files: newFiles } as any);
                  } finally {
                    setEvidenceUploadQuestionId(null);
                    e.target.value = '';
                  }
                }}
              />
              </div>

              <div className="border-t border-surface-200 pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-charcoal mb-2">Linked NCRs</p>
                  {(!ncrs || ncrs.length === 0) && (
                    <p className="text-xs text-charcoal-500">No NCRs raised from this audit yet.</p>
                  )}
                  {ncrs && ncrs.length > 0 && (
                    <ul className="space-y-1">
                      {ncrs.map((ncr) => (
                        <li key={ncr.id} className="text-xs text-charcoal-600 flex items-center gap-2">
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-critical/10 text-critical text-[10px] font-semibold">
                            !
                          </span>
                          <span className="font-medium">{(ncr as any).nc_number ?? ''}</span>
                          <span className="text-charcoal-400">• {ncr.title}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-charcoal mb-2">Linked CAPA / corrective actions</p>
                  {(!capas || capas.length === 0) && (
                    <p className="text-xs text-charcoal-500">No corrective actions linked to this audit yet.</p>
                  )}
                  {capas && capas.length > 0 && (
                    <ul className="space-y-1">
                      {capas.map((ca) => (
                        <li key={ca.id} className="text-xs text-charcoal-600 flex items-center gap-2">
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-navy/10 text-navy text-[10px] font-semibold">
                            CA
                          </span>
                          <span className="font-medium">{ca.title}</span>
                          <span className="text-charcoal-400">• {ca.status}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-charcoal mb-2">Program audit findings</p>
                  {(!findings || findings.length === 0) && (
                    <p className="text-xs text-charcoal-500">No findings captured yet.</p>
                  )}
                  {findings && findings.length > 0 && (
                    <ul className="space-y-1">
                      {findings.map((f: any) => (
                        <li key={f.id} className="text-xs text-charcoal-600 flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-surface-200 text-[10px] font-semibold uppercase">
                              {f.deviation_type === 'non_conformance'
                                ? 'NC'
                                : f.deviation_type === 'observation'
                                  ? 'OB'
                                  : 'FD'}
                            </span>
                            <div>
                              <span className="font-medium">{f.title}</span>
                              <span className="text-charcoal-400 ml-1">• {f.risk_level}</span>
                              <span className="text-charcoal-400 ml-1">• {f.status}</span>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-1">
                            {activeRole === 'manager' && !f.manager_signoff_user_id && f.status !== 'closed' && activeCompanyId && user?.id && (
                              <button
                                type="button"
                                disabled={findingSignOffId !== null}
                                onClick={async () => {
                                  setFindingSignOffId(f.id);
                                  try {
                                    await managerSignOffProgramAuditFinding(activeCompanyId, f.id, user.id as UUID);
                                    await refreshFindings();
                                  } finally {
                                    setFindingSignOffId(null);
                                  }
                                }}
                                className="px-2 py-1 rounded-lg border border-navy/50 text-navy text-[11px] font-semibold hover:bg-navy/5 disabled:opacity-60"
                              >
                                {findingSignOffId === f.id ? 'Signing…' : 'Sign off'}
                              </button>
                            )}
                            {canEdit && f.manager_signoff_user_id && f.status !== 'closed' && activeCompanyId && user?.id && (
                              <button
                                type="button"
                                disabled={findingVerifyId !== null}
                                onClick={async () => {
                                  setFindingVerifyId(f.id);
                                  try {
                                    await auditorVerifyAndCloseProgramAuditFinding(activeCompanyId, f.id, user.id as UUID);
                                    await refreshFindings();
                                    await refreshAudit();
                                  } finally {
                                    setFindingVerifyId(null);
                                  }
                                }}
                                className="px-2 py-1 rounded-lg border border-success/50 text-success-700 text-[11px] font-semibold hover:bg-success/5 disabled:opacity-60"
                              >
                                {findingVerifyId === f.id ? 'Closing…' : 'Verify & close'}
                              </button>
                            )}
                            {canEdit && activeCompanyId && user?.id && (
                              <button
                                type="button"
                                disabled={creatingTaskForFindingId === f.id}
                                onClick={async () => {
                                  if (!activeCompanyId || !user?.id || !audit) return;
                                  setCreatingTaskForFindingId(f.id);
                                  try {
                                    await createTask({
                                      companyId: activeCompanyId,
                                      module: audit.module,
                                      title: `Audit finding: ${f.title}`,
                                      description: `Deviation: ${f.deviation_type ?? ''} • Risk: ${f.risk_level ?? ''}`,
                                      category: 'audit_action',
                                      riskLevel: f.risk_level as any,
                                      priority:
                                        f.risk_level === 'critical'
                                          ? 'critical'
                                          : f.risk_level === 'high'
                                            ? 'high'
                                            : f.risk_level === 'medium'
                                              ? 'medium'
                                              : 'low',
                                      dueAt: f.due_date ? new Date(f.due_date).toISOString() : undefined,
                                      sourceEntityType: 'audit_finding',
                                      sourceEntityId: f.id as UUID,
                                      createdByUserId: user.id as any
                                    });
                                  } finally {
                                    setCreatingTaskForFindingId(null);
                                  }
                                }}
                                className="px-2 py-1 rounded-lg border border-surface-300 text-[11px] font-semibold text-charcoal hover:bg-surface-50 disabled:opacity-60 disabled:cursor-not-allowed"
                              >
                                {creatingTaskForFindingId === f.id ? 'Creating…' : 'Create task'}
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-charcoal mb-2">Linked Improvements</p>
                  {(!linkedImprovements || linkedImprovements.length === 0) && (
                    <p className="text-xs text-charcoal-500">No linked improvements yet.</p>
                  )}
                  {linkedImprovements && linkedImprovements.length > 0 && (
                    <ul className="space-y-1">
                      {linkedImprovements.map((imp: any) => (
                        <li key={imp.id} className="text-xs text-charcoal-600">
                          <span className="font-medium">{imp.reference_number}</span>
                          <span className="text-charcoal-400 ml-1">• {imp.status}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-charcoal">Audit report & attachments</p>
                  <p className="text-xs text-charcoal-500">
                    Generate a structured audit report (view/print HTML, export JSON) or upload evidence.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {canEdit && activeCompanyId && user?.id && (
                    <button
                      type="button"
                      disabled={reportGenerating}
                      onClick={async () => {
                        setReportGenerating(true);
                        try {
                          await generateAuditReport(audit.id as UUID, activeCompanyId, user.id as UUID);
                          await refreshAuditReports();
                        } finally {
                          setReportGenerating(false);
                        }
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-navy-600 disabled:opacity-60"
                    >
                      {reportGenerating ? 'Generating…' : 'Generate report'}
                    </button>
                  )}
                  {auditReports && auditReports.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          const report = auditReports[0];
                          const html = renderReportAsHtml(report);
                          const w = window.open('', '_blank');
                          if (w) {
                            w.document.write(html);
                            w.document.close();
                          }
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-surface-300 text-xs font-medium text-charcoal hover:bg-surface-50"
                      >
                        View report
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const report = auditReports[0];
                          const blob = new Blob([JSON.stringify(report.generated_report_data, null, 2)], {
                            type: 'application/json'
                          });
                          downloadFile(blob, `audit-report-${audit.audit_number}.json`);
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-surface-300 text-xs font-medium text-charcoal hover:bg-surface-50"
                      >
                        Export JSON
                      </button>
                    </>
                  )}
                  {audit.report_document_url && (
                    <button
                      type="button"
                      onClick={async () => {
                        const blob = await exportAuditPDF(audit, {
                          companyName: organisationName,
                          generatedBy: fullName,
                        });
                        downloadFile(blob, `audit-${audit.audit_number}.pdf`);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-surface-300 text-xs font-medium text-charcoal hover:bg-surface-50"
                    >
                      <DownloadIcon className="w-3.5 h-3.5" />
                      Download PDF
                    </button>
                  )}
                  {canEdit && activeCompanyId && user?.id && (
                    <button
                      type="button"
                      onClick={() => setEvidenceOpen(true)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal text-white text-xs font-semibold hover:bg-teal-600"
                    >
                      <FileTextIcon className="w-3.5 h-3.5" />
                      Evidence
                    </button>
                  )}
                </div>
              </div>
              {audit.status === 'completed' && canEdit && activeCompanyId && user?.id && (
                <button
                  type="button"
                  disabled={archiving}
                  onClick={async () => {
                    setArchiving(true);
                    try {
                      await updateAudit(audit.id as UUID, activeCompanyId, { status: 'archived' }, user.id as UUID);
                      await refreshAudit();
                    } finally {
                      setArchiving(false);
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg border border-charcoal-300 text-xs font-medium text-charcoal-600 hover:bg-charcoal-50"
                >
                  {archiving ? 'Archiving…' : 'Archive audit'}
                </button>
              )}
              {audit.report_document_url ? (
                <p className="text-xs text-charcoal-500">
                  Report submitted on {audit.report_submitted_at ? new Date(audit.report_submitted_at).toLocaleString('en-ZA') : '—'}.
                </p>
              ) : auditReports?.length === 0 && (
                <p className="text-xs text-charcoal-500">
                  Generate a report to view or export. No report has been generated yet.
                </p>
              )}
            </div>
          </>
        )}
      </div>
      {isNcrModalOpen && activeCompanyId && user?.id && audit && (
        <NcrCreateModal
          open={isNcrModalOpen}
          onClose={() => {
            setIsNcrModalOpen(false);
            setNcrLinkedQuestionId(null);
          }}
          companyId={activeCompanyId}
          createdByUserId={user.id as any}
          defaultModule={audit.module}
          linkedSource={{
            type: 'audit',
            id: audit.id as string
          }}
          onCreated={async () => {
            setIsNcrModalOpen(false);
            setNcrLinkedQuestionId(null);
            await refreshNcrs();
          }}
        />
      )}
      {evidenceOpen && activeCompanyId && user?.id && audit && (
        <EvidenceModal
          open={evidenceOpen}
          onClose={() => setEvidenceOpen(false)}
          companyId={activeCompanyId}
          actorUserId={user.id as any}
          entityType="audit"
          entityId={audit.id as UUID}
          title="Audit evidence"
        />
      )}
    </Layout>
  );
}
