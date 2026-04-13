import React, { useEffect, useMemo, useState } from 'react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import {
  createEmployeeWarningFromHealth,
  createHealthMedical,
  deleteHealthMedical,
  getEmployeeWarningOccurrences,
  listHealthMedicals,
  listHealthRestrictedDuty
} from '../../api/services/healthService';
import { HrEmployeeSelect } from '../../components/ui/HrEmployeeSelect';
import { MedicalDocumentsPanel } from '../../components/health/MedicalDocumentsPanel';
import type { CompanyRole } from '../../api/models/core';
import type { HealthMedical, HealthRestrictedDuty, UUID } from '../../api/models/entities';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';
import { createEvidence } from '../../api/services/evidenceService';
import { EVIDENCE_BUCKET } from '../../components/evidence/EvidenceModal';
import { insforge } from '../../api/insforge/client';
import { formatAuthError } from '../../auth/authMessages';

const tabs = ['Medical Records', 'Restricted Tracker'] as const;
type TabKey = (typeof tabs)[number];
type RestrictedTrackerStatusFilter = 'all' | 'open' | 'closed' | 'monitoring';

function getRestrictedTrackerStatus(row: HealthRestrictedDuty): 'Open' | 'Closed' | 'Needs Monitoring' {
  const today = new Date().toISOString().slice(0, 10);
  if (row.status === 'Ended') return 'Closed';
  if (row.end_date && String(row.end_date) >= today && String(row.end_date) <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)) {
    return 'Needs Monitoring';
  }
  return 'Open';
}

const ACCEPTED_FILE_TYPES = ['image/*', '.pdf', '.doc', '.docx', '.xls', '.xlsx'];

async function uploadEvidenceFiles(input: {
  companyId: UUID;
  actorUserId: UUID;
  entityType: string;
  entityId: UUID;
  files: File[];
}) {
  const uploadedNames: string[] = [];
  for (const file of input.files) {
    const key = `${input.companyId}/${input.entityType}/${input.entityId}/${Date.now()}-${file.name}`.replace(/\s+/g, '_');
    const { data, error } = await insforge.storage.from(EVIDENCE_BUCKET).upload(key, file);
    if (error) throw error;
    await createEvidence({
      companyId: input.companyId,
      entityType: input.entityType,
      entityId: input.entityId,
      title: file.name,
      storageBucket: EVIDENCE_BUCKET,
      storageKey: data?.key ?? key,
      createdByUserId: input.actorUserId,
      originalFilename: file.name,
      displayTitle: file.name,
      fileKind: file.type.startsWith('image/') ? 'image' : 'document'
    });
    uploadedNames.push(file.name);
  }
  return uploadedNames;
}

export function HealthMedicalPage() {
  const { user } = useUser();
  const { activeCompanyId, activeRole, activeMembership } = useTenant();
  const { restoreDraft, clearDraft } = useDraftManager();
  const [tab, setTab] = useState<TabKey>('Medical Records');
  const [refreshKey, setRefreshKey] = useState(0);
  const [restrictedFilter, setRestrictedFilter] = useState<RestrictedTrackerStatusFilter>('all');
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [uploadedStatus, setUploadedStatus] = useState<string | null>(null);
  const [medicalFiles, setMedicalFiles] = useState<File[]>([]);
  const [form, setForm] = useState({
    employeeId: '' as string,
    employeeUserId: '' as string,
    employeeName: '',
    employeeNumber: '',
    medicalType: 'PERIODIC' as HealthMedical['medical_type'],
    medicalDate: '',
    expiryDate: '',
    medicalCost: '',
    conductedBy: '',
    fitnessStatus: 'FIT' as HealthMedical['fitness_status'],
    restrictedDutyRequired: false,
    restrictedDutyDetails: '',
    warningOffenceType: 'Safety non-compliance',
    warningLevel: 'Written Warning',
    createWarning: false
  });
  const [medicalBaseline, setMedicalBaseline] = useState(() => ({ ...form }));
  const draftKeyMedicalCreate = `health-medical-create:${activeCompanyId ?? 'none'}:${user?.id ?? 'anon'}`;
  const hasDirtyMedicalDraft = useMemo(() => JSON.stringify(form) !== JSON.stringify(medicalBaseline) || medicalFiles.length > 0, [form, medicalBaseline, medicalFiles.length]);

  useDraftRegistration({
    key: draftKeyMedicalCreate,
    enabled: Boolean(activeCompanyId && user?.id),
    isDirty: () => hasDirtyMedicalDraft,
    serialize: () => ({ ...form })
  });

  useEffect(() => {
    if (!activeCompanyId || !user?.id) return;
    const restored = restoreDraft<typeof form>(draftKeyMedicalCreate);
    if (!restored) return;
    const next = { ...form, ...restored };
    setForm(next);
    setMedicalBaseline(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanyId, draftKeyMedicalCreate, restoreDraft, user?.id]);

  useEffect(() => {
    if (!hasDirtyMedicalDraft) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasDirtyMedicalDraft]);

  const { data: warningCount } = useAsync(async () => {
    if (!activeCompanyId || !form.employeeId || !form.warningOffenceType.trim()) return 0;
    return await getEmployeeWarningOccurrences({
      companyId: activeCompanyId,
      employeeId: form.employeeId as UUID,
      offenceType: form.warningOffenceType,
      withinMonths: 6
    });
  }, [activeCompanyId, form.employeeId, form.warningOffenceType, refreshKey]);

  const { data: medicals } = useAsync<HealthMedical[]>(async () => {
    if (!activeCompanyId) return [];
    return await listHealthMedicals({
      companyId: activeCompanyId,
      actorUserId: user?.id,
      actorRole: activeRole as CompanyRole,
      actorIsHrManager: activeMembership?.is_hr_manager === true,
      limit: 300
    });
  }, [activeCompanyId, user?.id, activeRole, activeMembership?.is_hr_manager, refreshKey]);

  const { data: restrictedDuty } = useAsync<HealthRestrictedDuty[]>(async () => {
    if (!activeCompanyId) return [];
    return await listHealthRestrictedDuty({ companyId: activeCompanyId, limit: 300 });
  }, [activeCompanyId, refreshKey]);

  const expiringSoon = useMemo(
    () => (medicals ?? []).filter((m) => m.expiry_date && String(m.expiry_date) <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)),
    [medicals]
  );

  async function submitMedical(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCompanyId || !user?.id || saving) return;
    setSubmitError(null);
    setSaveNotice(null);
    setUploadedStatus(null);

    if (!form.employeeId) {
      setSubmitError('Please select an employee.');
      return;
    }
    if ((form.fitnessStatus === 'RESTRICTED' || form.fitnessStatus === 'UNFIT') && medicalFiles.length === 0) {
      setSubmitError('Please upload supporting documents for restricted or unfit outcomes.');
      return;
    }
    if (form.createWarning && !form.warningOffenceType.trim()) {
      setSubmitError('Please provide an offence type to create a warning.');
      return;
    }

    setSaving(true);
    try {
      const created = await createHealthMedical({
        companyId: activeCompanyId,
        employeeId: (form.employeeId || undefined) as UUID | undefined,
        employeeUserId: (form.employeeUserId || undefined) as UUID | undefined,
        employeeName: form.employeeName || undefined,
        employeeNumber: form.employeeNumber || undefined,
        medicalType: form.medicalType,
        medicalDate: form.medicalDate,
        expiryDate: form.expiryDate || null,
        conductedBy: form.conductedBy || null,
        fitnessStatus: form.fitnessStatus,
        medicalCost: form.medicalCost ? Number(form.medicalCost) : null,
        restrictedDutyRequired: form.restrictedDutyRequired,
        restrictedDutyDetails: form.restrictedDutyDetails || null,
        createdByUserId: user.id
      });

      let uploadedNames: string[] = [];
      if (medicalFiles.length > 0) {
        uploadedNames = await uploadEvidenceFiles({
          companyId: activeCompanyId,
          actorUserId: user.id,
          entityType: 'health_medical',
          entityId: created.id,
          files: medicalFiles
        });
      }

      if (form.createWarning && form.employeeId) {
        await createEmployeeWarningFromHealth({
          companyId: activeCompanyId,
          employeeId: form.employeeId as UUID,
          offenceType: form.warningOffenceType.trim(),
          description: `Medical case (${form.medicalType}) for ${form.employeeName || form.employeeNumber || 'employee'}: ${form.fitnessStatus}`,
          warningLevel: form.warningLevel,
          createdByUserId: user.id
        });
      }

      setRefreshKey((k) => k + 1);
      setSaveNotice('Saved successfully.');
      if (uploadedNames.length > 0) {
        setUploadedStatus(`Documents uploaded: ${uploadedNames.join(', ')}`);
      }

      const nextForm = {
        employeeId: '',
        employeeUserId: '',
        employeeName: '',
        employeeNumber: '',
        medicalType: 'PERIODIC' as HealthMedical['medical_type'],
        medicalDate: '',
        expiryDate: '',
        medicalCost: '',
        conductedBy: '',
        fitnessStatus: 'FIT' as HealthMedical['fitness_status'],
        restrictedDutyRequired: false,
        restrictedDutyDetails: '',
        warningOffenceType: 'Safety non-compliance',
        warningLevel: 'Written Warning',
        createWarning: false
      };
      setForm(nextForm);
      setMedicalBaseline(nextForm);
      setMedicalFiles([]);
      clearDraft(draftKeyMedicalCreate);
    } catch (error: any) {
      setSubmitError(formatAuthError(error));
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteMedical(row: HealthMedical) {
    if (!activeCompanyId || !user?.id) return;
    const ok = window.confirm('Are you sure you want to delete this record?');
    if (!ok) return;
    try {
      await deleteHealthMedical(activeCompanyId, row.id, user.id);
      setRefreshKey((k) => k + 1);
      setSaveNotice('Record deleted successfully.');
    } catch (error: any) {
      setSubmitError(formatAuthError(error));
    }
  }

  return (
    <Layout title="Medical Surveillance">
      <div className="space-y-5">
        <div className="bg-white border border-surface-300 rounded-xl p-4">
          <h3 className="font-semibold text-charcoal mb-3">Create medical record</h3>
          {submitError && <p className="mb-2 text-sm text-critical">{submitError}</p>}
          {saveNotice && <p className="mb-2 text-sm text-success-700">{saveNotice}</p>}
          {uploadedStatus && <p className="mb-2 text-sm text-teal">{uploadedStatus}</p>}
          <form className="grid grid-cols-1 md:grid-cols-3 gap-3" onSubmit={submitMedical}>
            <HrEmployeeSelect
              companyId={activeCompanyId ?? null}
              value={form.employeeId as any}
              valueField="id"
              includeUnlinked
              label="Employee Name"
              placeholder="Select employee"
              onChange={(employeeId, meta) =>
                setForm((s) => ({
                  ...s,
                  employeeId: employeeId || '',
                  employeeUserId: (meta.userId ?? '') as string,
                  employeeName: meta.nameSnapshot,
                  employeeNumber: meta.employeeNumber ?? ''
                }))
              }
            />
            <input value={form.employeeNumber} readOnly placeholder="Employee ID" className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.medicalCost}
              onChange={(e) => setForm((s) => ({ ...s, medicalCost: e.target.value }))}
              placeholder="Medical cost (ZAR)"
              className="px-3 py-2 border border-surface-300 rounded-lg text-sm"
            />
            <select
              value={form.medicalType}
              onChange={(e) => setForm((s) => ({ ...s, medicalType: e.target.value as HealthMedical['medical_type'] }))}
              className="px-3 py-2 border border-surface-300 rounded-lg text-sm"
            >
              <option value="PRE_EMPLOYMENT">Pre-employment</option>
              <option value="PERIODIC">Periodic</option>
              <option value="EXIT">Exit</option>
            </select>
            <input type="date" value={form.medicalDate} onChange={(e) => setForm((s) => ({ ...s, medicalDate: e.target.value }))} className="px-3 py-2 border border-surface-300 rounded-lg text-sm" required />
            <input type="date" value={form.expiryDate} onChange={(e) => setForm((s) => ({ ...s, expiryDate: e.target.value }))} className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
            <input value={form.conductedBy} onChange={(e) => setForm((s) => ({ ...s, conductedBy: e.target.value }))} placeholder="Conducted by" className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
            <select value={form.fitnessStatus} onChange={(e) => setForm((s) => ({ ...s, fitnessStatus: e.target.value as HealthMedical['fitness_status'] }))} className="px-3 py-2 border border-surface-300 rounded-lg text-sm">
              <option value="FIT">Fit</option>
              <option value="RESTRICTED">Restricted</option>
              <option value="UNFIT">Unfit</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-charcoal">
              <input type="checkbox" checked={form.restrictedDutyRequired} onChange={(e) => setForm((s) => ({ ...s, restrictedDutyRequired: e.target.checked }))} />
              Restricted duty required
            </label>
            {form.restrictedDutyRequired && (
              <input value={form.restrictedDutyDetails} onChange={(e) => setForm((s) => ({ ...s, restrictedDutyDetails: e.target.value }))} placeholder="Restricted duty details" className="px-3 py-2 border border-surface-300 rounded-lg text-sm md:col-span-2" />
            )}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-charcoal mb-1">Medical documents</label>
              <input
                type="file"
                accept={ACCEPTED_FILE_TYPES.join(',')}
                multiple
                onChange={(e) => setMedicalFiles(Array.from(e.target.files ?? []))}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
              />
              {medicalFiles.length > 0 && <p className="mt-1 text-xs text-charcoal-500">Selected: {medicalFiles.map((f) => f.name).join(', ')}</p>}
            </div>
            <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-3 border border-surface-200 rounded-lg p-3">
              <label className="flex items-center gap-2 text-sm text-charcoal md:col-span-3">
                <input type="checkbox" checked={form.createWarning} onChange={(e) => setForm((s) => ({ ...s, createWarning: e.target.checked }))} />
                Link this medical to employee warnings
              </label>
              {form.createWarning && (
                <>
                  <input
                    value={form.warningOffenceType}
                    onChange={(e) => setForm((s) => ({ ...s, warningOffenceType: e.target.value }))}
                    className="px-3 py-2 border border-surface-300 rounded-lg text-sm"
                    placeholder="Offence type"
                  />
                  <select value={form.warningLevel} onChange={(e) => setForm((s) => ({ ...s, warningLevel: e.target.value }))} className="px-3 py-2 border border-surface-300 rounded-lg text-sm">
                    <option>Verbal Warning</option>
                    <option>Written Warning</option>
                    <option>Final Warning</option>
                    <option>Suspension</option>
                  </select>
                  <div className="px-3 py-2 rounded-lg bg-surface-50 text-sm text-charcoal">
                    Similar warnings (6 months): <span className="font-semibold">{warningCount ?? 0}</span>
                  </div>
                </>
              )}
            </div>
            <button disabled={saving} className="px-3 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60">
              {saving ? 'Saving...' : 'Save medical'}
            </button>
          </form>
        </div>

        <div className="flex gap-2">
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 rounded-lg text-sm border ${tab === t ? 'bg-teal text-white border-teal' : 'bg-white border-surface-300 text-charcoal'}`}>{t}</button>
          ))}
        </div>

        {tab === 'Medical Records' && (
          <div className="space-y-4">
            <div className="bg-white border border-surface-300 rounded-xl p-4">
              <p className="text-sm font-semibold text-charcoal mb-2">Certificates expiring in next 30 days</p>
              <div className="space-y-2">
                {expiringSoon.map((m) => (
                  <div key={m.id} className="p-3 rounded-lg border border-warning/30 bg-warning/5 text-sm">
                    {m.employee_name ?? m.employee_user_id}: {m.expiry_date}
                  </div>
                ))}
                {expiringSoon.length === 0 && <p className="text-sm text-charcoal-500">No expiring certificates.</p>}
              </div>
            </div>
            <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Employee</th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-left">Medical date</th>
                    <th className="px-3 py-2 text-left">Expiry</th>
                    <th className="px-3 py-2 text-left">Expiry status</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {(medicals ?? []).map((m) => {
                    const today = new Date().toISOString().slice(0, 10);
                    let expiryLabel = 'Valid';
                    if (!m.expiry_date) expiryLabel = 'Valid';
                    else if (String(m.expiry_date) < today) expiryLabel = 'Expired';
                    else if (String(m.expiry_date) <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)) expiryLabel = 'Expiring Soon';
                    return (
                      <tr key={m.id} className="align-top">
                        <td className="px-3 py-2">
                          <div className="flex flex-col">
                            <span>{m.employee_name ?? String(m.employee_user_id ?? '').slice(0, 8)}</span>
                            {user?.id && (
                              <div className="mt-1">
                                <MedicalDocumentsPanel medical={m} companyId={activeCompanyId!} actorUserId={user.id} />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">{m.medical_type}</td>
                        <td className="px-3 py-2">{m.medical_date}</td>
                        <td className="px-3 py-2">{m.expiry_date ?? '-'}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                              expiryLabel === 'Expired'
                                ? 'bg-critical/10 text-critical'
                                : expiryLabel === 'Expiring Soon'
                                  ? 'bg-warning/10 text-warning-700'
                                  : 'bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            {expiryLabel}
                          </span>
                        </td>
                        <td className="px-3 py-2">{m.fitness_status}</td>
                        <td className="px-3 py-2">
                          <button type="button" onClick={() => void onDeleteMedical(m)} className="px-2 py-1.5 rounded-lg bg-critical text-white text-xs font-semibold hover:opacity-90">
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'Restricted Tracker' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-charcoal">Restricted Tracker</p>
              <select value={restrictedFilter} onChange={(e) => setRestrictedFilter(e.target.value as RestrictedTrackerStatusFilter)} className="px-3 py-1.5 border border-surface-300 rounded-lg text-xs">
                <option value="all">All statuses</option>
                <option value="open">Open</option>
                <option value="monitoring">Needs Monitoring</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Employee</th>
                    <th className="px-3 py-2 text-left">Restriction description</th>
                    <th className="px-3 py-2 text-left">Start date</th>
                    <th className="px-3 py-2 text-left">End date</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {(restrictedDuty ?? [])
                    .filter((r) => {
                      const statusLabel = getRestrictedTrackerStatus(r);
                      if (restrictedFilter === 'all') return true;
                      if (restrictedFilter === 'open') return statusLabel === 'Open';
                      if (restrictedFilter === 'closed') return statusLabel === 'Closed';
                      if (restrictedFilter === 'monitoring') return statusLabel === 'Needs Monitoring';
                      return true;
                    })
                    .map((r) => {
                      const statusLabel = getRestrictedTrackerStatus(r);
                      return (
                        <tr key={r.id}>
                          <td className="px-3 py-2">{r.employee_name ?? String(r.employee_user_id ?? '').slice(0, 8)}</td>
                          <td className="px-3 py-2">{r.restriction_reason}</td>
                          <td className="px-3 py-2">{r.start_date}</td>
                          <td className="px-3 py-2">{r.end_date ?? '-'}</td>
                          <td className="px-3 py-2">{statusLabel}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
