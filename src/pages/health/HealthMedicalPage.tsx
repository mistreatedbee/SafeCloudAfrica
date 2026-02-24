import React, { useMemo, useState } from 'react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import { createHealthMedical, listHealthMedicals, listHealthRestrictedDuty } from '../../api/services/healthService';
import { listUserProfiles } from '../../api/services/profilesService';
import type { CompanyRole } from '../../api/models/core';
import type { HealthMedical, UserProfile } from '../../api/models/entities';

const tabs = ['Medical Records', 'Fitness Certificates', 'Restricted Duty Tracker'] as const;
type TabKey = (typeof tabs)[number];

export function HealthMedicalPage() {
  const { user } = useUser();
  const { activeCompanyId, activeRole } = useTenant();
  const [tab, setTab] = useState<TabKey>('Medical Records');
  const [refreshKey, setRefreshKey] = useState(0);
  const [form, setForm] = useState({
    employeeUserId: '',
    employeeName: '',
    employeeNumber: '',
    medicalType: 'PERIODIC' as HealthMedical['medical_type'],
    medicalDate: '',
    expiryDate: '',
    conductedBy: '',
    fitnessStatus: 'FIT' as HealthMedical['fitness_status'],
    restrictedDutyRequired: false,
    restrictedDutyDetails: ''
  });

  const { data: profiles } = useAsync<UserProfile[]>(async () => {
    if (!activeCompanyId) return [];
    return await listUserProfiles(activeCompanyId);
  }, [activeCompanyId]);

  const { data: medicals } = useAsync<HealthMedical[]>(async () => {
    if (!activeCompanyId) return [];
    return await listHealthMedicals({ companyId: activeCompanyId, actorUserId: user?.id, actorRole: activeRole as CompanyRole, limit: 300 });
  }, [activeCompanyId, user?.id, activeRole, refreshKey]);

  const { data: restrictedDuty } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return await listHealthRestrictedDuty({ companyId: activeCompanyId, limit: 300 });
  }, [activeCompanyId, refreshKey]);

  const expiringSoon = useMemo(() => (medicals ?? []).filter((m) => m.expiry_date && String(m.expiry_date) <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)), [medicals]);

  async function submitMedical(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCompanyId || !user?.id) return;
    await createHealthMedical({
      companyId: activeCompanyId,
      employeeUserId: form.employeeUserId || undefined,
      employeeName: form.employeeName || undefined,
      employeeNumber: form.employeeNumber || undefined,
      medicalType: form.medicalType,
      medicalDate: form.medicalDate,
      expiryDate: form.expiryDate || null,
      conductedBy: form.conductedBy || null,
      fitnessStatus: form.fitnessStatus,
      restrictedDutyRequired: form.restrictedDutyRequired,
      restrictedDutyDetails: form.restrictedDutyDetails || null,
      createdByUserId: user.id
    });
    setRefreshKey((k) => k + 1);
    setForm({ ...form, medicalDate: '', expiryDate: '', conductedBy: '', restrictedDutyDetails: '' });
  }

  return (
    <Layout title="Medical Surveillance">
      <div className="space-y-5">
        <div className="bg-white border border-surface-300 rounded-xl p-4">
          <h3 className="font-semibold text-charcoal mb-3">Create medical record</h3>
          <form className="grid grid-cols-1 md:grid-cols-3 gap-3" onSubmit={submitMedical}>
            <select value={form.employeeUserId} onChange={(e) => setForm((s) => ({ ...s, employeeUserId: e.target.value }))} className="px-3 py-2 border border-surface-300 rounded-lg text-sm">
              <option value="">Select employee profile (optional)</option>
              {(profiles ?? []).map((p) => (
                <option key={p.user_id} value={p.user_id}>{p.full_name ?? p.email ?? p.user_id}</option>
              ))}
            </select>
            <input value={form.employeeName} onChange={(e) => setForm((s) => ({ ...s, employeeName: e.target.value }))} placeholder="Employee name (if no profile)" className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
            <input value={form.employeeNumber} onChange={(e) => setForm((s) => ({ ...s, employeeNumber: e.target.value }))} placeholder="Employee number" className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
            <select value={form.medicalType} onChange={(e) => setForm((s) => ({ ...s, medicalType: e.target.value as HealthMedical['medical_type'] }))} className="px-3 py-2 border border-surface-300 rounded-lg text-sm">
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
            <button className="px-3 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600">Save medical</button>
          </form>
        </div>

        <div className="flex gap-2">
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 rounded-lg text-sm border ${tab === t ? 'bg-teal text-white border-teal' : 'bg-white border-surface-300 text-charcoal'}`}>{t}</button>
          ))}
        </div>

        {tab === 'Medical Records' && (
          <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-50"><tr><th className="px-3 py-2 text-left">Employee</th><th className="px-3 py-2 text-left">Type</th><th className="px-3 py-2 text-left">Medical date</th><th className="px-3 py-2 text-left">Expiry</th><th className="px-3 py-2 text-left">Status</th></tr></thead>
              <tbody className="divide-y divide-surface-100">
                {(medicals ?? []).map((m) => <tr key={m.id}><td className="px-3 py-2">{m.employee_name ?? String(m.employee_user_id ?? '').slice(0, 8)}</td><td className="px-3 py-2">{m.medical_type}</td><td className="px-3 py-2">{m.medical_date}</td><td className="px-3 py-2">{m.expiry_date ?? '-'}</td><td className="px-3 py-2">{m.fitness_status}</td></tr>)}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'Fitness Certificates' && (
          <div className="bg-white border border-surface-300 rounded-xl p-4">
            <p className="text-sm text-charcoal-500 mb-3">Records expiring in next 30 days.</p>
            <div className="space-y-2">
              {expiringSoon.map((m) => <div key={m.id} className="p-3 rounded-lg border border-warning/30 bg-warning/5 text-sm">{m.employee_name ?? m.employee_user_id}: {m.expiry_date}</div>)}
              {expiringSoon.length === 0 && <p className="text-sm text-charcoal-500">No expiring certificates.</p>}
            </div>
          </div>
        )}

        {tab === 'Restricted Duty Tracker' && (
          <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-50"><tr><th className="px-3 py-2 text-left">Employee</th><th className="px-3 py-2 text-left">Reason</th><th className="px-3 py-2 text-left">Start</th><th className="px-3 py-2 text-left">End</th><th className="px-3 py-2 text-left">Status</th></tr></thead>
              <tbody className="divide-y divide-surface-100">
                {(restrictedDuty ?? []).map((r) => <tr key={r.id}><td className="px-3 py-2">{r.employee_name ?? String(r.employee_user_id ?? '').slice(0, 8)}</td><td className="px-3 py-2">{r.restriction_reason}</td><td className="px-3 py-2">{r.start_date}</td><td className="px-3 py-2">{r.end_date ?? '-'}</td><td className="px-3 py-2">{r.status}</td></tr>)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}

