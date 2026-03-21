import React, { useEffect, useState } from 'react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import { createHealthHygieneRecord, listHealthHygieneRecords, updateHealthHygieneRecord } from '../../api/services/healthService';
import { listRiskAssessments } from '../../api/services/risksService';
import { listEvidenceForEntityType } from '../../api/services/evidenceService';
import type { RiskAssessment } from '../../api/services/risksService';
import type { EvidenceAttachment, HealthHygieneRecord, UUID } from '../../api/models/entities';
import { EvidenceModal } from '../../components/evidence/EvidenceModal';

type HygieneComplianceChoice = 'YES' | 'NO';

type HygieneMonitoringDetails = {
  work_area: string;
  process_activity: string;
  hazard_identified: string;
  monitoring_method: string;
  equipment_used: string;
  exposure_limit: string;
  result_obtained: string;
  comments: string;
};

function mapComplianceToChoice(status: HealthHygieneRecord['compliance_status']): HygieneComplianceChoice | null {
  if (status === 'COMPLIANT') return 'YES';
  if (status === 'NON_COMPLIANT') return 'NO';
  return null;
}

function mapChoiceToCompliance(choice: HygieneComplianceChoice | null): HealthHygieneRecord['compliance_status'] {
  if (choice === 'YES') return 'COMPLIANT';
  if (choice === 'NO') return 'NON_COMPLIANT';
  return 'UNKNOWN';
}

function getDetailsFromRecord(record: HealthHygieneRecord): HygieneMonitoringDetails {
  const raw = (record.result_details ?? {}) as Partial<HygieneMonitoringDetails>;
  return {
    work_area: raw.work_area ?? record.site_location ?? '',
    process_activity: raw.process_activity ?? record.monitoring_type ?? '',
    hazard_identified: raw.hazard_identified ?? '',
    monitoring_method: raw.monitoring_method ?? '',
    equipment_used: raw.equipment_used ?? '',
    exposure_limit: raw.exposure_limit ?? '',
    result_obtained: raw.result_obtained ?? record.results_summary ?? '',
    comments: raw.comments ?? ''
  };
}

const tabs = ['Monitoring Records'] as const;
type TabKey = (typeof tabs)[number];

export function HealthHygienePage() {
  const { user } = useUser();
  const { activeCompanyId } = useTenant();
  const [tab, setTab] = useState<TabKey>('Monitoring Records');
  const [refreshKey, setRefreshKey] = useState(0);
  const [newRow, setNewRow] = useState<HygieneMonitoringDetails>({
    work_area: '',
    process_activity: '',
    hazard_identified: '',
    monitoring_method: '',
    equipment_used: '',
    exposure_limit: '',
    result_obtained: '',
    comments: ''
  });
  const [newCompliance, setNewCompliance] = useState<HygieneComplianceChoice | ''>('');
  const [newErrors, setNewErrors] = useState<Record<keyof HygieneMonitoringDetails | 'compliance', string>>({
    work_area: '',
    process_activity: '',
    hazard_identified: '',
    monitoring_method: '',
    equipment_used: '',
    exposure_limit: '',
    result_obtained: '',
    comments: '',
    compliance: ''
  });
  const [editingId, setEditingId] = useState<UUID | null>(null);
  const [editRow, setEditRow] = useState<HygieneMonitoringDetails | null>(null);
  const [editCompliance, setEditCompliance] = useState<HygieneComplianceChoice | ''>('');
  const [evidenceForId, setEvidenceForId] = useState<UUID | null>(null);

  const { data: records } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return await listHealthHygieneRecords({ companyId: activeCompanyId, limit: 300 });
  }, [activeCompanyId, refreshKey]);

  const { data: risks } = useAsync<RiskAssessment[]>(async () => {
    if (!activeCompanyId) return [];
    return await listRiskAssessments({ companyId: activeCompanyId, limit: 200 });
  }, [activeCompanyId]);

  const { data: hygieneEvidence } = useAsync<EvidenceAttachment[]>(async () => {
    if (!activeCompanyId) return [];
    return await listEvidenceForEntityType(activeCompanyId, 'health_hygiene_record', 2000);
  }, [activeCompanyId, refreshKey]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCompanyId || !user?.id) return;
    const errors: typeof newErrors = {
      work_area: newRow.work_area ? '' : 'Required',
      process_activity: newRow.process_activity ? '' : 'Required',
      hazard_identified: newRow.hazard_identified ? '' : 'Required',
      monitoring_method: newRow.monitoring_method ? '' : 'Required',
      equipment_used: '',
      exposure_limit: '',
      result_obtained: newRow.result_obtained ? '' : 'Required',
      comments: '',
      compliance: newCompliance ? '' : 'Required'
    };
    setNewErrors(errors);
    const hasError = Object.values(errors).some((v) => v);
    if (hasError) return;

    await createHealthHygieneRecord({
      companyId: activeCompanyId,
      monitoringType: newRow.process_activity,
      siteLocation: newRow.work_area || null,
      department: null,
      monitoredOn: new Date().toISOString().slice(0, 10),
      conductedBy: null,
      methodOrStandard: newRow.monitoring_method || null,
      resultsSummary: newRow.result_obtained || null,
      resultDetails: {
        work_area: newRow.work_area,
        process_activity: newRow.process_activity,
        hazard_identified: newRow.hazard_identified,
        monitoring_method: newRow.monitoring_method,
        equipment_used: newRow.equipment_used,
        exposure_limit: newRow.exposure_limit,
        result_obtained: newRow.result_obtained,
        comments: newRow.comments
      },
      complianceStatus: mapChoiceToCompliance(newCompliance as HygieneComplianceChoice),
      nonComplianceReason: null,
      linkedRiskAssessmentIds: [] as any,
      createdByUserId: user.id
    });
    setRefreshKey((k) => k + 1);
    setNewRow({
      work_area: '',
      process_activity: '',
      hazard_identified: '',
      monitoring_method: '',
      equipment_used: '',
      exposure_limit: '',
      result_obtained: '',
      comments: ''
    });
    setNewCompliance('');
    setNewErrors({
      work_area: '',
      process_activity: '',
      hazard_identified: '',
      monitoring_method: '',
      equipment_used: '',
      exposure_limit: '',
      result_obtained: '',
      comments: '',
      compliance: ''
    });
  }

  function beginEdit(record: HealthHygieneRecord) {
    const details = getDetailsFromRecord(record);
    setEditingId(record.id);
    setEditRow(details);
    setEditCompliance(mapComplianceToChoice(record.compliance_status) ?? '');
  }

  async function saveEdit(record: HealthHygieneRecord) {
    if (!activeCompanyId || !editRow) return;
    await updateHealthHygieneRecord(
      activeCompanyId,
      record.id,
      {
        site_location: editRow.work_area || null,
        monitoring_type: editRow.process_activity || record.monitoring_type,
        results_summary: editRow.result_obtained || null,
        result_details: {
          work_area: editRow.work_area,
          process_activity: editRow.process_activity,
          hazard_identified: editRow.hazard_identified,
          monitoring_method: editRow.monitoring_method,
          equipment_used: editRow.equipment_used,
          exposure_limit: editRow.exposure_limit,
          result_obtained: editRow.result_obtained,
          comments: editRow.comments
        },
        compliance_status: mapChoiceToCompliance(editCompliance as HygieneComplianceChoice)
      },
      user?.id as UUID
    );
    setEditingId(null);
    setEditRow(null);
    setEditCompliance('');
    setRefreshKey((k) => k + 1);
  }

  return (
    <Layout title="Occupational Hygiene Monitoring">
      <div className="space-y-5">
        <div className="bg-white border border-surface-300 rounded-xl p-4">
          <h3 className="font-semibold text-charcoal mb-3">Add hygiene monitoring record</h3>
          <form onSubmit={submit}>
            <div className="overflow-auto">
              <table className="w-full text-sm table-fixed min-w-[900px]">
                <thead className="bg-surface-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Work Area / Location</th>
                    <th className="px-3 py-2 text-left">Process / Activity</th>
                    <th className="px-3 py-2 text-left">Hazard Identified</th>
                    <th className="px-3 py-2 text-left">Monitoring Method</th>
                    <th className="px-3 py-2 text-left">Equipment Used</th>
                    <th className="px-3 py-2 text-left">Exposure Limit</th>
                    <th className="px-3 py-2 text-left">Result Obtained</th>
                    <th className="px-3 py-2 text-left">Compliance (Yes / No)</th>
                    <th className="px-3 py-2 text-left">Comments</th>
                    <th className="px-3 py-2 text-left">Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-3 py-2 align-top">
                      <input
                        value={newRow.work_area}
                        onChange={(e) => setNewRow((s) => ({ ...s, work_area: e.target.value }))}
                        className={`w-full px-2 py-1.5 border rounded-lg text-xs ${newErrors.work_area ? 'border-critical' : 'border-surface-300'}`}
                        placeholder="e.g. Crushing Area"
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        value={newRow.process_activity}
                        onChange={(e) => setNewRow((s) => ({ ...s, process_activity: e.target.value }))}
                        className={`w-full px-2 py-1.5 border rounded-lg text-xs ${newErrors.process_activity ? 'border-critical' : 'border-surface-300'}`}
                        placeholder="e.g. Stone crushing"
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        value={newRow.hazard_identified}
                        onChange={(e) => setNewRow((s) => ({ ...s, hazard_identified: e.target.value }))}
                        className={`w-full px-2 py-1.5 border rounded-lg text-xs ${newErrors.hazard_identified ? 'border-critical' : 'border-surface-300'}`}
                        placeholder="e.g. Dust"
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        value={newRow.monitoring_method}
                        onChange={(e) => setNewRow((s) => ({ ...s, monitoring_method: e.target.value }))}
                        className={`w-full px-2 py-1.5 border rounded-lg text-xs ${newErrors.monitoring_method ? 'border-critical' : 'border-surface-300'}`}
                        placeholder="e.g. Personal sampling"
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        value={newRow.equipment_used}
                        onChange={(e) => setNewRow((s) => ({ ...s, equipment_used: e.target.value }))}
                        className="w-full px-2 py-1.5 border border-surface-300 rounded-lg text-xs"
                        placeholder="e.g. Dust sampler"
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        value={newRow.exposure_limit}
                        onChange={(e) => setNewRow((s) => ({ ...s, exposure_limit: e.target.value }))}
                        className="w-full px-2 py-1.5 border border-surface-300 rounded-lg text-xs"
                        placeholder="e.g. OEL limit / 85 dB"
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        value={newRow.result_obtained}
                        onChange={(e) => setNewRow((s) => ({ ...s, result_obtained: e.target.value }))}
                        className={`w-full px-2 py-1.5 border rounded-lg text-xs ${newErrors.result_obtained ? 'border-critical' : 'border-surface-300'}`}
                        placeholder="e.g. Within limit"
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <select
                        value={newCompliance}
                        onChange={(e) => setNewCompliance(e.target.value as HygieneComplianceChoice | '')}
                        className={`w-full px-2 py-1.5 border rounded-lg text-xs ${newErrors.compliance ? 'border-critical' : 'border-surface-300'}`}
                      >
                        <option value="">Select</option>
                        <option value="YES">Yes</option>
                        <option value="NO">No</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <textarea
                        value={newRow.comments}
                        onChange={(e) => setNewRow((s) => ({ ...s, comments: e.target.value }))}
                        className="w-full px-2 py-1.5 border border-surface-300 rounded-lg text-xs min-h-[40px]"
                        placeholder="Notes or observations"
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <button
                        type="submit"
                        className="px-3 py-1.5 rounded-lg bg-teal text-white text-xs font-semibold hover:bg-teal-600"
                      >
                        Save
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </form>
        </div>

        <div className="flex gap-2">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 rounded-lg text-sm border ${tab === t ? 'bg-teal text-white border-teal' : 'bg-white border-surface-300 text-charcoal'}`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
          <table className="w-full text-sm table-fixed min-w-[1000px]">
            <thead className="bg-surface-50">
              <tr>
                <th className="px-3 py-2 text-left">Work Area / Location</th>
                <th className="px-3 py-2 text-left">Process / Activity</th>
                <th className="px-3 py-2 text-left">Hazard Identified</th>
                <th className="px-3 py-2 text-left">Monitoring Method</th>
                <th className="px-3 py-2 text-left">Equipment Used</th>
                <th className="px-3 py-2 text-left">Exposure Limit</th>
                <th className="px-3 py-2 text-left">Result Obtained</th>
                <th className="px-3 py-2 text-left">Compliance</th>
                <th className="px-3 py-2 text-left">Comments</th>
                <th className="px-3 py-2 text-left">Documents</th>
                <th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {(records ?? []).map((r) => {
                const docCount = (hygieneEvidence ?? []).filter((e) => e.entity_id === r.id).length;
                const details = getDetailsFromRecord(r);
                const isEditing = editingId === r.id;
                const complianceChoice = isEditing ? editCompliance : mapComplianceToChoice(r.compliance_status);
                return (
                  <tr key={r.id} className={r.compliance_status === 'NON_COMPLIANT' ? 'bg-critical/5' : ''}>
                    <td className="px-3 py-2 align-top">
                      {isEditing ? (
                        <input
                          value={editRow?.work_area ?? ''}
                          onChange={(e) => setEditRow((s) => (s ? { ...s, work_area: e.target.value } : s))}
                          className="w-full px-2 py-1.5 border border-surface-300 rounded-lg text-xs"
                        />
                      ) : (
                        details.work_area || '—'
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isEditing ? (
                        <input
                          value={editRow?.process_activity ?? ''}
                          onChange={(e) => setEditRow((s) => (s ? { ...s, process_activity: e.target.value } : s))}
                          className="w-full px-2 py-1.5 border border-surface-300 rounded-lg text-xs"
                        />
                      ) : (
                        details.process_activity || '—'
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isEditing ? (
                        <input
                          value={editRow?.hazard_identified ?? ''}
                          onChange={(e) => setEditRow((s) => (s ? { ...s, hazard_identified: e.target.value } : s))}
                          className="w-full px-2 py-1.5 border border-surface-300 rounded-lg text-xs"
                        />
                      ) : (
                        details.hazard_identified || '—'
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isEditing ? (
                        <input
                          value={editRow?.monitoring_method ?? ''}
                          onChange={(e) => setEditRow((s) => (s ? { ...s, monitoring_method: e.target.value } : s))}
                          className="w-full px-2 py-1.5 border border-surface-300 rounded-lg text-xs"
                        />
                      ) : (
                        details.monitoring_method || '—'
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isEditing ? (
                        <input
                          value={editRow?.equipment_used ?? ''}
                          onChange={(e) => setEditRow((s) => (s ? { ...s, equipment_used: e.target.value } : s))}
                          className="w-full px-2 py-1.5 border border-surface-300 rounded-lg text-xs"
                        />
                      ) : (
                        details.equipment_used || '—'
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isEditing ? (
                        <input
                          value={editRow?.exposure_limit ?? ''}
                          onChange={(e) => setEditRow((s) => (s ? { ...s, exposure_limit: e.target.value } : s))}
                          className="w-full px-2 py-1.5 border border-surface-300 rounded-lg text-xs"
                        />
                      ) : (
                        details.exposure_limit || '—'
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isEditing ? (
                        <input
                          value={editRow?.result_obtained ?? ''}
                          onChange={(e) => setEditRow((s) => (s ? { ...s, result_obtained: e.target.value } : s))}
                          className="w-full px-2 py-1.5 border border-surface-300 rounded-lg text-xs"
                        />
                      ) : (
                        details.result_obtained || '—'
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isEditing ? (
                        <select
                          value={editCompliance}
                          onChange={(e) => setEditCompliance(e.target.value as HygieneComplianceChoice | '')}
                          className="w-full px-2 py-1.5 border border-surface-300 rounded-lg text-xs"
                        >
                          <option value="">Select</option>
                          <option value="YES">Yes</option>
                          <option value="NO">No</option>
                        </select>
                      ) : complianceChoice === 'YES' ? (
                        'Yes'
                      ) : complianceChoice === 'NO' ? (
                        'No'
                      ) : (
                        r.compliance_status
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isEditing ? (
                        <textarea
                          value={editRow?.comments ?? ''}
                          onChange={(e) => setEditRow((s) => (s ? { ...s, comments: e.target.value } : s))}
                          className="w-full px-2 py-1.5 border border-surface-300 rounded-lg text-xs min-h-[40px]"
                        />
                      ) : (
                        details.comments || '—'
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="px-2 py-1.5 rounded-lg bg-surface-200 text-xs text-charcoal hover:bg-surface-300"
                          onClick={() => setEvidenceForId(r.id)}
                        >
                          Documents
                        </button>
                        {docCount > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-teal/10 text-teal text-xs font-semibold">
                            {docCount}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top space-x-2">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            className="px-2 py-1.5 rounded-lg bg-teal text-white text-xs font-semibold hover:bg-teal-600"
                            onClick={() => void saveEdit(r)}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="px-2 py-1.5 rounded-lg bg-surface-200 text-xs text-charcoal hover:bg-surface-300"
                            onClick={() => {
                              setEditingId(null);
                              setEditRow(null);
                              setEditCompliance('');
                            }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="px-2 py-1.5 rounded-lg bg-surface-200 text-xs text-charcoal hover:bg-surface-300"
                          onClick={() => beginEdit(r)}
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {activeCompanyId && user?.id && evidenceForId && (
          <EvidenceModal
            open={!!evidenceForId}
            onClose={() => setEvidenceForId(null)}
            companyId={activeCompanyId}
            actorUserId={user.id}
            entityType="health_hygiene_record"
            entityId={evidenceForId}
            title="Hygiene monitoring documents"
          />
        )}
      </div>
    </Layout>
  );
}

