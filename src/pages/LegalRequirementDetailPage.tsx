import React, { useMemo, useState } from 'react';
import { Link, useSearchParams, useParams } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { useTenant } from '../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../api/hooks/useAsync';
import { listUserProfiles } from '../api/services/profilesService';
import type { CompanyRole } from '../api/models/core';
import type { LegalUpdateCompletionStatus, UUID } from '../api/models/entities';
import {
  closeLegalUpdate,
  createLegalUpdate,
  deleteLegalUpdate,
  getLegalRequirementById,
  LEGAL_UPDATE_COMPLETION_OPTIONS,
  updateLegalUpdate
} from '../api/services/legalRequirementsService';
import { useDraftManager } from '../session/DraftManagerProvider';
import { useDraftRegistration } from '../session/useDraftRegistration';

function canWrite(role: CompanyRole | null): boolean {
  return role === 'owner' || role === 'admin' || role === 'manager' || role === 'supervisor' || role === 'consultant';
}

type UpdateForm = {
  dateAmended: string;
  lawUpdatedDate: string;
  summaryOfChange: string;
  impactOnBusiness: string;
  actionRequired: string;
  responsibleUserId: string;
  responsibleExternalName: string;
  deadline: string;
  completionStatus: LegalUpdateCompletionStatus;
  closureNote: string;
};

const DEFAULT_UPDATE_FORM: UpdateForm = {
  dateAmended: '',
  lawUpdatedDate: '',
  summaryOfChange: '',
  impactOnBusiness: '',
  actionRequired: '',
  responsibleUserId: '',
  responsibleExternalName: '',
  deadline: '',
  completionStatus: 'OPEN',
  closureNote: ''
};

export function LegalRequirementDetailPage() {
  const { requirementId } = useParams();
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'updates' ? 'updates' : 'detail';
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const writable = canWrite(activeRole ?? null);
  const canDeleteUpdates = activeRole === 'owner' || activeRole === 'admin';
  const [refreshKey, setRefreshKey] = useState(0);
  const [updateForm, setUpdateForm] = useState<UpdateForm>(DEFAULT_UPDATE_FORM);
  const [closingUpdateId, setClosingUpdateId] = useState<string | null>(null);
  const { restoreDraft, clearDraft } = useDraftManager();
  const draftKey = `legal-update-form:${requirementId ?? 'unknown'}:${user?.id ?? 'anon'}`;

  const { data: profiles } = useAsync(async () => (activeCompanyId ? await listUserProfiles(activeCompanyId) : []), [activeCompanyId]);
  const { data, loading, error, refresh } = useAsync(
    async () => {
      if (!activeCompanyId || !requirementId) return null;
      return await getLegalRequirementById({ companyId: activeCompanyId, requirementId: requirementId as UUID });
    },
    [activeCompanyId, requirementId, refreshKey]
  );

  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    (profiles ?? []).forEach((p) => map.set(p.user_id, p.full_name || p.email || p.user_id));
    return map;
  }, [profiles]);

  const userOptions = (profiles ?? []).map((p) => ({ id: p.user_id, label: p.full_name || p.email || p.user_id }));

  useDraftRegistration({
    key: draftKey,
    enabled: writable,
    isDirty: () => Object.values(updateForm).some((value) => String(value ?? '').trim().length > 0),
    serialize: () => updateForm
  });

  React.useEffect(() => {
    const restored = restoreDraft<UpdateForm>(draftKey);
    if (!restored) return;
    setUpdateForm((prev) => ({ ...prev, ...restored }));
  }, [draftKey, restoreDraft]);

  if (!requirementId) {
    return (
      <Layout title="Legal Requirement Detail">
        <p className="text-sm text-critical">Requirement ID is missing.</p>
      </Layout>
    );
  }

  return (
    <Layout title="Legal Requirement Detail">
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-surface-300 p-4">
          <Link to="/dashboard/legal/register" className="text-sm text-teal hover:underline">
            Back to Legal Requirements Register
          </Link>
        </div>

        {error && <div className="bg-critical/5 border border-critical/30 rounded-xl p-3 text-sm text-critical">{error.message}</div>}
        {loading && <div className="bg-white rounded-xl border border-surface-300 p-4 text-sm text-charcoal-500">Loading requirement...</div>}

        {!loading && data && (
          <>
            <div className="bg-white rounded-xl border border-surface-300 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-charcoal">{data.requirement.requirement_standard}</h2>
                <span className="inline-flex px-2 py-1 rounded bg-surface-100 text-xs font-semibold">{data.requirement.compliance_status}</span>
              </div>
              <p className="text-sm text-charcoal-600">
                <span className="font-medium">Reference (Sections): </span>
                {(data.requirement.references ?? []).map((x) => x.referenceText).join(', ') || '-'}
              </p>
              <p className="text-sm text-charcoal-600">
                <span className="font-medium">Applicability: </span>
                {data.requirement.applicability || '-'}
              </p>
              <p className="text-sm text-charcoal-600">
                <span className="font-medium">Finding: </span>
                {data.requirement.finding || '-'}
              </p>
              <p className="text-sm text-charcoal-600">
                <span className="font-medium">Actions needed: </span>
                {data.requirement.actions_needed || '-'}
              </p>
              <p className="text-sm text-charcoal-600">
                <span className="font-medium">Responsible person: </span>
                {data.requirement.responsible_user_id
                  ? userMap.get(data.requirement.responsible_user_id) ?? data.requirement.responsible_user_id
                  : data.requirement.responsible_external_name || '-'}
              </p>
              <p className="text-sm text-charcoal-600">
                <span className="font-medium">Target date: </span>
                {data.requirement.target_date || '-'}
              </p>

              <div className="space-y-1">
                <p className="text-sm font-medium text-charcoal">Compliance Evidence</p>
                {(data.requirement.evidence_links ?? []).length === 0 && <p className="text-sm text-charcoal-500">No evidence links.</p>}
                {(data.requirement.evidence_links ?? []).map((link) => (
                  <Link
                    key={link.documentId}
                    to={`/documents?view=${link.documentId}`}
                    className="block text-sm text-teal hover:underline"
                  >
                    {link.documentTitleSnapshot}
                  </Link>
                ))}
              </div>

              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium text-charcoal">Linked Records</p>
                {(!data.requirement.links || data.requirement.links.length === 0) && (
                  <p className="text-sm text-charcoal-500">No linked records.</p>
                )}

                {data.requirement.links && data.requirement.links.length > 0 && (
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs font-semibold text-charcoal-500">Linked Documents</p>
                      {data.requirement.links.filter((l) => l.linked_module_type === 'document').length === 0 && (
                        <p className="text-xs text-charcoal-400">None</p>
                      )}
                      {data.requirement.links
                        .filter((l) => l.linked_module_type === 'document')
                        .map((l) => (
                          <Link
                            key={l.id}
                            to={`/documents?view=${l.linked_record_id}`}
                            className="block text-xs text-teal hover:underline"
                          >
                            Document {l.linked_record_id.slice(0, 8)}
                          </Link>
                        ))}
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-charcoal-500">Linked Risk Assessments</p>
                      {data.requirement.links.filter((l) => l.linked_module_type === 'risk_assessment').length === 0 && (
                        <p className="text-xs text-charcoal-400">None</p>
                      )}
                      {data.requirement.links
                        .filter((l) => l.linked_module_type === 'risk_assessment')
                        .map((l) => (
                          <Link
                            key={l.id}
                            to={`/risk-assessments/${l.linked_record_id}`}
                            className="block text-xs text-teal hover:underline"
                          >
                            Risk assessment {l.linked_record_id.slice(0, 8)}
                          </Link>
                        ))}
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-charcoal-500">Linked NCRs</p>
                      {data.requirement.links.filter((l) => l.linked_module_type === 'ncr').length === 0 && (
                        <p className="text-xs text-charcoal-400">None</p>
                      )}
                      {data.requirement.links
                        .filter((l) => l.linked_module_type === 'ncr')
                        .map((l) => (
                          <Link
                            key={l.id}
                            to={`/dashboard/quality/ncrs?view=${l.linked_record_id}`}
                            className="block text-xs text-teal hover:underline"
                          >
                            NCR {l.linked_record_id.slice(0, 8)}
                          </Link>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-surface-300 p-4">
              <div className="flex gap-2 mb-3">
                <Link to={`/dashboard/legal/register/${requirementId}`} className={`px-3 py-1.5 rounded-lg text-sm ${activeTab === 'detail' ? 'bg-teal text-white' : 'border border-surface-300'}`}>
                  Detail
                </Link>
                <Link to={`/dashboard/legal/register/${requirementId}?tab=updates`} className={`px-3 py-1.5 rounded-lg text-sm ${activeTab === 'updates' ? 'bg-teal text-white' : 'border border-surface-300'}`}>
                  Updates
                </Link>
              </div>

              {activeTab === 'detail' && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-charcoal">Audit Trail</h3>
                  <div className="max-h-64 overflow-auto border border-surface-200 rounded-lg">
                    {data.auditTrail.length === 0 && <p className="p-3 text-sm text-charcoal-500">No audit logs.</p>}
                    {data.auditTrail.map((log) => (
                      <div key={log.id} className="p-3 border-b border-surface-100 last:border-b-0">
                        <p className="text-sm font-medium text-charcoal">{log.action}</p>
                        <p className="text-xs text-charcoal-500">
                          {new Date(log.created_at).toLocaleString('en-ZA')} by {userMap.get(log.actor_user_id) ?? log.actor_user_id}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'updates' && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-charcoal">Legal Update Tracking</h3>
                  <div className="overflow-auto border border-surface-200 rounded-lg">
                    <table className="w-full min-w-[1200px] text-sm">
                      <thead className="bg-surface-50">
                        <tr>
                          <th className="px-3 py-2 text-left">Date amended</th>
                          <th className="px-3 py-2 text-left">Law updated date</th>
                          <th className="px-3 py-2 text-left">Summary of change</th>
                          <th className="px-3 py-2 text-left">Impact on business</th>
                          <th className="px-3 py-2 text-left">Action required</th>
                          <th className="px-3 py-2 text-left">Responsible person</th>
                          <th className="px-3 py-2 text-left">Deadline</th>
                          <th className="px-3 py-2 text-left">Completion status</th>
                          <th className="px-3 py-2 text-left">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-100">
                        {data.updates.map((u) => {
                          const deadlineDate = u.deadline ? new Date(u.deadline) : null;
                          const isOverdue = u.completion_status === 'OPEN' && deadlineDate && deadlineDate.getTime() < new Date(new Date().toISOString().slice(0, 10)).getTime();
                          const responsible = u.responsible_user_id ? userMap.get(u.responsible_user_id) ?? u.responsible_user_id : u.responsible_external_name || '-';
                          return (
                            <tr key={u.id}>
                              <td className="px-3 py-2">{u.date_amended || '-'}</td>
                              <td className="px-3 py-2">{u.law_updated_date || '-'}</td>
                              <td className="px-3 py-2">{u.summary_of_change || '-'}</td>
                              <td className="px-3 py-2">{u.impact_on_business || '-'}</td>
                              <td className="px-3 py-2">{u.action_required || '-'}</td>
                              <td className="px-3 py-2">{responsible}</td>
                              <td className="px-3 py-2">
                                {u.deadline || '-'}
                                {isOverdue && <span className="ml-2 inline-flex px-2 py-0.5 rounded bg-critical/10 text-critical text-xs font-semibold">OVERDUE</span>}
                              </td>
                              <td className="px-3 py-2">{u.completion_status}</td>
                              <td className="px-3 py-2">
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    disabled={!writable}
                                    onClick={async () => {
                                      if (!activeCompanyId || !user?.id) return;
                                      const next = prompt('Update summary of change', u.summary_of_change ?? '');
                                      if (next == null) return;
                                      await updateLegalUpdate({
                                        companyId: activeCompanyId,
                                        updateId: u.id,
                                        actorUserId: user.id as UUID,
                                        actorRole: activeRole ?? null,
                                        patch: { summaryOfChange: next }
                                      });
                                      setRefreshKey((k) => k + 1);
                                      await refresh();
                                    }}
                                    className="px-2 py-1 rounded border border-surface-300 text-xs disabled:opacity-60"
                                  >
                                    Edit
                                  </button>
                                  {u.completion_status === 'OPEN' && (
                                    <button
                                      type="button"
                                      disabled={!writable}
                                      onClick={() => setClosingUpdateId(u.id)}
                                      className="px-2 py-1 rounded border border-surface-300 text-xs disabled:opacity-60"
                                    >
                                      Close
                                    </button>
                                  )}
                                  {canDeleteUpdates && (
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        if (!activeCompanyId || !user?.id) return;
                                        if (!window.confirm('Delete this legal update? This cannot be undone.')) return;
                                        await deleteLegalUpdate({
                                          companyId: activeCompanyId,
                                          updateId: u.id,
                                          actorUserId: user.id as UUID,
                                          actorRole: activeRole ?? null
                                        });
                                        setRefreshKey((k) => k + 1);
                                        await refresh();
                                      }}
                                      className="px-2 py-1 rounded border border-critical/30 text-critical text-xs"
                                    >
                                      Delete
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {data.updates.length === 0 && (
                          <tr>
                            <td colSpan={9} className="px-3 py-6 text-center text-charcoal-500">
                              No legal updates yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {writable && (
                    <div className="border border-surface-300 rounded-lg p-3 space-y-2">
                      <h4 className="font-semibold text-charcoal">Add legal update</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <input type="date" value={updateForm.dateAmended} onChange={(e) => setUpdateForm((p) => ({ ...p, dateAmended: e.target.value }))} className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
                        <input type="date" value={updateForm.lawUpdatedDate} onChange={(e) => setUpdateForm((p) => ({ ...p, lawUpdatedDate: e.target.value }))} className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
                        <textarea value={updateForm.summaryOfChange} onChange={(e) => setUpdateForm((p) => ({ ...p, summaryOfChange: e.target.value }))} placeholder="Summary of change" className="px-3 py-2 border border-surface-300 rounded-lg text-sm md:col-span-2" rows={2} />
                        <textarea value={updateForm.impactOnBusiness} onChange={(e) => setUpdateForm((p) => ({ ...p, impactOnBusiness: e.target.value }))} placeholder="Impact on business" className="px-3 py-2 border border-surface-300 rounded-lg text-sm md:col-span-2" rows={2} />
                        <textarea value={updateForm.actionRequired} onChange={(e) => setUpdateForm((p) => ({ ...p, actionRequired: e.target.value }))} placeholder="Action required" className="px-3 py-2 border border-surface-300 rounded-lg text-sm md:col-span-2" rows={2} />
                        <select value={updateForm.responsibleUserId} onChange={(e) => setUpdateForm((p) => ({ ...p, responsibleUserId: e.target.value }))} className="px-3 py-2 border border-surface-300 rounded-lg text-sm">
                          <option value="">Responsible user</option>
                          {userOptions.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.label}
                            </option>
                          ))}
                        </select>
                        <input value={updateForm.responsibleExternalName} onChange={(e) => setUpdateForm((p) => ({ ...p, responsibleExternalName: e.target.value }))} placeholder="Responsible external name" className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
                        <input type="date" value={updateForm.deadline} onChange={(e) => setUpdateForm((p) => ({ ...p, deadline: e.target.value }))} className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
                        <select value={updateForm.completionStatus} onChange={(e) => setUpdateForm((p) => ({ ...p, completionStatus: e.target.value as LegalUpdateCompletionStatus }))} className="px-3 py-2 border border-surface-300 rounded-lg text-sm">
                          {LEGAL_UPDATE_COMPLETION_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        {updateForm.completionStatus === 'CLOSED' && (
                          <textarea value={updateForm.closureNote} onChange={(e) => setUpdateForm((p) => ({ ...p, closureNote: e.target.value }))} placeholder="Closure note" className="px-3 py-2 border border-surface-300 rounded-lg text-sm md:col-span-2" rows={2} />
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!activeCompanyId || !user?.id) return;
                          await createLegalUpdate({
                            companyId: activeCompanyId,
                            legalRequirementId: requirementId as UUID,
                            actorUserId: user.id as UUID,
                            actorRole: activeRole ?? null,
                            dateAmended: updateForm.dateAmended || null,
                            lawUpdatedDate: updateForm.lawUpdatedDate || null,
                            summaryOfChange: updateForm.summaryOfChange || null,
                            impactOnBusiness: updateForm.impactOnBusiness || null,
                            actionRequired: updateForm.actionRequired || null,
                            responsibleUserId: (updateForm.responsibleUserId || null) as UUID | null,
                            responsibleExternalName: updateForm.responsibleExternalName || null,
                            deadline: updateForm.deadline || null,
                            completionStatus: updateForm.completionStatus,
                            closureNote: updateForm.closureNote || null
                          });
                          setUpdateForm(DEFAULT_UPDATE_FORM);
                          clearDraft(draftKey);
                          setRefreshKey((k) => k + 1);
                          await refresh();
                        }}
                        className="px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold"
                      >
                        Add update
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {closingUpdateId && activeCompanyId && user?.id && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => setClosingUpdateId(null)} />
          <div className="relative bg-white border border-surface-300 rounded-xl p-4 w-full max-w-md space-y-3 max-h-[90dvh] overflow-y-auto">
            <p className="font-semibold text-charcoal">Close legal update</p>
            <textarea
              value={updateForm.closureNote}
              onChange={(e) => setUpdateForm((p) => ({ ...p, closureNote: e.target.value }))}
              placeholder="Closure note (required)"
              className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
              rows={3}
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setClosingUpdateId(null)} className="px-3 py-2 rounded-lg border border-surface-300 text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!closingUpdateId || !activeCompanyId || !user?.id) return;
                  await closeLegalUpdate({
                    companyId: activeCompanyId,
                    updateId: closingUpdateId as UUID,
                    actorUserId: user.id as UUID,
                    actorRole: activeRole ?? null,
                    closureNote: updateForm.closureNote
                  });
                  setClosingUpdateId(null);
                  setUpdateForm((p) => ({ ...p, closureNote: '' }));
                  setRefreshKey((k) => k + 1);
                  await refresh();
                }}
                className="px-3 py-2 rounded-lg bg-teal text-white text-sm"
              >
                Close update
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
