import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeftIcon,
  CalendarIcon,
  ClipboardCheckIcon,
  AlertCircleIcon,
  CheckCircleIcon
} from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import type {
  Inspection,
  InspectionRun,
  InspectionRunItem,
  InspectionRunComplianceStatus,
  QualityNcr
} from '../api/models/entities';
import type { UUID } from '../api/models/core';
import {
  completeInspectionRun,
  getInspectionById,
  getInspectionRunById,
  updateInspectionRunItem
} from '../api/services/inspectionsService';
import { listQualityNcrs } from '../api/services/qualityNcrsService';
import { listCorrectiveActions, type CorrectiveAction } from '../api/services/correctiveActionsService';
import { StatusBadge } from '../components/ui/StatusBadge';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { useUser } from '@insforge/react';
import { EvidenceModal } from '../components/evidence/EvidenceModal';

type RunWithItems = { run: InspectionRun; items: InspectionRunItem[] };

export function InspectionDetailPage() {
  const { inspectionId } = useParams<{ inspectionId: string }>();
  const navigate = useNavigate();
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();

  const canEditBase =
    activeRole === 'admin' ||
    activeRole === 'manager' ||
    activeRole === 'supervisor' ||
    activeRole === 'consultant';
  const isAuditee = activeRole === 'employee';
  const isManager = activeRole === 'manager';
  const isAuditor = activeRole === 'auditor';
  const canScore = canEditBase || isAuditor;

  const {
    data: inspection,
    loading: inspectionLoading,
    error: inspectionError
  } = useAsync<Inspection | null>(
    async () => {
      if (!activeCompanyId || !inspectionId) return null;
      return await getInspectionById(activeCompanyId as UUID, inspectionId as unknown as UUID);
    },
    [activeCompanyId, inspectionId]
  );

  const {
    data: latestRun,
    loading: runLoading,
    error: runError,
    refresh: refreshRun
  } = useAsync<RunWithItems | null>(
    async () => {
      if (!activeCompanyId || !inspectionId) return null;
      // For now, assume single run per inspection and load by inspection id via a simple query
      const { data: runData, error } = await (await import('../api/insforge/client')).insforge.database
        .from('inspection_runs')
        .select('*')
        .eq('company_id', activeCompanyId)
        .eq('inspection_id', inspectionId)
        .order('run_number', { ascending: false })
        .limit(1);
      if (error) {
        // eslint-disable-next-line no-throw-literal
        throw new Error((await import('../api/insforge/errors')).getErrorMessage(error));
      }
      const r = (runData ?? [])[0] as InspectionRun | undefined;
      if (!r) return null;
      const runWithItems = await getInspectionRunById(activeCompanyId as UUID, r.id as UUID);
      return runWithItems;
    },
    [activeCompanyId, inspectionId]
  );

  const {
    data: ncrs
  } = useAsync<QualityNcr[]>(
    async () => {
      if (!activeCompanyId || !inspectionId) return [];
      return await listQualityNcrs({
        companyId: activeCompanyId as UUID,
        sourceEntityType: 'inspection',
        sourceEntityId: inspectionId as unknown as UUID,
        limit: 200
      });
    },
    [activeCompanyId, inspectionId]
  );

  const {
    data: capas
  } = useAsync<CorrectiveAction[]>(
    async () => {
      if (!activeCompanyId || !inspectionId) return [];
      // Corrective actions are linked to NCRs, not inspections directly; we show NCR-level CAPA in tab.
      const allNcrs =
        (await listQualityNcrs({
          companyId: activeCompanyId as UUID,
          sourceEntityType: 'inspection',
          sourceEntityId: inspectionId as unknown as UUID,
          limit: 200
        })) ?? [];
      const actions: CorrectiveAction[] = [];
      for (const ncr of allNcrs) {
        const list = await listCorrectiveActions({
          companyId: activeCompanyId as UUID,
          sourceType: 'ncr',
          sourceId: ncr.id as UUID,
          limit: 50
        });
        actions.push(...list);
      }
      return actions;
    },
    [activeCompanyId, inspectionId]
  );

  const [activeTab, setActiveTab] = useState<'checklist' | 'ncrs' | 'capa' | 'history'>('checklist');
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [completingRun, setCompletingRun] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [evidenceItemId, setEvidenceItemId] = useState<string | null>(null);

  const checklistStats = useMemo(() => {
    if (!latestRun) return { total: 0, nc: 0, completed: 0 };
    const total = latestRun.items.length;
    const nc = latestRun.items.filter((i) => i.compliance_status === 'NC').length;
    const completed = latestRun.items.filter((i) => i.compliance_status !== 'C').length;
    return { total, nc, completed };
  }, [latestRun]);

  async function handleUpdateItem(
    item: InspectionRunItem,
    patch: Partial<Pick<InspectionRunItem, 'compliance_status' | 'comments' | 'inspection_rating' | 'risk_level'>>
  ) {
    if (!activeCompanyId) return;
    setSavingItemId(item.id as string);
    try {
      await updateInspectionRunItem(activeCompanyId as UUID, item.id as UUID, {
        compliance_status: patch.compliance_status as InspectionRunComplianceStatus | undefined,
        inspection_rating: patch.inspection_rating as any,
        risk_level: patch.risk_level as any,
        comments: patch.comments ?? item.comments
      });
      await refreshRun();
    } finally {
      setSavingItemId(null);
    }
  }

  async function handleOpenItemEvidence(item: InspectionRunItem) {
    if (!activeCompanyId || !user?.id) return;
    setEvidenceItemId(item.id as string);
    setEvidenceOpen(true);
  }

  async function handleAuditeeSubmitClosure(item: InspectionRunItem) {
    if (!activeCompanyId || !user?.id) return;
    setSavingItemId(item.id as string);
    try {
      const now = new Date().toISOString();
      await updateInspectionRunItem(activeCompanyId as UUID, item.id as UUID, {
        status: 'under-review',
        closure_requested_at: now,
        closure_evidence_submitted_at: now
      } as any);
      await refreshRun();
    } finally {
      setSavingItemId(null);
    }
  }

  async function handleManagerSignOff(item: InspectionRunItem) {
    if (!activeCompanyId || !user?.id) return;
    setSavingItemId(item.id as string);
    try {
      const now = new Date().toISOString();
      await updateInspectionRunItem(activeCompanyId as UUID, item.id as UUID, {
        status: 'approved',
        manager_approved_by_user_id: user.id as UUID,
        manager_approved_at: now
      } as any);
      await refreshRun();
    } finally {
      setSavingItemId(null);
    }
  }

  async function handleAuditorVerifyAndClose(item: InspectionRunItem) {
    if (!activeCompanyId || !user?.id) return;
    setSavingItemId(item.id as string);
    try {
      const now = new Date().toISOString();
      await updateInspectionRunItem(activeCompanyId as UUID, item.id as UUID, {
        status: 'closed',
        auditor_verified_by_user_id: user.id as UUID,
        auditor_verified_at: now
      } as any);
      await refreshRun();
    } finally {
      setSavingItemId(null);
    }
  }

  async function handleCompleteRun() {
    if (!activeCompanyId || !latestRun || !user?.id) return;
    setCompletingRun(true);
    try {
      await completeInspectionRun({
        companyId: activeCompanyId as UUID,
        runId: latestRun.run.id as UUID,
        actorUserId: user.id as UUID
      });
      await refreshRun();
    } finally {
      setCompletingRun(false);
    }
  }

  const loading = inspectionLoading || runLoading;

  if (!inspectionId) {
    return (
      <Layout title="Inspection not found">
        <div className="p-6">
          <p className="text-sm text-charcoal-500">No inspection id provided.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Inspection detail">
      <div className="max-w-6xl mx-auto px-4 py-4 space-y-4">
        <button
          type="button"
          onClick={() => navigate('/inspections')}
          className="inline-flex items-center gap-2 text-sm text-charcoal-500 hover:text-charcoal-800"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back to inspections
        </button>

        {inspectionError && (
          <div className="bg-white rounded-xl border border-critical/30 p-4 shadow-card">
            <p className="text-sm font-semibold text-critical">Unable to load inspection</p>
            <p className="text-sm text-charcoal-500 mt-1">{inspectionError.message}</p>
          </div>
        )}

        {loading && (
          <div className="bg-white rounded-xl border border-surface-300 p-6 shadow-card flex items-center gap-3">
            <LoadingSpinner size={18} />
            <p className="text-sm text-charcoal-500">Loading inspection details…</p>
          </div>
        )}

        {!loading && inspection && (
          <>
            <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-surface-100 rounded-lg">
                    <ClipboardCheckIcon className="w-5 h-5 text-charcoal-500" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-charcoal-400">
                      {inspection.module} • {inspection.id}
                    </p>
                    <p className="mt-1 text-base font-semibold text-charcoal">
                      {inspection.title || 'Inspection'}
                    </p>
                    <p className="mt-1 text-sm text-charcoal-500">
                      {inspection.location || 'No location specified.'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge status={inspection.status as any} size="sm" />
                  <span className="inline-flex items-center gap-1.5 text-xs text-charcoal-500">
                    <CalendarIcon className="w-4 h-4" />
                    {inspection.scheduled_at
                      ? new Date(inspection.scheduled_at).toLocaleDateString('en-ZA')
                      : new Date(inspection.created_at).toLocaleDateString('en-ZA')}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-xs text-charcoal-500 mb-0.5">Checklist items</p>
                  <p className="font-medium">
                    {checklistStats.total} total • {checklistStats.nc} NC
                  </p>
                </div>
                <div>
                  <p className="text-xs text-charcoal-500 mb-0.5">Findings</p>
                  <p className="font-medium">{inspection.findings_count ?? 0}</p>
                </div>
                <div>
                  <p className="text-xs text-charcoal-500 mb-0.5">Non-conformances</p>
                  <p className="font-medium">{inspection.nonconformances_count ?? 0}</p>
                </div>
                <div>
                  <p className="text-xs text-charcoal-500 mb-0.5">Assigned to</p>
                  <p className="font-medium">
                    {inspection.assignee_user_id ? 'Assigned' : 'Unassigned'}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card space-y-4">
              <div className="flex items-center justify-between border-b border-surface-200 pb-2">
                <div className="flex items-center gap-4 text-sm">
                  <button
                    type="button"
                    onClick={() => setActiveTab('checklist')}
                    className={`pb-1 border-b-2 ${
                      activeTab === 'checklist'
                        ? 'border-teal text-teal font-semibold'
                        : 'border-transparent text-charcoal-500'
                    }`}
                  >
                    Checklist
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('ncrs')}
                    className={`pb-1 border-b-2 ${
                      activeTab === 'ncrs'
                        ? 'border-teal text-teal font-semibold'
                        : 'border-transparent text-charcoal-500'
                    }`}
                  >
                    NCRs
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('capa')}
                    className={`pb-1 border-b-2 ${
                      activeTab === 'capa'
                        ? 'border-teal text-teal font-semibold'
                        : 'border-transparent text-charcoal-500'
                    }`}
                  >
                    CAPA
                  </button>
                </div>
                {activeTab === 'checklist' && latestRun && (
                  <button
                    type="button"
                    onClick={() => void handleCompleteRun()}
                    disabled={completingRun || latestRun.run.status === 'completed'}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-xs font-semibold hover:bg-teal-600 disabled:opacity-60"
                  >
                    {completingRun ? (
                      <LoadingSpinner size={14} />
                    ) : (
                      <CheckCircleIcon className="w-4 h-4" />
                    )}
                    {latestRun.run.status === 'completed'
                      ? 'Run completed'
                      : 'Complete run & auto-create NCRs'}
                  </button>
                )}
              </div>

              {activeTab === 'checklist' && (
                <>
                  {runError && (
                    <div className="mb-3 bg-critical/5 border border-critical/20 rounded-xl p-3">
                      <p className="text-xs font-semibold text-critical">Could not load checklist run</p>
                      <p className="text-xs text-charcoal-600 mt-0.5">
                        {runError.message || 'Unknown error'}
                      </p>
                    </div>
                  )}
                  {!latestRun && (
                    <p className="text-sm text-charcoal-500">
                      No checklist run found for this inspection yet. Runs are created when scheduling
                      an inspection from a template.
                    </p>
                  )}
                  {latestRun && (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b border-surface-200 text-xs text-charcoal-500">
                            <th className="py-2 pr-3 text-left font-medium">#</th>
                            <th className="py-2 pr-3 text-left font-medium">Section</th>
                            <th className="py-2 pr-3 text-left font-medium">Question</th>
                            <th className="py-2 pr-3 text-left font-medium">Expected evidence</th>
                            <th className="py-2 pr-3 text-left font-medium">Rating</th>
                            <th className="py-2 pr-3 text-left font-medium">Risk</th>
                            <th className="py-2 pr-3 text-left font-medium">Comments</th>
                            <th className="py-2 pr-3 text-left font-medium">Evidence</th>
                            <th className="py-2 pr-3 text-left font-medium">NC / NCR</th>
                          </tr>
                        </thead>
                        <tbody>
                          {latestRun.items.map((item, idx) => (
                            <tr key={item.id} className="border-b border-surface-100 align-top">
                              <td className="py-2 pr-3 text-xs text-charcoal-500">{idx + 1}</td>
                              <td className="py-2 pr-3 text-xs text-charcoal-500">
                                {item.section || '—'}
                              </td>
                              <td className="py-2 pr-3">
                                <p className="text-sm text-charcoal">{item.question}</p>
                              </td>
                              <td className="py-2 pr-3">
                                <p className="text-xs text-charcoal-500 whitespace-pre-wrap">
                                  {item.expected_evidence || '—'}
                                </p>
                              </td>
                              <td className="py-2 pr-3">
                                <select
                                  disabled={!canScore || latestRun.run.status === 'completed'}
                                  value={item.inspection_rating ?? 'C'}
                                  onChange={(e) =>
                                    void handleUpdateItem(item, {
                                      inspection_rating: e.target.value as any
                                    })
                                  }
                                  className="px-2 py-1 bg-white border border-surface-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-teal focus:border-transparent"
                                >
                                  <option value="C">Compliant (C)</option>
                                  <option value="PC">Partially Compliant (PC)</option>
                                  <option value="NC">Non-Compliant (NC)</option>
                                </select>
                              </td>
                              <td className="py-2 pr-3">
                                <select
                                  disabled={!canScore || latestRun.run.status === 'completed'}
                                  value={item.risk_level ?? ''}
                                  onChange={(e) =>
                                    void handleUpdateItem(item, {
                                      risk_level: (e.target.value || null) as any
                                    })
                                  }
                                  className="px-2 py-1 bg-white border border-surface-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-teal focus:border-transparent"
                                >
                                  <option value="">Risk level</option>
                                  <option value="low">Low</option>
                                  <option value="medium">Medium</option>
                                  <option value="high">High</option>
                                </select>
                              </td>
                              <td className="py-2 pr-3">
                                <textarea
                                  disabled={(!canScore && !isAuditee) || latestRun.run.status === 'completed'}
                                  defaultValue={item.comments || ''}
                                  onBlur={(e) =>
                                    void handleUpdateItem(item, {
                                      comments: e.target.value
                                    })
                                  }
                                  rows={2}
                                  className="w-full px-2 py-1 bg-white border border-surface-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-teal focus:border-transparent resize-y"
                                />
                              </td>
                              <td className="py-2 pr-3 text-xs">
                                <button
                                  type="button"
                                  onClick={() => void handleOpenItemEvidence(item as any as RunItemModel)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-surface-300 text-xs text-charcoal-600 hover:bg-surface-50"
                                >
                                  Evidence
                                </button>
                              </td>
                              <td className="py-2 pr-3 text-xs">
                                <div className="flex flex-col gap-1">
                                  {item.compliance_status === 'NC' || item.inspection_rating === 'NC' ? (
                                    <span className="inline-flex items-center gap-1 text-critical">
                                      <AlertCircleIcon className="w-4 h-4" />
                                      {item.auto_ncr_id ? 'NCR created' : 'Will create NCR on complete'}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-success">
                                      <CheckCircleIcon className="w-4 h-4" />
                                      OK
                                    </span>
                                  )}
                                  <span className="inline-flex items-center gap-1 text-[11px] text-charcoal-500">
                                    Status: {item.status}
                                  </span>
                                  {isAuditee && item.status !== 'closed' && (
                                    <button
                                      type="button"
                                      disabled={savingItemId === String(item.id)}
                                      onClick={() => void handleAuditeeSubmitClosure(item)}
                                      className="mt-1 px-2 py-0.5 rounded-lg border border-surface-300 text-[11px] text-charcoal-700 hover:bg-surface-50"
                                    >
                                      Submit closure
                                    </button>
                                  )}
                                  {isManager && item.status === 'under-review' && (
                                    <button
                                      type="button"
                                      disabled={savingItemId === String(item.id)}
                                      onClick={() => void handleManagerSignOff(item)}
                                      className="mt-1 px-2 py-0.5 rounded-lg border border-navy/50 text-[11px] text-navy hover:bg-navy/5"
                                    >
                                      Manager sign-off
                                    </button>
                                  )}
                                  {(canScore || isAuditor) && item.status === 'approved' && (
                                    <button
                                      type="button"
                                      disabled={savingItemId === String(item.id)}
                                      onClick={() => void handleAuditorVerifyAndClose(item)}
                                      className="mt-1 px-2 py-0.5 rounded-lg border border-teal text-[11px] text-teal hover:bg-teal/5"
                                    >
                                      Verify & close
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}

              {activeTab === 'ncrs' && (
                <div className="space-y-2">
                  {(!ncrs || ncrs.length === 0) && (
                    <p className="text-sm text-charcoal-500">
                      No NCRs raised from this inspection yet. When you complete a run, NC items will
                      auto-create NCRs.
                    </p>
                  )}
                  {ncrs &&
                    ncrs.map((ncr) => (
                      <div
                        key={ncr.id}
                        className="flex items-center justify-between border border-surface-200 rounded-lg px-3 py-2 text-xs"
                      >
                        <div className="flex flex-col">
                          <span className="font-semibold">
                            {(ncr as any).nc_number ?? 'NCR'} • {ncr.severity}
                          </span>
                          <span className="text-charcoal-600">{ncr.title}</span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-surface-100 text-[11px] font-medium text-charcoal-600">
                          {ncr.status}
                        </span>
                      </div>
                    ))}
                </div>
              )}

              {activeTab === 'capa' && (
                <div className="space-y-2">
                  {(!capas || capas.length === 0) && (
                    <p className="text-sm text-charcoal-500">
                      No corrective actions linked to NCRs from this inspection yet.
                    </p>
                  )}
                  {capas &&
                    capas.map((ca) => (
                      <div
                        key={ca.id}
                        className="flex items-center justify-between border border-surface-200 rounded-lg px-3 py-2 text-xs"
                      >
                        <div className="flex flex-col">
                          <span className="font-semibold">{ca.title}</span>
                          <span className="text-charcoal-600">{ca.description ?? ''}</span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-surface-100 text-[11px] font-medium text-charcoal-600">
                          {ca.status}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {inspection && activeCompanyId && user?.id && (
              <EvidenceModal
                open={evidenceOpen}
                onClose={() => {
                  setEvidenceOpen(false);
                  setEvidenceItemId(null);
                }}
                companyId={activeCompanyId as UUID}
                actorUserId={user.id as UUID}
                entityType={evidenceItemId ? 'inspection-item' : 'inspection'}
                entityId={(evidenceItemId as unknown as UUID) || (inspection.id as UUID)}
                title={evidenceItemId ? 'Checklist item evidence' : 'Inspection evidence'}
              />
            )}
          </>
        )}
      </div>
    </Layout>
  );
}

