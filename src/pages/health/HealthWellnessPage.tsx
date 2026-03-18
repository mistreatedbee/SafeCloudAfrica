import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import {
  createHealthSubstanceCase,
  createHealthVaccination,
  listHealthSubstanceCases,
  listHealthVaccinations,
  listHealthWellnessCampaigns
} from '../../api/services/healthService';
import { SelectOrType } from '../../components/ui/SelectOrType';
import { getMergedOptions } from '../../api/services/dynamicOptionsService';
import type { CompanyRole } from '../../api/models/core';
import type { OptionItem } from '../../api/services/dynamicOptionsService';

const tabs = ['Programmes/Campaigns', 'Substance Abuse Tracking', 'Vaccination Records'] as const;
type TabKey = (typeof tabs)[number];

export function HealthWellnessPage() {
  const { user } = useUser();
  const { activeCompanyId, activeRole } = useTenant();
  const [tab, setTab] = useState<TabKey>('Programmes/Campaigns');
  const [refreshKey, setRefreshKey] = useState(0);
  const [vaccineOptions, setVaccineOptions] = useState<OptionItem[]>([]);
  const [substanceOptions, setSubstanceOptions] = useState<OptionItem[]>([]);
  const [vaccineName, setVaccineName] = useState('');
  const [substanceManual, setSubstanceManual] = useState('');
  const [substanceForm, setSubstanceForm] = useState({
    employeeName: '',
    dateOfReport: '',
    testConductedBy: '',
    typeOfCase: 'Reasonable Suspicion',
    substanceSuspected: [] as string[],
    observedBehaviourSymptoms: '',
    witnessNames: '',
    typeOfTest: 'Breathalyser',
    testResult: 'Negative',
    immediateActionTaken: '',
    outcome: 'Verbal Warning'
  });
  const [vaccinationForm, setVaccinationForm] = useState({
    employeeName: '',
    doseNo: '',
    dateAdministered: '',
    batchNo: '',
    administeredBy: '',
    nextDueDate: '',
    validity: ''
  });

  useEffect(() => {
    async function loadOptions() {
      if (!activeCompanyId) return;
      const v = await getMergedOptions({ companyId: activeCompanyId, moduleKey: 'health', fieldKey: 'vaccineName' }, ['Hepatitis B', 'Tetanus', 'Influenza', 'COVID-19', 'MMR']);
      const s = await getMergedOptions({ companyId: activeCompanyId, moduleKey: 'health', fieldKey: 'substanceSuspected' }, ['Alcohol', 'Drugs', 'Prescription Misuse']);
      setVaccineOptions(v);
      setSubstanceOptions(s);
    }
    void loadOptions();
  }, [activeCompanyId]);

  const { data: campaigns } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return await listHealthWellnessCampaigns(activeCompanyId);
  }, [activeCompanyId, refreshKey]);

  const { data: substanceCases } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return await listHealthSubstanceCases({ companyId: activeCompanyId, actorRole: activeRole as CompanyRole });
  }, [activeCompanyId, activeRole, refreshKey]);

  const { data: vaccinations } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return await listHealthVaccinations({ companyId: activeCompanyId, dueInDays: 365 });
  }, [activeCompanyId, refreshKey]);

  async function submitSubstance(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCompanyId || !user?.id) return;
    const allSubstances = [...substanceForm.substanceSuspected, ...(substanceManual ? [substanceManual] : [])];
    await createHealthSubstanceCase({
      companyId: activeCompanyId,
      employeeName: substanceForm.employeeName,
      dateOfReport: substanceForm.dateOfReport,
      testConductedBy: substanceForm.testConductedBy,
      typeOfCase: substanceForm.typeOfCase as any,
      substanceSuspected: allSubstances,
      observedBehaviourSymptoms: substanceForm.observedBehaviourSymptoms,
      witnessNames: substanceForm.witnessNames.split(',').map((v) => v.trim()).filter(Boolean),
      typeOfTest: substanceForm.typeOfTest as any,
      testResult: substanceForm.testResult as any,
      immediateActionTaken: substanceForm.immediateActionTaken,
      outcome: substanceForm.outcome as any,
      createdByUserId: user.id,
      actorRole: activeRole as CompanyRole
    });
    setRefreshKey((k) => k + 1);
  }

  async function submitVaccination(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCompanyId || !user?.id) return;
    await createHealthVaccination({
      companyId: activeCompanyId,
      employeeName: vaccinationForm.employeeName,
      vaccineName,
      doseNo: vaccinationForm.doseNo ? Number(vaccinationForm.doseNo) : null,
      dateAdministered: vaccinationForm.dateAdministered || null,
      batchNo: vaccinationForm.batchNo || null,
      administeredBy: vaccinationForm.administeredBy || null,
      nextDueDate: vaccinationForm.nextDueDate || null,
      validity: vaccinationForm.validity || null,
      createdByUserId: user.id
    });
    setRefreshKey((k) => k + 1);
  }

  return (
    <Layout title="Wellness Programme">
      <div className="space-y-5">
        <div className="bg-white border border-surface-300 rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <p className="font-semibold text-charcoal">Employee Wellness Programme</p>
            <p className="text-sm text-charcoal-500">Capture and review employee wellness assessments and action plans.</p>
          </div>
          <Link
            to="/dashboard/health/wellness/employee-wellness"
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600"
          >
            Open Employee Wellness Programme
          </Link>
        </div>

        <div className="flex gap-2">
          {tabs.map((t) => <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 rounded-lg text-sm border ${tab === t ? 'bg-teal text-white border-teal' : 'bg-white border-surface-300 text-charcoal'}`}>{t}</button>)}
        </div>

        {tab === 'Programmes/Campaigns' && (
          <div className="bg-white border border-surface-300 rounded-xl p-4">
            <p className="text-sm text-charcoal-500 mb-3">Mental health, EAP, stress management and awareness campaigns.</p>
            <div className="space-y-2">
              {(campaigns ?? []).map((c) => <div key={c.id} className="border border-surface-200 rounded-lg p-3 text-sm"><p className="font-semibold">{c.title}</p><p className="text-charcoal-500">{c.campaign_type} | {c.date_from ?? '-'} to {c.date_to ?? '-'}</p></div>)}
            </div>
          </div>
        )}

        {tab === 'Substance Abuse Tracking' && (
          <div className="space-y-4">
            <form className="bg-white border border-surface-300 rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-3" onSubmit={submitSubstance}>
              <input required value={substanceForm.employeeName} onChange={(e) => setSubstanceForm((s) => ({ ...s, employeeName: e.target.value }))} placeholder="Employee name" className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
              <input type="date" required value={substanceForm.dateOfReport} onChange={(e) => setSubstanceForm((s) => ({ ...s, dateOfReport: e.target.value }))} className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
              <input value={substanceForm.testConductedBy} onChange={(e) => setSubstanceForm((s) => ({ ...s, testConductedBy: e.target.value }))} placeholder="Test conducted by" className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
              <select value={substanceForm.typeOfCase} onChange={(e) => setSubstanceForm((s) => ({ ...s, typeOfCase: e.target.value }))} className="px-3 py-2 border border-surface-300 rounded-lg text-sm"><option>Reasonable Suspicion</option><option>Random Test</option><option>Post-Incident</option><option>Return-to-Work</option><option>Follow-up Test</option></select>
              <div className="md:col-span-2">
                <p className="text-xs text-charcoal-500 mb-1">Substance suspected (multi-select + manual)</p>
                <div className="flex flex-wrap gap-2">
                  {substanceOptions.map((o) => <label key={o.id} className="text-sm"><input type="checkbox" checked={substanceForm.substanceSuspected.includes(o.value)} onChange={(e) => setSubstanceForm((s) => ({ ...s, substanceSuspected: e.target.checked ? [...s.substanceSuspected, o.value] : s.substanceSuspected.filter((v) => v !== o.value) }))} /> {o.label}</label>)}
                </div>
                <input value={substanceManual} onChange={(e) => setSubstanceManual(e.target.value)} placeholder="Other substance (manual)" className="mt-2 w-full px-3 py-2 border border-surface-300 rounded-lg text-sm" />
              </div>
              <textarea value={substanceForm.observedBehaviourSymptoms} onChange={(e) => setSubstanceForm((s) => ({ ...s, observedBehaviourSymptoms: e.target.value }))} placeholder="Observed behaviour / symptoms" className="px-3 py-2 border border-surface-300 rounded-lg text-sm md:col-span-2" />
              <input value={substanceForm.witnessNames} onChange={(e) => setSubstanceForm((s) => ({ ...s, witnessNames: e.target.value }))} placeholder="Witness names (comma separated)" className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
              <select value={substanceForm.typeOfTest} onChange={(e) => setSubstanceForm((s) => ({ ...s, typeOfTest: e.target.value }))} className="px-3 py-2 border border-surface-300 rounded-lg text-sm"><option>Breathalyser</option><option>Urine</option><option>Saliva</option><option>Blood</option></select>
              <select value={substanceForm.testResult} onChange={(e) => setSubstanceForm((s) => ({ ...s, testResult: e.target.value }))} className="px-3 py-2 border border-surface-300 rounded-lg text-sm"><option>Negative</option><option>Positive</option><option>Refused</option></select>
              <textarea value={substanceForm.immediateActionTaken} onChange={(e) => setSubstanceForm((s) => ({ ...s, immediateActionTaken: e.target.value }))} placeholder="Immediate action taken" className="px-3 py-2 border border-surface-300 rounded-lg text-sm md:col-span-2" />
              <select value={substanceForm.outcome} onChange={(e) => setSubstanceForm((s) => ({ ...s, outcome: e.target.value }))} className="px-3 py-2 border border-surface-300 rounded-lg text-sm"><option>Verbal Warning</option><option>Written Warning</option><option>Final Warning</option><option>Dismissal</option><option>Referral to Rehab</option></select>
              <button className="px-3 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600">Save substance case</button>
            </form>
            <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-50"><tr><th className="px-3 py-2 text-left">Employee</th><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Case type</th><th className="px-3 py-2 text-left">Result</th></tr></thead>
                <tbody className="divide-y divide-surface-100">{(substanceCases ?? []).map((s) => <tr key={s.id}><td className="px-3 py-2">{s.employee_name ?? '-'}</td><td className="px-3 py-2">{s.date_of_report}</td><td className="px-3 py-2">{s.type_of_case}</td><td className="px-3 py-2">{s.test_result}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'Vaccination Records' && (
          <div className="space-y-4">
            <form className="bg-white border border-surface-300 rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-3" onSubmit={submitVaccination}>
              <input required value={vaccinationForm.employeeName} onChange={(e) => setVaccinationForm((s) => ({ ...s, employeeName: e.target.value }))} placeholder="Employee name" className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
              <SelectOrType value={vaccineName} onChange={(v) => setVaccineName(v)} options={vaccineOptions} placeholder="Vaccine name" allowCreate companyId={activeCompanyId ?? undefined} moduleKey="health" fieldKey="vaccineName" createdByUserId={user?.id ?? undefined} />
              <input value={vaccinationForm.doseNo} onChange={(e) => setVaccinationForm((s) => ({ ...s, doseNo: e.target.value }))} placeholder="Dose no" className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
              <input type="date" value={vaccinationForm.dateAdministered} onChange={(e) => setVaccinationForm((s) => ({ ...s, dateAdministered: e.target.value }))} className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
              <input value={vaccinationForm.batchNo} onChange={(e) => setVaccinationForm((s) => ({ ...s, batchNo: e.target.value }))} placeholder="Batch no." className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
              <input value={vaccinationForm.administeredBy} onChange={(e) => setVaccinationForm((s) => ({ ...s, administeredBy: e.target.value }))} placeholder="Administered by" className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
              <input type="date" value={vaccinationForm.nextDueDate} onChange={(e) => setVaccinationForm((s) => ({ ...s, nextDueDate: e.target.value }))} className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
              <input value={vaccinationForm.validity} onChange={(e) => setVaccinationForm((s) => ({ ...s, validity: e.target.value }))} placeholder="Validity" className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
              <button className="px-3 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600">Save vaccination</button>
            </form>
            <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-50"><tr><th className="px-3 py-2 text-left">Employee</th><th className="px-3 py-2 text-left">Vaccine</th><th className="px-3 py-2 text-left">Dose</th><th className="px-3 py-2 text-left">Administered</th><th className="px-3 py-2 text-left">Next due</th></tr></thead>
                <tbody className="divide-y divide-surface-100">{(vaccinations ?? []).map((v) => <tr key={v.id}><td className="px-3 py-2">{v.employee_name ?? '-'}</td><td className="px-3 py-2">{v.vaccine_name}</td><td className="px-3 py-2">{v.dose_no ?? '-'}</td><td className="px-3 py-2">{v.date_administered ?? '-'}</td><td className="px-3 py-2">{v.next_due_date ?? '-'}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

