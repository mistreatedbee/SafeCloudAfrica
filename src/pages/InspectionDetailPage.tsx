import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftIcon, CalendarIcon, ClipboardCheckIcon, CheckCircleIcon } from 'lucide-react';
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
import {
  InspectionChecklistItemCard,
  InspectionChecklistItemTableRow
} from '../components/inspections/InspectionChecklistItemViews';

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
        <button
          type="button"
          onClick={() => navigate('/inspections')}
          className="inline-flex items-center gap-2 min-h-[44px] text-sm text-charcoal-500 hover:text-charcoal-800 -ml-2 px-2 rounded-lg hover:bg-surface-100"
        >
          <ArrowLeftIcon className="w-4 h-4 shrink-0" />
          Back to inspections
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
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-surface-200 pb-2">
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <button
                    type="button"
                    onClick={() => setActiveTab('checklist')}
                    className={`min-h-[44px] inline-flex items-center pb-1 border-b-2 ${
                      activeTab === 'checklist' ? 'border-teal text-teal font-semibold' : 'border-transparent text-charcoal-500'
                    }`}
                  >
                    Checklist
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('ncrs')}
                    className={`min-h-[44px] inline-flex items-center pb-1 border-b-2 ${
                      activeTab === 'ncrs' ? 'border-teal text-teal font-semibold' : 'border-transparent text-charcoal-500'
                    }`}
                  >
                    NCRs
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('capa')}
                    className={`min-h-[44px] inline-flex items-center pb-1 border-b-2 ${
                      activeTab === 'capa' ? 'border-teal text-teal font-semibold' : 'border-transparent text-charcoal-500'
                    }`}
                  >
                    CAPA
                  </button>
                </div>
                {activeTab === 'checklist' && latestRun && (
                  <div className="flex flex-col sm:flex-row flex-wrap gap-2 w-full md:w-auto">
                    {(isAuditee || canScore) && latestRun.run.auditee_submission_status !== 'submitted' && (
                      <button
                        type="button"
                        onClick={() => void handleSubmitSelfAssessment()}
                        className="min-h-[44px] inline-flex items-center justify-center px-3 rounded-lg border border-surface-300 text-xs font-semibold hover:bg-surface-50 w-full sm:w-auto"
                      >
                        Submit Self-Assessment
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleCompleteRun()}
                      disabled={completingRun || latestRun.run.status === 'completed'}
                      className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-lg bg-teal text-white text-xs font-semibold hover:bg-teal-600 disabled:opacity-60 w-full sm:w-auto"
                    >
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
                    <>
                      <div className="hidden md:block overflow-x-auto">
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
                              <InspectionChecklistItemTableRow
                                key={item.id}
                                item={item}
                                idx={idx}
                                run={latestRun.run}
                                userProfiles={userProfiles ?? []}
                                canScore={canScore}
                                isAuditee={isAuditee}
                                isManager={isManager}
                                isAuditor={isAuditor}
                                savingItemId={savingItemId}
                                userId={user?.id}
                                onUpdateItem={handleUpdateItem}
                                onOpenEvidence={(id) => {
                                  setEvidenceItemId(id);
                                  setEvidenceOpen(true);
                                }}
                              />
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="md:hidden space-y-4">
                        {latestRun.items.map((item, idx) => (
                          <InspectionChecklistItemCard
                            key={item.id}
                            item={item}
                            idx={idx}
                            run={latestRun.run}
                            userProfiles={userProfiles ?? []}
                            canScore={canScore}
                            isAuditee={isAuditee}
                            isManager={isManager}
                            isAuditor={isAuditor}
                            savingItemId={savingItemId}
                            userId={user?.id}
                            onUpdateItem={handleUpdateItem}
                            onOpenEvidence={(id) => {
                              setEvidenceItemId(id);
                              setEvidenceOpen(true);
                            }}
                          />
                        ))}
                      </div>
                    </>
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
