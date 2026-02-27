import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftIcon, CalendarIcon, ClipboardCheckIcon, AlertCircleIcon, CheckCircleIcon } from 'lucide-react';
import { useUser } from '@insforge/react';
import { Layout } from '../components/layout/Layout';
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import type { Inspection, InspectionRun, InspectionRunItem, QualityNcr, UserProfile } from '../api/models/entities';
import type { UUID } from '../api/models/core';
import {
  completeInspectionRun,
  getInspectionById,
  getInspectionRunById,
  submitAuditeeSelfAssessment,
  syncInspectionItemsFromNcrStatus,
  updateInspectionRunItem
} from '../api/services/inspectionsService';
import { listQualityNcrs } from '../api/services/qualityNcrsService';
import { listCorrectiveActions, type CorrectiveAction } from '../api/services/correctiveActionsService';
import { listUserProfiles } from '../api/services/profilesService';
import { StatusBadge } from '../components/ui/StatusBadge';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EvidenceModal } from '../components/evidence/EvidenceModal';

type RunWithItems = { run: InspectionRun; items: InspectionRunItem[] };

export function InspectionDetailPage() {
  const { inspectionId } = useParams<{ inspectionId: string }>();
  const navigate = useNavigate();
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();

  const canEditBase = activeRole === 'admin' || activeRole === 'manager' || activeRole === 'supervisor' || activeRole === 'consultant';
  const isAuditee = activeRole === 'employee';
  const isManager = activeRole === 'manager';
  const isAuditor = activeRole === 'auditor';
  const canScore = canEditBase || isAuditor;

  const { data: inspection, loading: inspectionLoading, error: inspectionError } = useAsync<Inspection | null>(
    async () => {
      if (!activeCompanyId || !inspectionId) return null;
      return await getInspectionById(activeCompanyId as UUID, inspectionId as unknown as UUID);
    },
    [activeCompanyId, inspectionId]
  );

  const { data: latestRun, loading: runLoading, error: runError, refresh: refreshRun } = useAsync<RunWithItems | null>(
    async () => {
      if (!activeCompanyId || !inspectionId) return null;
      const { insforge } = await import('../api/insforge/client');
      const { getErrorMessage } = await import('../api/insforge/errors');
      const { data: runData, error } = await insforge.database
        .from('inspection_runs')
        .select('*')
        .eq('company_id', activeCompanyId)
        .eq('inspection_id', inspectionId)
        .order('run_number', { ascending: false })
        .limit(1);
      if (error) throw new Error(getErrorMessage(error));
      const run = (runData ?? [])[0] as InspectionRun | undefined;
      if (!run) return null;
      await syncInspectionItemsFromNcrStatus(activeCompanyId as UUID, run.id as UUID);
      return await getInspectionRunById(activeCompanyId as UUID, run.id as UUID);
    },
    [activeCompanyId, inspectionId]
  );

  const { data: userProfiles } = useAsync<UserProfile[]>(
    async () => (activeCompanyId ? await listUserProfiles(activeCompanyId as UUID) : []),
    [activeCompanyId]
  );

  const { data: ncrs } = useAsync<QualityNcr[]>(
    async () => {
      if (!activeCompanyId || !latestRun) return [];
      const ncrIds = Array.from(new Set((latestRun.items ?? []).map((i) => i.auto_ncr_id).filter(Boolean))) as UUID[];
      if (ncrIds.length === 0) return [];
      const all = await listQualityNcrs({ companyId: activeCompanyId as UUID, limit: 500 });
      return all.filter((n) => ncrIds.includes(n.id));
    },
    [activeCompanyId, latestRun?.run?.id]
  );

  const { data: capas } = useAsync<CorrectiveAction[]>(
    async () => {
      if (!activeCompanyId || !ncrs) return [];
      const actions: CorrectiveAction[] = [];
      for (const ncr of ncrs) {
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
    [activeCompanyId, ncrs?.length]
  );

  const [activeTab, setActiveTab] = useState<'checklist' | 'ncrs' | 'capa'>('checklist');
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [completingRun, setCompletingRun] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [evidenceItemId, setEvidenceItemId] = useState<string | null>(null);

  const checklistStats = useMemo(() => {
    if (!latestRun) return { total: 0, nc: 0 };
    const total = latestRun.items.length;
    const nc = latestRun.items.filter((i) => i.inspection_rating === 'NC').length;
    return { total, nc };
  }, [latestRun]);

  async function handleUpdateItem(item: InspectionRunItem, patch: Record<string, unknown>) {
    if (!activeCompanyId) return;
    setSavingItemId(String(item.id));
    try {
      await updateInspectionRunItem(activeCompanyId as UUID, item.id as UUID, patch as any);
      await refreshRun();
    } finally {
      setSavingItemId(null);
    }
  }

  async function handleCompleteRun() {
    if (!activeCompanyId || !latestRun || !user?.id) return;
    setCompletingRun(true);
    try {
      await completeInspectionRun({ companyId: activeCompanyId as UUID, runId: latestRun.run.id as UUID, actorUserId: user.id as UUID });
      await refreshRun();
    } finally {
      setCompletingRun(false);
    }
  }

  async function handleSubmitSelfAssessment() {
    if (!activeCompanyId || !latestRun || !user?.id) return;
    await submitAuditeeSelfAssessment({ companyId: activeCompanyId as UUID, runId: latestRun.run.id as UUID, actorUserId: user.id as UUID });
    await refreshRun();
  }

  const loading = inspectionLoading || runLoading;
  if (!inspectionId) return <Layout title="Inspection not found"><div className="p-6 text-sm text-charcoal-500">No inspection id provided.</div></Layout>;

  return (
    <Layout title="Inspection detail">
      <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">
        <button type="button" onClick={() => navigate('/inspections')} className="inline-flex items-center gap-2 text-sm text-charcoal-500 hover:text-charcoal-800">
          <ArrowLeftIcon className="w-4 h-4" />Back to inspections
        </button>

        {inspectionError && <div className="bg-white rounded-xl border border-critical/30 p-4 text-sm text-critical">{inspectionError.message}</div>}
        {loading && <div className="bg-white rounded-xl border border-surface-300 p-4 flex items-center gap-2"><LoadingSpinner size={16} /><span className="text-sm text-charcoal-500">Loading inspection details...</span></div>}

        {!loading && inspection && (
          <>
            <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-surface-100 rounded-lg"><ClipboardCheckIcon className="w-5 h-5 text-charcoal-500" /></div>
                  <div>
                    <p className="text-xs font-medium text-charcoal-400">{inspection.module} - {inspection.id}</p>
                    <p className="mt-1 text-base font-semibold text-charcoal">{inspection.title || 'Inspection'}</p>
                    <p className="mt-1 text-sm text-charcoal-500">{inspection.location || 'No location specified.'}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge status={inspection.status as any} size="sm" />
                  <span className="inline-flex items-center gap-1.5 text-xs text-charcoal-500">
                    <CalendarIcon className="w-4 h-4" />{inspection.scheduled_at ? new Date(inspection.scheduled_at).toLocaleDateString('en-ZA') : new Date(inspection.created_at).toLocaleDateString('en-ZA')}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                <div><p className="text-xs text-charcoal-500">Checklist items</p><p className="font-medium">{checklistStats.total}</p></div>
                <div><p className="text-xs text-charcoal-500">NC items</p><p className="font-medium text-critical">{checklistStats.nc}</p></div>
                <div><p className="text-xs text-charcoal-500">Sector/Frequency</p><p className="font-medium">{inspection.sector || '-'} / {inspection.frequency || '-'}</p></div>
                <div><p className="text-xs text-charcoal-500">Findings / NC</p><p className="font-medium">{inspection.findings_count ?? 0} / {inspection.nonconformances_count ?? 0}</p></div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card space-y-4">
              <div className="flex items-center justify-between border-b border-surface-200 pb-2">
                <div className="flex items-center gap-4 text-sm">
                  <button type="button" onClick={() => setActiveTab('checklist')} className={activeTab === 'checklist' ? 'pb-1 border-b-2 border-teal text-teal font-semibold' : 'pb-1 border-b-2 border-transparent text-charcoal-500'}>Checklist</button>
                  <button type="button" onClick={() => setActiveTab('ncrs')} className={activeTab === 'ncrs' ? 'pb-1 border-b-2 border-teal text-teal font-semibold' : 'pb-1 border-b-2 border-transparent text-charcoal-500'}>NCRs</button>
                  <button type="button" onClick={() => setActiveTab('capa')} className={activeTab === 'capa' ? 'pb-1 border-b-2 border-teal text-teal font-semibold' : 'pb-1 border-b-2 border-transparent text-charcoal-500'}>CAPA</button>
                </div>
                {activeTab === 'checklist' && latestRun && (
                  <div className="flex gap-2">
                    {(isAuditee || canScore) && latestRun.run.auditee_submission_status !== 'submitted' && (
                      <button type="button" onClick={() => void handleSubmitSelfAssessment()} className="px-3 py-2 rounded-lg border border-surface-300 text-xs font-semibold hover:bg-surface-50">Submit Self-Assessment</button>
                    )}
                    <button type="button" onClick={() => void handleCompleteRun()} disabled={completingRun || latestRun.run.status === 'completed'} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-xs font-semibold hover:bg-teal-600 disabled:opacity-60">
                      {completingRun ? <LoadingSpinner size={14} /> : <CheckCircleIcon className="w-4 h-4" />}
                      {latestRun.run.status === 'completed' ? 'Run completed' : 'Complete run'}
                    </button>
                  </div>
                )}
              </div>

              {activeTab === 'checklist' && (
                <>
                  {runError && <div className="text-xs text-critical">{runError.message}</div>}
                  {!latestRun && <p className="text-sm text-charcoal-500">No checklist run found for this inspection.</p>}
                  {latestRun && (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b border-surface-200 text-xs text-charcoal-500">
                            <th className="py-2 pr-3 text-left">#</th>
                            <th className="py-2 pr-3 text-left">Category</th>
                            <th className="py-2 pr-3 text-left">Req Ref</th>
                            <th className="py-2 pr-3 text-left">Question</th>
                            <th className="py-2 pr-3 text-left">Method</th>
                            <th className="py-2 pr-3 text-left">Rating</th>
                            <th className="py-2 pr-3 text-left">Risk</th>
                            <th className="py-2 pr-3 text-left">Evidence Req</th>
                            <th className="py-2 pr-3 text-left">CAPA</th>
                            <th className="py-2 pr-3 text-left">Owner / Due</th>
                            <th className="py-2 pr-3 text-left">Evidence</th>
                            <th className="py-2 pr-3 text-left">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {latestRun.items.map((item, idx) => (
                            <tr key={item.id} className="border-b border-surface-100 align-top">
                              <td className="py-2 pr-3 text-xs">{idx + 1}</td>
                              <td className="py-2 pr-3 text-xs">{item.audit_section_or_category || item.section || '-'}</td>
                              <td className="py-2 pr-3 text-xs">{item.requirement_reference || '-'}</td>
                              <td className="py-2 pr-3 text-xs">
                                <p>{item.question}</p>
                                <textarea
                                  disabled={(!canScore && !isAuditee) || latestRun.run.status === 'completed'}
                                  defaultValue={item.comments || ''}
                                  onBlur={(e) => void handleUpdateItem(item, { comments: e.target.value })}
                                  rows={2}
                                  className="mt-1 w-full px-2 py-1 border border-surface-300 rounded text-xs"
                                />
                              </td>
                              <td className="py-2 pr-3">
                                <select
                                  disabled={!canScore || latestRun.run.status === 'completed'}
                                  value={item.inspection_method ?? 'observation'}
                                  onChange={(e) => void handleUpdateItem(item, { inspection_method: e.target.value })}
                                  className="px-2 py-1 border border-surface-300 rounded text-xs"
                                >
                                  <option value="physical-inspection">Physical</option>
                                  <option value="observation">Observation</option>
                                  <option value="record-review">Record review</option>
                                </select>
                              </td>
                              <td className="py-2 pr-3">
                                <select
                                  disabled={!canScore || latestRun.run.status === 'completed'}
                                  value={item.inspection_rating ?? 'C'}
                                  onChange={(e) => void handleUpdateItem(item, { inspection_rating: e.target.value })}
                                  className="px-2 py-1 border border-surface-300 rounded text-xs"
                                >
                                  <option value="C">Compliant (2)</option>
                                  <option value="PC">Partially (1)</option>
                                  <option value="NC">Non-Compliant (0)</option>
                                </select>
                              </td>
                              <td className="py-2 pr-3">
                                <select
                                  disabled={!canScore || latestRun.run.status === 'completed'}
                                  value={item.risk_level ?? 'medium'}
                                  onChange={(e) => void handleUpdateItem(item, { risk_level: e.target.value })}
                                  className="px-2 py-1 border border-surface-300 rounded text-xs"
                                >
                                  <option value="low">Low</option>
                                  <option value="medium">Medium</option>
                                  <option value="high">High</option>
                                </select>
                              </td>
                              <td className="py-2 pr-3">
                                <select
                                  disabled={!canScore || latestRun.run.status === 'completed'}
                                  value={item.evidence_required ? 'yes' : 'no'}
                                  onChange={(e) => void handleUpdateItem(item, { evidence_required: e.target.value === 'yes' })}
                                  className="px-2 py-1 border border-surface-300 rounded text-xs"
                                >
                                  <option value="yes">Yes</option>
                                  <option value="no">No</option>
                                </select>
                              </td>
                              <td className="py-2 pr-3">
                                <select
                                  disabled={!canScore || latestRun.run.status === 'completed'}
                                  value={item.corrective_action_required ? 'yes' : 'no'}
                                  onChange={(e) => void handleUpdateItem(item, { corrective_action_required: e.target.value === 'yes' })}
                                  className="px-2 py-1 border border-surface-300 rounded text-xs"
                                >
                                  <option value="yes">Yes</option>
                                  <option value="no">No</option>
                                </select>
                              </td>
                              <td className="py-2 pr-3">
                                <select
                                  disabled={!canScore || latestRun.run.status === 'completed'}
                                  value={item.responsible_person_id ?? ''}
                                  onChange={(e) => void handleUpdateItem(item, { responsible_person_id: e.target.value || null })}
                                  className="px-2 py-1 border border-surface-300 rounded text-xs mb-1"
                                >
                                  <option value="">Responsible</option>
                                  {(userProfiles ?? []).map((p) => (
                                    <option key={p.user_id} value={p.user_id}>{p.full_name || p.email || p.user_id}</option>
                                  ))}
                                </select>
                                <input
                                  type="date"
                                  defaultValue={item.due_date ?? ''}
                                  disabled={!canScore || latestRun.run.status === 'completed'}
                                  onBlur={(e) => void handleUpdateItem(item, { due_date: e.target.value || null })}
                                  className="px-2 py-1 border border-surface-300 rounded text-xs"
                                />
                              </td>
                              <td className="py-2 pr-3 text-xs">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEvidenceItemId(String(item.id));
                                    setEvidenceOpen(true);
                                  }}
                                  className="px-2 py-1 rounded border border-surface-300 hover:bg-surface-50"
                                >
                                  Upload/View
                                </button>
                              </td>
                              <td className="py-2 pr-3 text-xs">
                                {item.inspection_rating === 'NC' ? <span className="inline-flex items-center gap-1 text-critical"><AlertCircleIcon className="w-4 h-4" />NC</span> : <span className="inline-flex items-center gap-1 text-success"><CheckCircleIcon className="w-4 h-4" />OK</span>}
                                <div className="mt-1">{item.status}</div>
                                {isAuditee && item.status !== 'closed' && (
                                  <button
                                    type="button"
                                    disabled={savingItemId === String(item.id)}
                                    onClick={() => void handleUpdateItem(item, { status: 'awaiting-evidence', closure_requested_at: new Date().toISOString(), closure_evidence_submitted_at: new Date().toISOString() })}
                                    className="mt-1 px-2 py-0.5 rounded border border-surface-300"
                                  >
                                    Submit closure
                                  </button>
                                )}
                                {isManager && item.status === 'awaiting-evidence' && (
                                  <button
                                    type="button"
                                    disabled={savingItemId === String(item.id)}
                                    onClick={() => void handleUpdateItem(item, { status: 'in-progress', manager_approved_by_user_id: user?.id ?? null, manager_approved_at: new Date().toISOString() })}
                                    className="mt-1 px-2 py-0.5 rounded border border-surface-300"
                                  >
                                    Manager sign-off
                                  </button>
                                )}
                                {(canScore || isAuditor) && item.status === 'in-progress' && (
                                  <button
                                    type="button"
                                    disabled={savingItemId === String(item.id)}
                                    onClick={() => void handleUpdateItem(item, { status: 'closed', auditor_verified_by_user_id: user?.id ?? null, auditor_verified_at: new Date().toISOString() })}
                                    className="mt-1 px-2 py-0.5 rounded border border-surface-300"
                                  >
                                    Verify & close
                                  </button>
                                )}
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
                  {(!ncrs || ncrs.length === 0) && <p className="text-sm text-charcoal-500">No NCRs raised yet.</p>}
                  {ncrs?.map((ncr) => (
                    <div key={ncr.id} className="flex items-center justify-between border border-surface-200 rounded-lg px-3 py-2 text-xs">
                      <div className="flex flex-col"><span className="font-semibold">{(ncr as any).nc_number ?? 'NCR'} - {ncr.severity}</span><span className="text-charcoal-600">{ncr.title}</span></div>
                      <span className="px-2 py-0.5 rounded-full bg-surface-100">{ncr.status}</span>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'capa' && (
                <div className="space-y-2">
                  {(!capas || capas.length === 0) && <p className="text-sm text-charcoal-500">No CAPAs linked yet.</p>}
                  {capas?.map((ca) => (
                    <div key={ca.id} className="flex items-center justify-between border border-surface-200 rounded-lg px-3 py-2 text-xs">
                      <div className="flex flex-col"><span className="font-semibold">{ca.title}</span><span className="text-charcoal-600">{ca.description ?? ''}</span></div>
                      <span className="px-2 py-0.5 rounded-full bg-surface-100">{ca.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {activeCompanyId && user?.id && inspection && (
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
