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
  type AuditQuestion,
  type AuditResponse
} from '../api/services/auditsService';
import { listQualityNcrs } from '../api/services/qualityNcrsService';
import { listCorrectiveActions, createCorrectiveAction, type CorrectiveAction } from '../api/services/correctiveActionsService';
import { useUser } from '@insforge/react';
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

  const responsesByQuestion = useMemo(() => {
    const map = new Map<UUID, AuditResponse>();
    (responses ?? []).forEach((r) => {
      map.set(r.audit_question_id, r);
    });
    return map;
  }, [responses]);

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
        answeredByUserId: user.id as any
      });
      await refreshResponses();
      await updateAuditFindingsCounts(audit.id as UUID, activeCompanyId, user.id as any);
      await refreshAudit();
      await refreshNcrs();
      await refreshCapas();
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
                        <th className="py-2 pr-3 text-left font-medium">Finding</th>
                        <th className="py-2 pr-3 text-left font-medium">Risk</th>
                        <th className="py-2 pr-3 text-left font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {questions.map((q, idx) => {
                        const resp = responsesByQuestion.get(q.id);
                        const disabled = !canEdit || audit.status === 'completed' || audit.status === 'reported';
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
                              <button
                                type="button"
                                disabled={
                                  !canEdit ||
                                  !activeCompanyId ||
                                  !user?.id ||
                                  !audit ||
                                  audit.status === 'planned'
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
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
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
              </div>
            </div>

            <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-charcoal">Audit report & attachments</p>
                  <p className="text-xs text-charcoal-500">
                    Upload or generate a formal audit report and attach supporting evidence.
                  </p>
                </div>
                <div className="flex items-center gap-2">
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
                      Download report
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
              {audit.report_document_url ? (
                <p className="text-xs text-charcoal-500">
                  Report submitted on {audit.report_submitted_at ? new Date(audit.report_submitted_at).toLocaleString('en-ZA') : '—'}.
                </p>
              ) : (
                <p className="text-xs text-critical-600 flex items-center gap-1">
                  <AlertCircleIcon className="w-3.5 h-3.5" />
                  No report has been submitted for this audit yet.
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

