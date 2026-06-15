import React, { useEffect, useMemo, useState } from 'react';
import { useUser } from '@insforge/react';
import { Layout } from '../../components/layout/Layout';
import { EvidenceModal } from '../../components/evidence/EvidenceModal';
import { HrEmployeeSelect } from '../../components/ui/HrEmployeeSelect';
import { useAsync } from '../../api/hooks/useAsync';
import type { EvidenceAttachment, HealthHygieneRecord, UUID } from '../../api/models/entities';
import { listEvidenceForEntityType } from '../../api/services/evidenceService';
import { createHealthHygieneRecord, deleteHealthHygieneRecord, listHealthHygieneRecords, updateHealthHygieneRecord } from '../../api/services/healthService';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';
import { useTenant } from '../../tenant/TenantContext';
import { toUserFacingError } from '../../utils/userFacingMessage';

type HygieneComplianceChoice = 'YES' | 'NO';

type HygieneFormState = {
  workArea: string;
  processActivity: string;
  department: string;
  employeeId: string;
  employeeUserId: string;
  employeeName: string;
  employeeNumber: string;
  hazardIdentified: string;
  monitoringMethod: string;
  equipmentUsed: string;
  exposureLimit: string;
  resultObtained: string;
  nonComplianceReason: string;
  comments: string;
};

type HygieneFormErrors = Record<
  | 'workArea'
  | 'processActivity'
  | 'department'
  | 'employee'
  | 'hazardIdentified'
  | 'monitoringMethod'
  | 'resultObtained'
  | 'nonComplianceReason'
  | 'compliance',
  string
>;

function emptyForm(): HygieneFormState {
  return {
    workArea: '',
    processActivity: '',
    department: '',
    employeeId: '',
    employeeUserId: '',
    employeeName: '',
    employeeNumber: '',
    hazardIdentified: '',
    monitoringMethod: '',
    equipmentUsed: '',
    exposureLimit: '',
    resultObtained: '',
    nonComplianceReason: '',
    comments: ''
  };
}

function emptyErrors(): HygieneFormErrors {
  return {
    workArea: '',
    processActivity: '',
    department: '',
    employee: '',
    hazardIdentified: '',
    monitoringMethod: '',
    resultObtained: '',
    nonComplianceReason: '',
    compliance: ''
  };
}

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

function getRecordDetails(record: HealthHygieneRecord): Record<string, unknown> {
  return (record.result_details ?? {}) as Record<string, unknown>;
}

function getFormFromRecord(record: HealthHygieneRecord): HygieneFormState {
  const details = getRecordDetails(record);
  return {
    workArea: String(details.work_area ?? record.site_location ?? ''),
    processActivity: String(details.process_activity ?? record.monitoring_type ?? ''),
    department: String(details.department ?? record.department ?? ''),
    employeeId: String(details.employee_id ?? ''),
    employeeUserId: String(details.employee_user_id ?? ''),
    employeeName: String(details.employee_name ?? ''),
    employeeNumber: String(details.employee_number ?? ''),
    hazardIdentified: String(details.hazard_identified ?? ''),
    monitoringMethod: String(details.monitoring_method ?? record.method_or_standard ?? ''),
    equipmentUsed: String(details.equipment_used ?? ''),
    exposureLimit: String(details.exposure_limit ?? ''),
    resultObtained: String(details.result_obtained ?? record.results_summary ?? ''),
    nonComplianceReason: String(details.offence_type ?? record.non_compliance_reason ?? ''),
    comments: String(details.comments ?? '')
  };
}

function buildResultDetails(form: HygieneFormState, existing?: Record<string, unknown>) {
  return {
    ...(existing ?? {}),
    work_area: form.workArea,
    process_activity: form.processActivity,
    department: form.department,
    employee_id: form.employeeId || null,
    employee_user_id: form.employeeUserId || null,
    employee_name: form.employeeName || null,
    employee_number: form.employeeNumber || null,
    hazard_identified: form.hazardIdentified,
    monitoring_method: form.monitoringMethod,
    equipment_used: form.equipmentUsed,
    exposure_limit: form.exposureLimit,
    result_obtained: form.resultObtained,
    offence_type: form.nonComplianceReason || null,
    comments: form.comments
  };
}

function summarizeDocuments(items: EvidenceAttachment[]): string {
  const names = items
    .map((item) => item.display_title ?? item.original_filename ?? item.title ?? 'Document')
    .filter(Boolean);
  if (names.length === 0) return 'Documents uploaded: none';
  if (names.length <= 3) return `Documents uploaded: ${names.join(', ')}`;
  return `Documents uploaded: ${names.slice(0, 3).join(', ')} +${names.length - 3} more`;
}

const tabs = ['Monitoring Records'] as const;
type TabKey = (typeof tabs)[number];

export function HealthHygienePage() {
  const { user } = useUser();
  const { activeCompanyId } = useTenant();
  const { restoreDraft, clearDraft } = useDraftManager();

  const [tab, setTab] = useState<TabKey>('Monitoring Records');
  const [refreshKey, setRefreshKey] = useState(0);
  const [createForm, setCreateForm] = useState<HygieneFormState>(emptyForm);
  const [editForm, setEditForm] = useState<HygieneFormState | null>(null);
  const [createCompliance, setCreateCompliance] = useState<HygieneComplianceChoice | ''>('');
  const [editCompliance, setEditCompliance] = useState<HygieneComplianceChoice | ''>('');
  const [createErrors, setCreateErrors] = useState<HygieneFormErrors>(emptyErrors);
  const [editErrors, setEditErrors] = useState<HygieneFormErrors>(emptyErrors);
  const [editingId, setEditingId] = useState<UUID | null>(null);
  const [evidenceForId, setEvidenceForId] = useState<UUID | null>(null);
  const [savingCreate, setSavingCreate] = useState(false);
  const [savingEditId, setSavingEditId] = useState<UUID | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [uploadSummaryByRecordId, setUploadSummaryByRecordId] = useState<Record<string, string>>({});

  type HygieneCreateDraft = {
    form: HygieneFormState;
    compliance: HygieneComplianceChoice | '';
  };

  type HygieneEditDraft = {
    form: HygieneFormState;
    compliance: HygieneComplianceChoice | '';
  };

  const draftKeyCreate = `health-hygiene-create:${activeCompanyId ?? 'none'}:${user?.id ?? 'anon'}`;
  const draftKeyEdit = `health-hygiene-edit:${activeCompanyId ?? 'none'}:${user?.id ?? 'anon'}:${editingId ?? 'none'}`;

  const [createBaseline, setCreateBaseline] = useState<HygieneCreateDraft>({
    form: emptyForm(),
    compliance: ''
  });
  const [editBaseline, setEditBaseline] = useState<HygieneEditDraft | null>(null);

  const hasDirtyCreateDraft = JSON.stringify({ form: createForm, compliance: createCompliance }) !== JSON.stringify(createBaseline);
  const hasDirtyEditDraft =
    !!editBaseline && !!editForm && JSON.stringify({ form: editForm, compliance: editCompliance }) !== JSON.stringify(editBaseline);

  useDraftRegistration({
    key: draftKeyCreate,
    enabled: Boolean(activeCompanyId && user?.id && !editingId),
    isDirty: () => hasDirtyCreateDraft,
    serialize: () => ({ form: createForm, compliance: createCompliance })
  });

  useDraftRegistration({
    key: draftKeyEdit,
    enabled: Boolean(activeCompanyId && user?.id && editingId && editForm),
    isDirty: () => hasDirtyEditDraft,
    serialize: () => ({ form: editForm!, compliance: editCompliance })
  });

  useEffect(() => {
    if (!activeCompanyId || !user?.id || editingId) return;
    const restored = restoreDraft<HygieneCreateDraft>(draftKeyCreate);
    if (!restored) return;
    setCreateForm(restored.form);
    setCreateCompliance(restored.compliance);
    setCreateBaseline(restored);
  }, [activeCompanyId, draftKeyCreate, editingId, restoreDraft, user?.id]);

  useEffect(() => {
    if (!activeCompanyId || !user?.id || !editingId || !editForm) return;
    const restored = restoreDraft<HygieneEditDraft>(draftKeyEdit);
    if (restored) {
      setEditForm(restored.form);
      setEditCompliance(restored.compliance);
      setEditBaseline(restored);
      return;
    }
    setEditBaseline({ form: editForm, compliance: editCompliance });
  }, [activeCompanyId, draftKeyEdit, editCompliance, editForm, editingId, restoreDraft, user?.id]);

  const { data: records, loading: recordsLoading } = useAsync<HealthHygieneRecord[]>(async () => {
    if (!activeCompanyId) return [];
    return await listHealthHygieneRecords({ companyId: activeCompanyId, limit: 300 });
  }, [activeCompanyId, refreshKey]);

  const { data: hygieneEvidence } = useAsync<EvidenceAttachment[]>(async () => {
    if (!activeCompanyId) return [];
    return await listEvidenceForEntityType(activeCompanyId, 'health_hygiene_record', 2000);
  }, [activeCompanyId, refreshKey]);

  const evidenceByRecordId = useMemo(() => {
    const grouped = new Map<string, EvidenceAttachment[]>();
    for (const item of hygieneEvidence ?? []) {
      const key = String(item.entity_id);
      grouped.set(key, [...(grouped.get(key) ?? []), item]);
    }
    return grouped;
  }, [hygieneEvidence]);

  function validateForm(form: HygieneFormState, compliance: HygieneComplianceChoice | ''): HygieneFormErrors {
    const errors = emptyErrors();
    if (!form.workArea.trim()) errors.workArea = 'Required';
    if (!form.processActivity.trim()) errors.processActivity = 'Required';
    if (!form.department.trim()) errors.department = 'Required';
    if (!form.hazardIdentified.trim()) errors.hazardIdentified = 'Required';
    if (!form.monitoringMethod.trim()) errors.monitoringMethod = 'Required';
    if (!form.resultObtained.trim()) errors.resultObtained = 'Required';
    if (!compliance) errors.compliance = 'Required';
    if (compliance === 'NO') {
      if (!form.employeeUserId) errors.employee = 'Select the employee linked to this warning.';
      else if (!form.employeeId) errors.employee = 'Employee record not linked correctly; contact admin.';
      if (!form.nonComplianceReason.trim()) errors.nonComplianceReason = 'Required for non-compliance.';
    }
    return errors;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCompanyId || !user?.id || savingCreate) return;
    setSaveError(null);
    setSaveSuccess(null);
    const errors = validateForm(createForm, createCompliance);
    setCreateErrors(errors);
    if (Object.values(errors).some(Boolean)) return;

    try {
      setSavingCreate(true);
      await createHealthHygieneRecord({
        companyId: activeCompanyId,
        monitoringType: createForm.processActivity,
        siteLocation: createForm.workArea || null,
        department: createForm.department || null,
        monitoredOn: new Date().toISOString().slice(0, 10),
        conductedBy: null,
        methodOrStandard: createForm.monitoringMethod || null,
        resultsSummary: createForm.resultObtained || null,
        resultDetails: buildResultDetails(createForm),
        complianceStatus: mapChoiceToCompliance(createCompliance as HygieneComplianceChoice),
        nonComplianceReason: createCompliance === 'NO' ? createForm.nonComplianceReason || null : null,
        linkedRiskAssessmentIds: [],
        createdByUserId: user.id
      });
      setRefreshKey((value) => value + 1);
      const clearedForm = emptyForm();
      setCreateForm(clearedForm);
      setCreateCompliance('');
      setCreateErrors(emptyErrors());
      setCreateBaseline({ form: clearedForm, compliance: '' });
      clearDraft(draftKeyCreate);
      setSaveSuccess('Saved successfully.');
    } catch (error) {
      setSaveError(error instanceof Error ? toUserFacingError(error, 'Unable to save this hygiene record.') : 'Unable to save this hygiene record.');
    } finally {
      setSavingCreate(false);
    }
  }

  function beginEdit(record: HealthHygieneRecord) {
    const nextForm = getFormFromRecord(record);
    const nextCompliance = mapComplianceToChoice(record.compliance_status) ?? '';
    setEditingId(record.id);
    setEditForm(nextForm);
    setEditCompliance(nextCompliance);
    setEditErrors(emptyErrors());
    setEditBaseline({ form: nextForm, compliance: nextCompliance });
    setSaveError(null);
    setSaveSuccess(null);
  }

  function cancelEdit() {
    clearDraft(draftKeyEdit);
    setEditingId(null);
    setEditForm(null);
    setEditCompliance('');
    setEditErrors(emptyErrors());
    setEditBaseline(null);
  }

  async function saveEdit(record: HealthHygieneRecord) {
    if (!activeCompanyId || !user?.id || !editForm || savingEditId === record.id) return;
    setSaveError(null);
    setSaveSuccess(null);
    const errors = validateForm(editForm, editCompliance);
    setEditErrors(errors);
    if (Object.values(errors).some(Boolean)) return;

    try {
      setSavingEditId(record.id);
      await updateHealthHygieneRecord(
        activeCompanyId,
        record.id,
        {
          site_location: editForm.workArea || null,
          department: editForm.department || null,
          monitoring_type: editForm.processActivity || record.monitoring_type,
          method_or_standard: editForm.monitoringMethod || null,
          results_summary: editForm.resultObtained || null,
          non_compliance_reason: editCompliance === 'NO' ? editForm.nonComplianceReason || null : null,
          result_details: buildResultDetails(editForm, getRecordDetails(record)),
          compliance_status: mapChoiceToCompliance(editCompliance as HygieneComplianceChoice)
        },
        user.id
      );
      clearDraft(draftKeyEdit);
      setRefreshKey((value) => value + 1);
      setSaveSuccess('Saved successfully.');
      setEditingId(null);
      setEditForm(null);
      setEditCompliance('');
      setEditErrors(emptyErrors());
      setEditBaseline(null);
    } catch (error) {
      setSaveError(error instanceof Error ? toUserFacingError(error, 'Unable to update this hygiene record.') : 'Unable to update this hygiene record.');
    } finally {
      setSavingEditId(null);
    }
  }

  async function removeRecord(recordId: UUID) {
    if (!activeCompanyId || !user?.id) return;
    if (!window.confirm('Are you sure you want to delete this record?')) return;
    try {
      await deleteHealthHygieneRecord(activeCompanyId, recordId, user.id);
      if (editingId === recordId) cancelEdit();
      if (evidenceForId === recordId) setEvidenceForId(null);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setSaveError(toUserFacingError(error, 'Unable to delete this hygiene record.'));
    }
  }

  return (
    <Layout title="Occupational Hygiene Monitoring">
      <div className="space-y-5">
        <div className="bg-white border border-surface-300 rounded-xl p-4">
          <h3 className="font-semibold text-charcoal mb-3">Add hygiene monitoring record</h3>
          {saveSuccess && <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{saveSuccess}</div>}
          {saveError && <div className="mb-3 rounded-lg border border-critical/20 bg-critical/5 px-3 py-2 text-sm text-critical">{saveError}</div>}
          <form onSubmit={submit}>
            <div className="overflow-auto">
              <table className="w-full text-sm table-fixed min-w-[1400px]">
                <thead className="bg-surface-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Work Area / Location</th>
                    <th className="px-3 py-2 text-left">Department</th>
                    <th className="px-3 py-2 text-left">Employee</th>
                    <th className="px-3 py-2 text-left">Process / Activity</th>
                    <th className="px-3 py-2 text-left">Hazard Identified</th>
                    <th className="px-3 py-2 text-left">Monitoring Method</th>
                    <th className="px-3 py-2 text-left">Equipment Used</th>
                    <th className="px-3 py-2 text-left">Exposure Limit</th>
                    <th className="px-3 py-2 text-left">Result Obtained</th>
                    <th className="px-3 py-2 text-left">Compliance</th>
                    <th className="px-3 py-2 text-left">Offence / Reason</th>
                    <th className="px-3 py-2 text-left">Comments</th>
                    <th className="px-3 py-2 text-left">Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-3 py-2 align-top">
                      <input
                        value={createForm.workArea}
                        onChange={(e) => setCreateForm((state) => ({ ...state, workArea: e.target.value }))}
                        className={`w-full px-2 py-1.5 border rounded-lg text-xs ${createErrors.workArea ? 'border-critical' : 'border-surface-300'}`}
                        placeholder="e.g. Crushing Area"
                        disabled={savingCreate}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        value={createForm.department}
                        onChange={(e) => setCreateForm((state) => ({ ...state, department: e.target.value }))}
                        className={`w-full px-2 py-1.5 border rounded-lg text-xs ${createErrors.department ? 'border-critical' : 'border-surface-300'}`}
                        placeholder="e.g. Processing"
                        disabled={savingCreate}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <HrEmployeeSelect
                        companyId={activeCompanyId ?? null}
                        value={createForm.employeeUserId as UUID | ''}
                        valueField="user_id"
                        label=""
                        placeholder="Select linked employee"
                        disabled={savingCreate}
                        onChange={(userId, meta) =>
                          setCreateForm((state) => ({
                            ...state,
                            employeeUserId: userId || '',
                            employeeId: String(meta.employeeId ?? ''),
                            employeeName: meta.nameSnapshot,
                            employeeNumber: meta.employeeNumber ?? ''
                          }))
                        }
                      />
                      {createForm.employeeNumber && <p className="mt-1 text-[11px] text-charcoal-500">Employee no: {createForm.employeeNumber}</p>}
                      {createErrors.employee && <p className="mt-1 text-[11px] text-critical">{createErrors.employee}</p>}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        value={createForm.processActivity}
                        onChange={(e) => setCreateForm((state) => ({ ...state, processActivity: e.target.value }))}
                        className={`w-full px-2 py-1.5 border rounded-lg text-xs ${createErrors.processActivity ? 'border-critical' : 'border-surface-300'}`}
                        placeholder="e.g. Stone crushing"
                        disabled={savingCreate}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        value={createForm.hazardIdentified}
                        onChange={(e) => setCreateForm((state) => ({ ...state, hazardIdentified: e.target.value }))}
                        className={`w-full px-2 py-1.5 border rounded-lg text-xs ${createErrors.hazardIdentified ? 'border-critical' : 'border-surface-300'}`}
                        placeholder="e.g. Dust"
                        disabled={savingCreate}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        value={createForm.monitoringMethod}
                        onChange={(e) => setCreateForm((state) => ({ ...state, monitoringMethod: e.target.value }))}
                        className={`w-full px-2 py-1.5 border rounded-lg text-xs ${createErrors.monitoringMethod ? 'border-critical' : 'border-surface-300'}`}
                        placeholder="e.g. Personal sampling"
                        disabled={savingCreate}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        value={createForm.equipmentUsed}
                        onChange={(e) => setCreateForm((state) => ({ ...state, equipmentUsed: e.target.value }))}
                        className="w-full px-2 py-1.5 border border-surface-300 rounded-lg text-xs"
                        placeholder="e.g. Dust sampler"
                        disabled={savingCreate}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        value={createForm.exposureLimit}
                        onChange={(e) => setCreateForm((state) => ({ ...state, exposureLimit: e.target.value }))}
                        className="w-full px-2 py-1.5 border border-surface-300 rounded-lg text-xs"
                        placeholder="e.g. OEL limit / 85 dB"
                        disabled={savingCreate}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        value={createForm.resultObtained}
                        onChange={(e) => setCreateForm((state) => ({ ...state, resultObtained: e.target.value }))}
                        className={`w-full px-2 py-1.5 border rounded-lg text-xs ${createErrors.resultObtained ? 'border-critical' : 'border-surface-300'}`}
                        placeholder="e.g. Within limit"
                        disabled={savingCreate}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <select
                        value={createCompliance}
                        onChange={(e) => setCreateCompliance(e.target.value as HygieneComplianceChoice | '')}
                        className={`w-full px-2 py-1.5 border rounded-lg text-xs ${createErrors.compliance ? 'border-critical' : 'border-surface-300'}`}
                        disabled={savingCreate}
                      >
                        <option value="">Select</option>
                        <option value="YES">Yes</option>
                        <option value="NO">No</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        value={createForm.nonComplianceReason}
                        onChange={(e) => setCreateForm((state) => ({ ...state, nonComplianceReason: e.target.value }))}
                        className={`w-full px-2 py-1.5 border rounded-lg text-xs ${createErrors.nonComplianceReason ? 'border-critical' : 'border-surface-300'}`}
                        placeholder="Required when non-compliant"
                        disabled={savingCreate || createCompliance !== 'NO'}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <textarea
                        value={createForm.comments}
                        onChange={(e) => setCreateForm((state) => ({ ...state, comments: e.target.value }))}
                        className="w-full px-2 py-1.5 border border-surface-300 rounded-lg text-xs min-h-[40px]"
                        placeholder="Notes or observations"
                        disabled={savingCreate}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <button
                        type="submit"
                        disabled={savingCreate}
                        className="px-3 py-1.5 rounded-lg bg-teal text-white text-xs font-semibold hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-60"
                      >
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
          {tabs.map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={`px-3 py-2 rounded-lg text-sm border ${tab === item ? 'bg-teal text-white border-teal' : 'bg-white border-surface-300 text-charcoal'}`}
            >
              {item}
            </button>
          ))}
        </div>

        {recordsLoading && <div className="text-center py-8 text-sm text-charcoal-500">Loading hygiene monitoring records…</div>}
        {!recordsLoading && (records ?? []).length === 0 && (
          <div className="text-center py-8 text-sm text-charcoal-500">No hygiene monitoring records yet. Add the first record using the form above.</div>
        )}
        {!recordsLoading && (records ?? []).length > 0 && (
        <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
          <table className="w-full text-sm table-fixed min-w-[1600px]">
            <thead className="bg-surface-50">
              <tr>
                <th className="px-3 py-2 text-left">Work Area / Location</th>
                <th className="px-3 py-2 text-left">Department</th>
                <th className="px-3 py-2 text-left">Employee</th>
                <th className="px-3 py-2 text-left">Process / Activity</th>
                <th className="px-3 py-2 text-left">Hazard Identified</th>
                <th className="px-3 py-2 text-left">Monitoring Method</th>
                <th className="px-3 py-2 text-left">Equipment Used</th>
                <th className="px-3 py-2 text-left">Exposure Limit</th>
                <th className="px-3 py-2 text-left">Result Obtained</th>
                <th className="px-3 py-2 text-left">Compliance</th>
                <th className="px-3 py-2 text-left">Offence / Reason</th>
                <th className="px-3 py-2 text-left">Repeat Warnings</th>
                <th className="px-3 py-2 text-left">Comments</th>
                <th className="px-3 py-2 text-left">Documents</th>
                <th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {(records ?? []).map((record) => {
                const details = getRecordDetails(record);
                const isEditing = editingId === record.id;
                const rowForm = isEditing ? editForm : getFormFromRecord(record);
                const rowErrors = isEditing ? editErrors : emptyErrors();
                const rowCompliance = isEditing ? editCompliance : mapComplianceToChoice(record.compliance_status) ?? '';
                const rowEvidence = evidenceByRecordId.get(String(record.id)) ?? [];
                const repeatCount = Number(details.repeat_count ?? 0);

                if (!rowForm) return null;

                return (
                  <tr key={record.id} className={record.compliance_status === 'NON_COMPLIANT' ? 'bg-critical/5' : ''}>
                    <td className="px-3 py-2 align-top">
                      {isEditing ? (
                        <input
                          value={rowForm.workArea}
                          onChange={(e) => setEditForm((state) => (state ? { ...state, workArea: e.target.value } : state))}
                          className={`w-full px-2 py-1.5 border rounded-lg text-xs ${rowErrors.workArea ? 'border-critical' : 'border-surface-300'}`}
                          disabled={savingEditId === record.id}
                        />
                      ) : (
                        rowForm.workArea || '-'
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isEditing ? (
                        <input
                          value={rowForm.department}
                          onChange={(e) => setEditForm((state) => (state ? { ...state, department: e.target.value } : state))}
                          className={`w-full px-2 py-1.5 border rounded-lg text-xs ${rowErrors.department ? 'border-critical' : 'border-surface-300'}`}
                          disabled={savingEditId === record.id}
                        />
                      ) : (
                        rowForm.department || '-'
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isEditing ? (
                        <>
                          <HrEmployeeSelect
                            companyId={activeCompanyId ?? null}
                            value={rowForm.employeeUserId as UUID | ''}
                            valueField="user_id"
                            label=""
                            placeholder="Select linked employee"
                            disabled={savingEditId === record.id}
                            onChange={(userId, meta) =>
                              setEditForm((state) =>
                                state
                                  ? {
                                      ...state,
                                      employeeUserId: userId || '',
                                      employeeId: String(meta.employeeId ?? ''),
                                      employeeName: meta.nameSnapshot,
                                      employeeNumber: meta.employeeNumber ?? ''
                                    }
                                  : state
                              )
                            }
                          />
                          {rowForm.employeeNumber && <p className="mt-1 text-[11px] text-charcoal-500">Employee no: {rowForm.employeeNumber}</p>}
                          {rowErrors.employee && <p className="mt-1 text-[11px] text-critical">{rowErrors.employee}</p>}
                        </>
                      ) : (
                        rowForm.employeeName || rowForm.employeeNumber || '-'
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isEditing ? (
                        <input
                          value={rowForm.processActivity}
                          onChange={(e) => setEditForm((state) => (state ? { ...state, processActivity: e.target.value } : state))}
                          className={`w-full px-2 py-1.5 border rounded-lg text-xs ${rowErrors.processActivity ? 'border-critical' : 'border-surface-300'}`}
                          disabled={savingEditId === record.id}
                        />
                      ) : (
                        rowForm.processActivity || '-'
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isEditing ? (
                        <input
                          value={rowForm.hazardIdentified}
                          onChange={(e) => setEditForm((state) => (state ? { ...state, hazardIdentified: e.target.value } : state))}
                          className={`w-full px-2 py-1.5 border rounded-lg text-xs ${rowErrors.hazardIdentified ? 'border-critical' : 'border-surface-300'}`}
                          disabled={savingEditId === record.id}
                        />
                      ) : (
                        rowForm.hazardIdentified || '-'
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isEditing ? (
                        <input
                          value={rowForm.monitoringMethod}
                          onChange={(e) => setEditForm((state) => (state ? { ...state, monitoringMethod: e.target.value } : state))}
                          className={`w-full px-2 py-1.5 border rounded-lg text-xs ${rowErrors.monitoringMethod ? 'border-critical' : 'border-surface-300'}`}
                          disabled={savingEditId === record.id}
                        />
                      ) : (
                        rowForm.monitoringMethod || '-'
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isEditing ? (
                        <input
                          value={rowForm.equipmentUsed}
                          onChange={(e) => setEditForm((state) => (state ? { ...state, equipmentUsed: e.target.value } : state))}
                          className="w-full px-2 py-1.5 border border-surface-300 rounded-lg text-xs"
                          disabled={savingEditId === record.id}
                        />
                      ) : (
                        rowForm.equipmentUsed || '-'
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isEditing ? (
                        <input
                          value={rowForm.exposureLimit}
                          onChange={(e) => setEditForm((state) => (state ? { ...state, exposureLimit: e.target.value } : state))}
                          className="w-full px-2 py-1.5 border border-surface-300 rounded-lg text-xs"
                          disabled={savingEditId === record.id}
                        />
                      ) : (
                        rowForm.exposureLimit || '-'
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isEditing ? (
                        <input
                          value={rowForm.resultObtained}
                          onChange={(e) => setEditForm((state) => (state ? { ...state, resultObtained: e.target.value } : state))}
                          className={`w-full px-2 py-1.5 border rounded-lg text-xs ${rowErrors.resultObtained ? 'border-critical' : 'border-surface-300'}`}
                          disabled={savingEditId === record.id}
                        />
                      ) : (
                        rowForm.resultObtained || '-'
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isEditing ? (
                        <select
                          value={rowCompliance}
                          onChange={(e) => setEditCompliance(e.target.value as HygieneComplianceChoice | '')}
                          className={`w-full px-2 py-1.5 border rounded-lg text-xs ${rowErrors.compliance ? 'border-critical' : 'border-surface-300'}`}
                          disabled={savingEditId === record.id}
                        >
                          <option value="">Select</option>
                          <option value="YES">Yes</option>
                          <option value="NO">No</option>
                        </select>
                      ) : rowCompliance === 'YES' ? (
                        'Yes'
                      ) : rowCompliance === 'NO' ? (
                        'No'
                      ) : (
                        record.compliance_status
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isEditing ? (
                        <>
                          <input
                            value={rowForm.nonComplianceReason}
                            onChange={(e) => setEditForm((state) => (state ? { ...state, nonComplianceReason: e.target.value } : state))}
                            className={`w-full px-2 py-1.5 border rounded-lg text-xs ${rowErrors.nonComplianceReason ? 'border-critical' : 'border-surface-300'}`}
                            disabled={savingEditId === record.id || rowCompliance !== 'NO'}
                          />
                          {rowErrors.nonComplianceReason && <p className="mt-1 text-[11px] text-critical">{rowErrors.nonComplianceReason}</p>}
                        </>
                      ) : (
                        rowForm.nonComplianceReason || '-'
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${repeatCount > 0 ? 'bg-warning/10 text-warning-700' : 'bg-surface-100 text-charcoal-600'}`}>
                        {repeatCount}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isEditing ? (
                        <textarea
                          value={rowForm.comments}
                          onChange={(e) => setEditForm((state) => (state ? { ...state, comments: e.target.value } : state))}
                          className="w-full px-2 py-1.5 border border-surface-300 rounded-lg text-xs min-h-[40px]"
                          disabled={savingEditId === record.id}
                        />
                      ) : (
                        rowForm.comments || '-'
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="space-y-2">
                        <button
                          type="button"
                          className="px-2 py-1.5 rounded-lg bg-surface-200 text-xs text-charcoal hover:bg-surface-300"
                          onClick={() => setEvidenceForId(record.id)}
                        >
                          Documents
                        </button>
                        <p className="text-[11px] text-charcoal-500">
                          {uploadSummaryByRecordId[String(record.id)] ?? summarizeDocuments(rowEvidence)}
                        </p>
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top space-x-2">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            className="px-2 py-1.5 rounded-lg bg-teal text-white text-xs font-semibold hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => void saveEdit(record)}
                            disabled={savingEditId === record.id}
                          >
                            {savingEditId === record.id ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            type="button"
                            className="px-2 py-1.5 rounded-lg bg-surface-200 text-xs text-charcoal hover:bg-surface-300"
                            onClick={cancelEdit}
                            disabled={savingEditId === record.id}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="px-2 py-1.5 rounded-lg bg-surface-200 text-xs text-charcoal hover:bg-surface-300"
                            onClick={() => beginEdit(record)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="px-2 py-1.5 rounded-lg border border-critical/30 text-critical text-xs hover:bg-critical/5"
                            onClick={() => void removeRecord(record.id)}
                          >
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
        )}

        {activeCompanyId && user?.id && evidenceForId && (
          <EvidenceModal
            open={!!evidenceForId}
            onClose={() => setEvidenceForId(null)}
            companyId={activeCompanyId}
            actorUserId={user.id}
            entityType="health_hygiene_record"
            entityId={evidenceForId}
            title="Hygiene monitoring documents"
            onUploaded={(items) => {
              setUploadSummaryByRecordId((state) => ({
                ...state,
                [String(evidenceForId)]: summarizeDocuments(items)
              }));
              setRefreshKey((value) => value + 1);
            }}
          />
        )}
      </div>
    </Layout>
  );
}
