import React, { useEffect, useMemo, useState } from 'react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import {
  createHealthHygieneRecord,
  deleteHealthHygieneRecord,
  listHealthHygieneRecords,
  updateHealthHygieneRecord
} from '../../api/services/healthService';
import { listEvidenceForEntityType, createEvidence } from '../../api/services/evidenceService';
import type { EvidenceAttachment, HealthHygieneRecord, UUID } from '../../api/models/entities';
import { EvidenceModal, EVIDENCE_BUCKET } from '../../components/evidence/EvidenceModal';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';
import { insforge } from '../../api/insforge/client';
import { formatAuthError } from '../../auth/authMessages';

type HygieneComplianceChoice = 'YES' | 'NO';

type HygieneMonitoringDetails = {
  work_area: string;
  department: string;
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
    department: raw.department ?? record.department ?? '',
    process_activity: raw.process_activity ?? record.monitoring_type ?? '',
    hazard_identified: raw.hazard_identified ?? '',
    monitoring_method: raw.monitoring_method ?? '',
    equipment_used: raw.equipment_used ?? '',
    exposure_limit: raw.exposure_limit ?? '',
    result_obtained: raw.result_obtained ?? record.results_summary ?? '',
    comments: raw.comments ?? ''
  };
}

async function uploadHygieneEvidenceFiles(input: {
  companyId: UUID;
  actorUserId: UUID;
  recordId: UUID;
  files: File[];
}) {
  const uploaded: string[] = [];
  for (const file of input.files) {
    const key = `${input.companyId}/health_hygiene_record/${input.recordId}/${Date.now()}-${file.name}`.replace(/\s+/g, '_');
    const { data, error } = await insforge.storage.from(EVIDENCE_BUCKET).upload(key, file);
    if (error) throw error;
    await createEvidence({
      companyId: input.companyId,
      entityType: 'health_hygiene_record',
      entityId: input.recordId,
      title: file.name,
      storageBucket: EVIDENCE_BUCKET,
      storageKey: data?.key ?? key,
      createdByUserId: input.actorUserId,
      originalFilename: file.name,
      displayTitle: file.name,
      fileKind: file.type.startsWith('image/') ? 'image' : 'document'
    });
    uploaded.push(file.name);
  }
  return uploaded;
}

const tabs = ['Monitoring Records'] as const;
type TabKey = (typeof tabs)[number];
const ACCEPTED_FILE_TYPES = ['image/*', '.pdf', '.doc', '.docx', '.xls', '.xlsx'];

export function HealthHygienePage() {
  const { user } = useUser();
  const { activeCompanyId } = useTenant();
  const [tab, setTab] = useState<TabKey>('Monitoring Records');
  const [refreshKey, setRefreshKey] = useState(0);
  const [savingCreate, setSavingCreate] = useState(false);
  const [savingEditId, setSavingEditId] = useState<UUID | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [newFiles, setNewFiles] = useState<File[]>([]);

  const [newRow, setNewRow] = useState<HygieneMonitoringDetails>({
    work_area: '',
    department: '',
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
    department: '',
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

  const { restoreDraft, clearDraft } = useDraftManager();

  type HygieneCreateDraft = {
    newRow: HygieneMonitoringDetails;
    newCompliance: HygieneComplianceChoice | '';
  };

  type HygieneEditDraft = {
    editRow: HygieneMonitoringDetails;
    editCompliance: HygieneComplianceChoice | '';
  };

  const draftKeyCreate = `health-hygiene-create:${activeCompanyId ?? 'none'}:${user?.id ?? 'anon'}`;
  const draftKeyEdit = `health-hygiene-edit:${activeCompanyId ?? 'none'}:${user?.id ?? 'anon'}:${editingId ?? 'none'}`;

  const [createBaseline, setCreateBaseline] = useState<HygieneCreateDraft>(() => ({ newRow: { ...newRow }, newCompliance }));
  const [editBaseline, setEditBaseline] = useState<HygieneEditDraft | null>(null);

  const hasDirtyCreateDraft = JSON.stringify({ newRow, newCompliance }) !== JSON.stringify(createBaseline) || newFiles.length > 0;
  const hasDirtyEditDraft = !!editBaseline && !!editRow && JSON.stringify({ editRow, editCompliance }) !== JSON.stringify(editBaseline);

  useDraftRegistration({
    key: draftKeyCreate,
    enabled: Boolean(activeCompanyId && user?.id && !editingId),
    isDirty: () => hasDirtyCreateDraft,
    serialize: () =>
      ({
        newRow,
        newCompliance
      }) satisfies HygieneCreateDraft
  });

  useDraftRegistration({
    key: draftKeyEdit,
    enabled: Boolean(activeCompanyId && user?.id && editingId && editRow),
    isDirty: () => hasDirtyEditDraft,
    serialize: () =>
      ({
        editRow: editRow!,
        editCompliance
      }) satisfies HygieneEditDraft
  });

  useEffect(() => {
    if (!activeCompanyId || !user?.id) return;
    if (editingId) return;
    const restored = restoreDraft<HygieneCreateDraft>(draftKeyCreate);
    if (!restored) return;
    setNewRow(restored.newRow);
    setNewCompliance(restored.newCompliance);
    setCreateBaseline(restored);
  }, [activeCompanyId, draftKeyCreate, editingId, restoreDraft, user?.id]);

  useEffect(() => {
    if (!activeCompanyId || !user?.id) return;
    if (!editingId || !editRow) return;
    const restored = restoreDraft<HygieneEditDraft>(draftKeyEdit);
    if (restored) {
      setEditRow(restored.editRow);
      setEditCompliance(restored.editCompliance);
      setEditBaseline(restored);
      return;
    }
    setEditBaseline({ editRow, editCompliance });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKeyEdit, editingId, restoreDraft, user?.id]);

  useEffect(() => {
    if (!hasDirtyCreateDraft && !hasDirtyEditDraft) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasDirtyCreateDraft, hasDirtyEditDraft]);

  const { data: records } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return await listHealthHygieneRecords({ companyId: activeCompanyId, limit: 300 });
  }, [activeCompanyId, refreshKey]);

  const { data: hygieneEvidence } = useAsync<EvidenceAttachment[]>(async () => {
    if (!activeCompanyId) return [];
    return await listEvidenceForEntityType(activeCompanyId, 'health_hygiene_record', 2000);
  }, [activeCompanyId, refreshKey]);

  const evidenceByRecord = useMemo(() => {
    const map = new Map<UUID, EvidenceAttachment[]>();
    for (const item of hygieneEvidence ?? []) {
      const list = map.get(item.entity_id) ?? [];
      list.push(item);
      map.set(item.entity_id, list);
    }
    return map;
  }, [hygieneEvidence]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCompanyId || !user?.id || savingCreate) return;
    setErrorMessage(null);
    setMessage(null);
    setUploadStatus(null);

    const errors: typeof newErrors = {
      work_area: newRow.work_area ? '' : 'Required',
      department: newRow.department ? '' : 'Required',
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
    if (newCompliance === 'NO' && newFiles.length === 0) {
      setErrorMessage('Please upload evidence documents for non-compliant records.');
      return;
    }

    setSavingCreate(true);
    try {
      const created = await createHealthHygieneRecord({
        companyId: activeCompanyId,
        monitoringType: newRow.process_activity,
        siteLocation: newRow.work_area || null,
        department: newRow.department || null,
        monitoredOn: new Date().toISOString().slice(0, 10),
        conductedBy: null,
        methodOrStandard: newRow.monitoring_method || null,
        resultsSummary: newRow.result_obtained || null,
        resultDetails: {
          work_area: newRow.work_area,
          department: newRow.department,
          process_activity: newRow.process_activity,
          hazard_identified: newRow.hazard_identified,
          monitoring_method: newRow.monitoring_method,
          equipment_used: newRow.equipment_used,
          exposure_limit: newRow.exposure_limit,
          result_obtained: newRow.result_obtained,
          comments: newRow.comments
        },
        complianceStatus: mapChoiceToCompliance(newCompliance as HygieneComplianceChoice),
        nonComplianceReason: newCompliance === 'NO' ? (newRow.comments || newRow.hazard_identified || null) : null,
        linkedRiskAssessmentIds: [] as UUID[],
        createdByUserId: user.id
      });

      let uploaded: string[] = [];
      if (newFiles.length > 0) {
        uploaded = await uploadHygieneEvidenceFiles({
          companyId: activeCompanyId,
          actorUserId: user.id,
          recordId: created.id,
          files: newFiles
        });
      }

      setRefreshKey((k) => k + 1);
      setMessage('Saved successfully.');
      if (uploaded.length > 0) setUploadStatus(`Documents uploaded: ${uploaded.join(', ')}`);

      const clearedRow: HygieneMonitoringDetails = {
        work_area: '',
        department: '',
        process_activity: '',
        hazard_identified: '',
        monitoring_method: '',
        equipment_used: '',
        exposure_limit: '',
        result_obtained: '',
        comments: ''
      };
      setNewRow(clearedRow);
      setNewCompliance('');
      setNewFiles([]);
      setNewErrors({
        work_area: '',
        department: '',
        process_activity: '',
        hazard_identified: '',
        monitoring_method: '',
        equipment_used: '',
        exposure_limit: '',
        result_obtained: '',
        comments: '',
        compliance: ''
      });
      setCreateBaseline({ newRow: clearedRow, newCompliance: '' });
      clearDraft(draftKeyCreate);
    } catch (error: any) {
      setErrorMessage(formatAuthError(error));
    } finally {
      setSavingCreate(false);
    }
  }

  function beginEdit(record: HealthHygieneRecord) {
    const details = getDetailsFromRecord(record);
    const nextCompliance = mapComplianceToChoice(record.compliance_status) ?? '';
    setEditingId(record.id);
    setEditRow(details);
    setEditCompliance(nextCompliance);
    setEditBaseline({ editRow: details, editCompliance: nextCompliance });
  }

  async function saveEdit(record: HealthHygieneRecord) {
    if (!activeCompanyId || !editRow || !user?.id || savingEditId) return;
    setErrorMessage(null);
    setMessage(null);
    const keyToClear = draftKeyEdit;
    setSavingEditId(record.id);
    try {
      await updateHealthHygieneRecord(
        activeCompanyId,
        record.id,
        {
          site_location: editRow.work_area || null,
          department: editRow.department || null,
          monitoring_type: editRow.process_activity || record.monitoring_type,
          results_summary: editRow.result_obtained || null,
          result_details: {
            work_area: editRow.work_area,
            department: editRow.department,
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
        user.id as UUID
      );
      clearDraft(keyToClear);
      setEditBaseline(null);
      setEditingId(null);
      setEditRow(null);
      setEditCompliance('');
      setRefreshKey((k) => k + 1);
      setMessage('Saved successfully.');
    } catch (error: any) {
      setErrorMessage(formatAuthError(error));
    } finally {
      setSavingEditId(null);
    }
  }

  async function removeRecord(record: HealthHygieneRecord) {
    if (!activeCompanyId || !user?.id) return;
    const ok = window.confirm('Are you sure you want to delete this record?');
    if (!ok) return;
    setErrorMessage(null);
    setMessage(null);
    try {
      await deleteHealthHygieneRecord(activeCompanyId, record.id, user.id);
      if (editingId === record.id) {
        clearDraft(draftKeyEdit);
        setEditBaseline(null);
        setEditingId(null);
        setEditRow(null);
        setEditCompliance('');
      }
      setRefreshKey((k) => k + 1);
      setMessage('Record deleted successfully.');
    } catch (error: any) {
      setErrorMessage(formatAuthError(error));
    }
  }

  return (
    <Layout title="Occupational Hygiene Monitoring">
      <div className="space-y-5">
        <div className="bg-white border border-surface-300 rounded-xl p-4">
          <h3 className="font-semibold text-charcoal mb-3">Add hygiene monitoring record</h3>
          {errorMessage && <p className="mb-2 text-sm text-critical">{errorMessage}</p>}
          {message && <p className="mb-2 text-sm text-success-700">{message}</p>}
          {uploadStatus && <p className="mb-2 text-sm text-teal">{uploadStatus}</p>}
          <form onSubmit={submit}>
            <div className="overflow-auto">
              <table className="w-full text-sm table-fixed min-w-[1100px]">
                <thead className="bg-surface-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Work Area / Location</th>
                    <th className="px-3 py-2 text-left">Department</th>
                    <th className="px-3 py-2 text-left">Process / Activity</th>
                    <th className="px-3 py-2 text-left">Hazard Identified</th>
                    <th className="px-3 py-2 text-left">Monitoring Method</th>
                    <th className="px-3 py-2 text-left">Equipment Used</th>
                    <th className="px-3 py-2 text-left">Exposure Limit</th>
                    <th className="px-3 py-2 text-left">Result Obtained</th>
                    <th className="px-3 py-2 text-left">Compliance (Yes / No)</th>
                    <th className="px-3 py-2 text-left">Comments</th>
                    <th className="px-3 py-2 text-left">Documents</th>
                    <th className="px-3 py-2 text-left">Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-3 py-2 align-top">
                      <input value={newRow.work_area} onChange={(e) => setNewRow((s) => ({ ...s, work_area: e.target.value }))} className={`w-full px-2 py-1.5 border rounded-lg text-xs ${newErrors.work_area ? 'border-critical' : 'border-surface-300'}`} placeholder="e.g. Crushing Area" />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input value={newRow.department} onChange={(e) => setNewRow((s) => ({ ...s, department: e.target.value }))} className={`w-full px-2 py-1.5 border rounded-lg text-xs ${newErrors.department ? 'border-critical' : 'border-surface-300'}`} placeholder="e.g. Processing" />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input value={newRow.process_activity} onChange={(e) => setNewRow((s) => ({ ...s, process_activity: e.target.value }))} className={`w-full px-2 py-1.5 border rounded-lg text-xs ${newErrors.process_activity ? 'border-critical' : 'border-surface-300'}`} placeholder="e.g. Stone crushing" />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input value={newRow.hazard_identified} onChange={(e) => setNewRow((s) => ({ ...s, hazard_identified: e.target.value }))} className={`w-full px-2 py-1.5 border rounded-lg text-xs ${newErrors.hazard_identified ? 'border-critical' : 'border-surface-300'}`} placeholder="e.g. Dust" />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input value={newRow.monitoring_method} onChange={(e) => setNewRow((s) => ({ ...s, monitoring_method: e.target.value }))} className={`w-full px-2 py-1.5 border rounded-lg text-xs ${newErrors.monitoring_method ? 'border-critical' : 'border-surface-300'}`} placeholder="e.g. Personal sampling" />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input value={newRow.equipment_used} onChange={(e) => setNewRow((s) => ({ ...s, equipment_used: e.target.value }))} className="w-full px-2 py-1.5 border border-surface-300 rounded-lg text-xs" placeholder="e.g. Dust sampler" />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input value={newRow.exposure_limit} onChange={(e) => setNewRow((s) => ({ ...s, exposure_limit: e.target.value }))} className="w-full px-2 py-1.5 border border-surface-300 rounded-lg text-xs" placeholder="e.g. OEL limit / 85 dB" />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input value={newRow.result_obtained} onChange={(e) => setNewRow((s) => ({ ...s, result_obtained: e.target.value }))} className={`w-full px-2 py-1.5 border rounded-lg text-xs ${newErrors.result_obtained ? 'border-critical' : 'border-surface-300'}`} placeholder="e.g. Within limit" />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <select value={newCompliance} onChange={(e) => setNewCompliance(e.target.value as HygieneComplianceChoice | '')} className={`w-full px-2 py-1.5 border rounded-lg text-xs ${newErrors.compliance ? 'border-critical' : 'border-surface-300'}`}>
                        <option value="">Select</option>
                        <option value="YES">Yes</option>
                        <option value="NO">No</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <textarea value={newRow.comments} onChange={(e) => setNewRow((s) => ({ ...s, comments: e.target.value }))} className="w-full px-2 py-1.5 border border-surface-300 rounded-lg text-xs min-h-[40px]" placeholder="Notes or observations" />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input type="file" accept={ACCEPTED_FILE_TYPES.join(',')} multiple onChange={(e) => setNewFiles(Array.from(e.target.files ?? []))} className="w-full text-xs" />
                      {newFiles.length > 0 && <p className="mt-1 text-[11px] text-charcoal-500">Selected: {newFiles.map((f) => f.name).join(', ')}</p>}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <button type="submit" disabled={savingCreate} className="px-3 py-1.5 rounded-lg bg-teal text-white text-xs font-semibold hover:bg-teal-600 disabled:opacity-60">
                        {savingCreate ? 'Saving...' : 'Save'}
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
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 rounded-lg text-sm border ${tab === t ? 'bg-teal text-white border-teal' : 'bg-white border-surface-300 text-charcoal'}`}>
              {t}
            </button>
          ))}
        </div>

        <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
          <table className="w-full text-sm table-fixed min-w-[1100px]">
            <thead className="bg-surface-50">
              <tr>
                <th className="px-3 py-2 text-left">Work Area / Location</th>
                <th className="px-3 py-2 text-left">Department</th>
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
                const docs = evidenceByRecord.get(r.id) ?? [];
                const docCount = docs.length;
                const details = getDetailsFromRecord(r);
                const isEditing = editingId === r.id;
                const complianceChoice = isEditing ? editCompliance : mapComplianceToChoice(r.compliance_status);
                return (
                  <tr key={r.id} className={r.compliance_status === 'NON_COMPLIANT' ? 'bg-critical/5' : ''}>
                    <td className="px-3 py-2 align-top">
                      {isEditing ? (
                        <input value={editRow?.work_area ?? ''} onChange={(e) => setEditRow((s) => (s ? { ...s, work_area: e.target.value } : s))} className="w-full px-2 py-1.5 border border-surface-300 rounded-lg text-xs" />
                      ) : (
                        details.work_area || '-'
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isEditing ? (
                        <input value={editRow?.department ?? ''} onChange={(e) => setEditRow((s) => (s ? { ...s, department: e.target.value } : s))} className="w-full px-2 py-1.5 border border-surface-300 rounded-lg text-xs" />
                      ) : (
                        details.department || '-'
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isEditing ? (
                        <input value={editRow?.process_activity ?? ''} onChange={(e) => setEditRow((s) => (s ? { ...s, process_activity: e.target.value } : s))} className="w-full px-2 py-1.5 border border-surface-300 rounded-lg text-xs" />
                      ) : (
                        details.process_activity || '-'
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isEditing ? (
                        <input value={editRow?.hazard_identified ?? ''} onChange={(e) => setEditRow((s) => (s ? { ...s, hazard_identified: e.target.value } : s))} className="w-full px-2 py-1.5 border border-surface-300 rounded-lg text-xs" />
                      ) : (
                        details.hazard_identified || '-'
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isEditing ? (
                        <input value={editRow?.monitoring_method ?? ''} onChange={(e) => setEditRow((s) => (s ? { ...s, monitoring_method: e.target.value } : s))} className="w-full px-2 py-1.5 border border-surface-300 rounded-lg text-xs" />
                      ) : (
                        details.monitoring_method || '-'
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isEditing ? (
                        <input value={editRow?.equipment_used ?? ''} onChange={(e) => setEditRow((s) => (s ? { ...s, equipment_used: e.target.value } : s))} className="w-full px-2 py-1.5 border border-surface-300 rounded-lg text-xs" />
                      ) : (
                        details.equipment_used || '-'
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isEditing ? (
                        <input value={editRow?.exposure_limit ?? ''} onChange={(e) => setEditRow((s) => (s ? { ...s, exposure_limit: e.target.value } : s))} className="w-full px-2 py-1.5 border border-surface-300 rounded-lg text-xs" />
                      ) : (
                        details.exposure_limit || '-'
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isEditing ? (
                        <input value={editRow?.result_obtained ?? ''} onChange={(e) => setEditRow((s) => (s ? { ...s, result_obtained: e.target.value } : s))} className="w-full px-2 py-1.5 border border-surface-300 rounded-lg text-xs" />
                      ) : (
                        details.result_obtained || '-'
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isEditing ? (
                        <select value={editCompliance} onChange={(e) => setEditCompliance(e.target.value as HygieneComplianceChoice | '')} className="w-full px-2 py-1.5 border border-surface-300 rounded-lg text-xs">
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
                        <textarea value={editRow?.comments ?? ''} onChange={(e) => setEditRow((s) => (s ? { ...s, comments: e.target.value } : s))} className="w-full px-2 py-1.5 border border-surface-300 rounded-lg text-xs min-h-[40px]" />
                      ) : (
                        details.comments || '-'
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center gap-2">
                        <button type="button" className="px-2 py-1.5 rounded-lg bg-surface-200 text-xs text-charcoal hover:bg-surface-300" onClick={() => setEvidenceForId(r.id)}>
                          Documents
                        </button>
                        {docCount > 0 && <span className="px-2 py-0.5 rounded-full bg-teal/10 text-teal text-xs font-semibold">{docCount}</span>}
                      </div>
                      {docCount > 0 && <p className="mt-1 text-[11px] text-charcoal-500 truncate">Uploaded: {docs.slice(0, 2).map((d) => d.display_title ?? d.original_filename ?? 'Document').join(', ')}</p>}
                    </td>
                    <td className="px-3 py-2 align-top space-x-2">
                      {isEditing ? (
                        <>
                          <button type="button" disabled={savingEditId === r.id} className="px-2 py-1.5 rounded-lg bg-teal text-white text-xs font-semibold hover:bg-teal-600 disabled:opacity-60" onClick={() => void saveEdit(r)}>
                            {savingEditId === r.id ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            type="button"
                            className="px-2 py-1.5 rounded-lg bg-surface-200 text-xs text-charcoal hover:bg-surface-300"
                            onClick={() => {
                              clearDraft(draftKeyEdit);
                              setEditBaseline(null);
                              setEditingId(null);
                              setEditRow(null);
                              setEditCompliance('');
                            }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="px-2 py-1.5 rounded-lg bg-surface-200 text-xs text-charcoal hover:bg-surface-300" onClick={() => beginEdit(r)}>
                            Edit
                          </button>
                          <button type="button" className="px-2 py-1.5 rounded-lg bg-critical text-white text-xs font-semibold hover:opacity-90" onClick={() => void removeRecord(r)}>
                            Delete
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {activeCompanyId && user?.id && evidenceForId && (
          <EvidenceModal open={!!evidenceForId} onClose={() => setEvidenceForId(null)} companyId={activeCompanyId} actorUserId={user.id} entityType="health_hygiene_record" entityId={evidenceForId} title="Hygiene monitoring documents" />
        )}
      </div>
    </Layout>
  );
}
