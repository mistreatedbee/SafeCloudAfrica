import React, { useEffect, useMemo, useState } from 'react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import { createHealthMedical, deleteHealthMedical, listHealthMedicals, listHealthRestrictedDuty, updateHealthMedical } from '../../api/services/healthService';
import { HrEmployeeSelect } from '../../components/ui/HrEmployeeSelect';
import { MedicalDocumentsPanel } from '../../components/health/MedicalDocumentsPanel';
import type { CompanyRole } from '../../api/models/core';
import type { HealthMedical, HealthRestrictedDuty } from '../../api/models/entities';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';

const tabs = ['Medical Records', 'Restricted Tracker'] as const;
type TabKey = (typeof tabs)[number];

type RestrictedTrackerStatusFilter = 'all' | 'open' | 'closed' | 'monitoring';

function getRestrictedTrackerStatus(row: HealthRestrictedDuty): 'Open' | 'Closed' | 'Needs Monitoring' {
  const today = new Date().toISOString().slice(0, 10);
  if (row.status === 'Ended') return 'Closed';
  // Active: derive Needs Monitoring when end date is approaching in next 30 days
  if (row.end_date && String(row.end_date) >= today && String(row.end_date) <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)) {
    return 'Needs Monitoring';
  }
  return 'Open';
}

export function HealthMedicalPage() {
  const { user } = useUser();
  const { activeCompanyId, activeRole, activeMembership } = useTenant();
  const { restoreDraft, clearDraft } = useDraftManager();
  const [tab, setTab] = useState<TabKey>('Medical Records');
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingMedicalId, setEditingMedicalId] = useState<string | null>(null);
  const [restrictedFilter, setRestrictedFilter] = useState<RestrictedTrackerStatusFilter>('all');
  const [savingMedical, setSavingMedical] = useState(false);
  const [medicalSuccess, setMedicalSuccess] = useState<string | null>(null);
  const [medicalError, setMedicalError] = useState<string | null>(null);
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
    restrictedDutyDetails: ''
  });
  const canManageMedical = activeMembership?.is_hr_manager === true || ['owner', 'admin', 'manager', 'supervisor'].includes(activeRole ?? '');
  const [medicalBaseline, setMedicalBaseline] = useState(() => ({ ...form }));
  const draftKeyMedicalCreate = `health-medical-create:${activeCompanyId ?? 'none'}:${user?.id ?? 'anon'}`;
  const hasDirtyMedicalDraft = useMemo(() => JSON.stringify(form) !== JSON.stringify(medicalBaseline), [form, medicalBaseline]);

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

  const { data: restrictedDuty } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return await listHealthRestrictedDuty({ companyId: activeCompanyId, limit: 300 });
  }, [activeCompanyId, refreshKey]);

  const expiringSoon = useMemo(() => (medicals ?? []).filter((m) => m.expiry_date && String(m.expiry_date) <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)), [medicals]);

  async function submitMedical(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCompanyId || !user?.id || savingMedical) return;
    setMedicalError(null);
    setMedicalSuccess(null);
    if (!form.employeeUserId) {
      setMedicalError('Select a linked employee before saving.');
      return;
    }
    if (form.employeeUserId && !form.employeeId) {
      setMedicalError('Employee record not linked correctly; contact admin.');
      return;
    }

    try {
      setSavingMedical(true);
      if (editingMedicalId) {
        await updateHealthMedical(
          activeCompanyId,
          editingMedicalId as any,
          {
            employee_id: (form.employeeId || null) as any,
            employee_user_id: (form.employeeUserId || null) as any,
            employee_name: form.employeeName || null,
            employee_number: form.employeeNumber || null,
            medical_type: form.medicalType,
            medical_date: form.medicalDate,
            expiry_date: form.expiryDate || null,
            conducted_by: form.conductedBy || null,
            fitness_status: form.fitnessStatus,
            medical_cost: form.medicalCost ? Number(form.medicalCost) : null,
            restricted_duty_required: form.restrictedDutyRequired,
            restricted_duty_details: form.restrictedDutyDetails || null
          },
          user.id
        );
      } else {
        await createHealthMedical({
          companyId: activeCompanyId,
          employeeId: (form.employeeId || undefined) as any,
          employeeUserId: form.employeeUserId || undefined,
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
      }
      setRefreshKey((k) => k + 1);

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
        restrictedDutyDetails: ''
      };
      setEditingMedicalId(null);
      setForm(nextForm);
      setMedicalBaseline(nextForm);
      clearDraft(draftKeyMedicalCreate);
      setMedicalSuccess('Saved successfully.');
    } catch (error) {
      setMedicalError(error instanceof Error ? error.message : 'Unable to save this medical record.');
    } finally {
      setSavingMedical(false);
    }
  }

  function startEditMedical(medical: HealthMedical) {
    const nextForm = {
      employeeId: (medical.employee_id ?? '') as string,
      employeeUserId: (medical.employee_user_id ?? '') as string,
      employeeName: medical.employee_name ?? '',
      employeeNumber: medical.employee_number ?? '',
      medicalType: medical.medical_type,
      medicalDate: medical.medical_date?.slice(0, 10) ?? '',
      expiryDate: medical.expiry_date?.slice(0, 10) ?? '',
      medicalCost: medical.medical_cost != null ? String(medical.medical_cost) : '',
      conductedBy: medical.conducted_by ?? '',
      fitnessStatus: medical.fitness_status,
      restrictedDutyRequired: medical.restricted_duty_required,
      restrictedDutyDetails: medical.restricted_duty_details ?? ''
    };
    setEditingMedicalId(medical.id);
    setForm(nextForm);
    setMedicalBaseline(nextForm);
    setMedicalError(null);
    setMedicalSuccess(null);
  }

  function cancelMedicalEdit() {
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
      restrictedDutyDetails: ''
    };
    setEditingMedicalId(null);
    setForm(nextForm);
    setMedicalBaseline(nextForm);
    clearDraft(draftKeyMedicalCreate);
    setMedicalError(null);
  }

  return (
    <Layout title="Medical Surveillance">
      <div className="space-y-5">
        <div className="bg-white border border-surface-300 rounded-xl p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="font-semibold text-charcoal">{editingMedicalId ? 'Edit medical record' : 'Create medical record'}</h3>
            {editingMedicalId && (
              <button
                type="button"
                onClick={cancelMedicalEdit}
                className="px-3 py-1.5 rounded-lg border border-surface-300 text-sm text-charcoal hover:bg-surface-50"
              >
                Cancel edit
              </button>
            )}
          </div>
          {medicalSuccess && <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{medicalSuccess}</div>}
          {medicalError && <div className="mb-3 rounded-lg border border-critical/20 bg-critical/5 px-3 py-2 text-sm text-critical">{medicalError}</div>}
          <form className="grid grid-cols-1 md:grid-cols-3 gap-3" onSubmit={submitMedical}>
            <HrEmployeeSelect
              companyId={activeCompanyId ?? null}
              value={form.employeeUserId as any}
              valueField="user_id"
              label="Employee Name"
              placeholder="Select employee"
              onChange={(userId, meta) =>
                setForm((s) => ({
                  ...s,
                  employeeUserId: userId || '',
                  employeeId: (meta.employeeId ?? '') as string,
                  employeeName: meta.nameSnapshot,
                  employeeNumber: meta.employeeNumber ?? ''
                }))
              }
              disabled={savingMedical}
            />
            <input
              value={form.employeeNumber}
              readOnly
              placeholder="Employee ID"
              className="px-3 py-2 border border-surface-300 rounded-lg text-sm"
            />
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.medicalCost}
              onChange={(e) => setForm((s) => ({ ...s, medicalCost: e.target.value }))}
              placeholder="Medical cost (ZAR)"
              disabled={savingMedical}
              className="px-3 py-2 border border-surface-300 rounded-lg text-sm"
            />
            <select value={form.medicalType} onChange={(e) => setForm((s) => ({ ...s, medicalType: e.target.value as HealthMedical['medical_type'] }))} disabled={savingMedical} className="px-3 py-2 border border-surface-300 rounded-lg text-sm">
              <option value="PRE_EMPLOYMENT">Pre-employment</option>
              <option value="PERIODIC">Periodic</option>
              <option value="EXIT">Exit</option>
            </select>
            <input type="date" value={form.medicalDate} onChange={(e) => setForm((s) => ({ ...s, medicalDate: e.target.value }))} disabled={savingMedical} className="px-3 py-2 border border-surface-300 rounded-lg text-sm" required />
            <input type="date" value={form.expiryDate} onChange={(e) => setForm((s) => ({ ...s, expiryDate: e.target.value }))} disabled={savingMedical} className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
            <input value={form.conductedBy} onChange={(e) => setForm((s) => ({ ...s, conductedBy: e.target.value }))} placeholder="Conducted by" disabled={savingMedical} className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
            <select value={form.fitnessStatus} onChange={(e) => setForm((s) => ({ ...s, fitnessStatus: e.target.value as HealthMedical['fitness_status'] }))} disabled={savingMedical} className="px-3 py-2 border border-surface-300 rounded-lg text-sm">
              <option value="FIT">Fit</option>
              <option value="RESTRICTED">Restricted</option>
              <option value="UNFIT">Unfit</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-charcoal">
              <input type="checkbox" checked={form.restrictedDutyRequired} onChange={(e) => setForm((s) => ({ ...s, restrictedDutyRequired: e.target.checked }))} disabled={savingMedical} />
              Restricted duty required
            </label>
            {form.restrictedDutyRequired && (
              <input value={form.restrictedDutyDetails} onChange={(e) => setForm((s) => ({ ...s, restrictedDutyDetails: e.target.value }))} placeholder="Restricted duty details" disabled={savingMedical} className="px-3 py-2 border border-surface-300 rounded-lg text-sm md:col-span-2" />
            )}
            <button disabled={savingMedical} className="px-3 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-60">
              {savingMedical ? 'Saving...' : editingMedicalId ? 'Update medical' : 'Save medical'}
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
                    {canManageMedical && <th className="px-3 py-2 text-left">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {(medicals ?? []).map((m) => {
                    const today = new Date().toISOString().slice(0, 10);
                    let expiryLabel = 'Valid';
                    if (!m.expiry_date) {
                      expiryLabel = 'Valid';
                    } else if (String(m.expiry_date) < today) {
                      expiryLabel = 'Expired';
                    } else if (String(m.expiry_date) <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)) {
                      expiryLabel = 'Expiring Soon';
                    }
                    const recordStatus = String((m as any).status ?? 'active');
                    return (
                      <tr key={m.id} className={`align-top ${recordStatus === 'archived' ? 'bg-surface-50 text-charcoal-500' : ''}`}>
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
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-1">
                            <span>{m.fitness_status}</span>
                            {recordStatus === 'archived' ? <span className="text-xs font-semibold text-charcoal-500">Archived</span> : null}
                          </div>
                        </td>
                        {canManageMedical && (
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => startEditMedical(m)}
                                className="px-2 py-1 rounded border border-surface-300 text-xs hover:bg-surface-50"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!activeCompanyId || !user?.id) return;
                                  if (!window.confirm('Delete this medical record?')) return;
                                  await deleteHealthMedical(activeCompanyId, m.id, user.id);
                                  if (editingMedicalId === m.id) cancelMedicalEdit();
                                  setRefreshKey((k) => k + 1);
                                }}
                                className="px-2 py-1 rounded border border-critical/30 text-xs text-critical hover:bg-critical/5"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        )}
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
              <select
                value={restrictedFilter}
                onChange={(e) => setRestrictedFilter(e.target.value as RestrictedTrackerStatusFilter)}
                className="px-3 py-1.5 border border-surface-300 rounded-lg text-xs"
              >
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
