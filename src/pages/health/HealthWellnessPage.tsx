import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import {
  createHealthWellnessCampaign,
  createHealthSubstanceCase,
  createHealthVaccination,
  deleteHealthWellnessCampaign,
  deleteHealthSubstanceCase,
  deleteHealthVaccination,
  listHealthSubstanceCases,
  listHealthVaccinations,
  listHealthWellnessCampaigns,
  updateHealthWellnessCampaign,
  updateHealthSubstanceCase,
  updateHealthVaccination
} from '../../api/services/healthService';
import { SelectOrType } from '../../components/ui/SelectOrType';
import { EvidenceModal } from '../../components/evidence/EvidenceModal';
import { getMergedOptions } from '../../api/services/dynamicOptionsService';
import type { CompanyRole } from '../../api/models/core';
import type { OptionItem } from '../../api/services/dynamicOptionsService';
import type { HealthWellnessCampaignType } from '../../api/models/entities';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';

const tabs = ['Programmes/Campaigns', 'Substance Abuse Tracking', 'Vaccination Records'] as const;
type TabKey = (typeof tabs)[number];

export function HealthWellnessPage() {
  const { user } = useUser();
  const { activeCompanyId, activeRole, activeMembership } = useTenant();
  const [tab, setTab] = useState<TabKey>('Programmes/Campaigns');
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [editingSubstanceId, setEditingSubstanceId] = useState<string | null>(null);
  const [editingVaccinationId, setEditingVaccinationId] = useState<string | null>(null);
  const [substanceEvidenceId, setSubstanceEvidenceId] = useState<string | null>(null);
  const [vaccinationEvidenceId, setVaccinationEvidenceId] = useState<string | null>(null);
  const [vaccineOptions, setVaccineOptions] = useState<OptionItem[]>([]);
  const [substanceOptions, setSubstanceOptions] = useState<OptionItem[]>([]);
  const [vaccineName, setVaccineName] = useState('');
  const [substanceManual, setSubstanceManual] = useState('');
  const [campaignForm, setCampaignForm] = useState({
    title: '',
    campaignType: 'Mental health' as HealthWellnessCampaignType,
    dateFrom: '',
    dateTo: '',
    description: ''
  });
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
  const { restoreDraft, clearDraft } = useDraftManager();

  type SubstanceDraft = {
    substanceForm: typeof substanceForm;
    substanceManual: string;
  };

  type VaccinationDraft = {
    vaccineName: string;
    vaccinationForm: typeof vaccinationForm;
  };

  const draftKeySubstance = `health-wellness-substance:${activeCompanyId ?? 'none'}:${user?.id ?? 'anon'}`;
  const draftKeyVaccination = `health-wellness-vaccination:${activeCompanyId ?? 'none'}:${user?.id ?? 'anon'}`;

  const [substanceBaseline, setSubstanceBaseline] = useState<SubstanceDraft>(() => ({
    substanceForm: {
      ...substanceForm,
      substanceSuspected: [...substanceForm.substanceSuspected]
    },
    substanceManual
  }));

  const [vaccinationBaseline, setVaccinationBaseline] = useState<VaccinationDraft>(() => ({
    vaccineName,
    vaccinationForm: { ...vaccinationForm }
  }));

  const hasDirtySubstanceDraft = useMemo(() => {
    return JSON.stringify({ substanceForm, substanceManual }) !== JSON.stringify(substanceBaseline);
  }, [substanceBaseline, substanceForm, substanceManual]);

  const hasDirtyVaccinationDraft = useMemo(() => {
    return JSON.stringify({ vaccineName, vaccinationForm }) !== JSON.stringify(vaccinationBaseline);
  }, [vaccinationBaseline, vaccineName, vaccinationForm]);

  useDraftRegistration({
    key: draftKeySubstance,
    enabled: tab === 'Substance Abuse Tracking' && Boolean(activeCompanyId && user?.id),
    isDirty: () => hasDirtySubstanceDraft,
    serialize: () =>
      ({
        substanceForm,
        substanceManual
      }) satisfies SubstanceDraft
  });

  useDraftRegistration({
    key: draftKeyVaccination,
    enabled: tab === 'Vaccination Records' && Boolean(activeCompanyId && user?.id),
    isDirty: () => hasDirtyVaccinationDraft,
    serialize: () =>
      ({
        vaccineName,
        vaccinationForm
      }) satisfies VaccinationDraft
  });

  useEffect(() => {
    if (tab !== 'Substance Abuse Tracking') return;
    if (!activeCompanyId || !user?.id) return;
    const restored = restoreDraft<SubstanceDraft>(draftKeySubstance);
    if (!restored) return;

    setSubstanceForm((s) => ({
      ...s,
      ...(restored.substanceForm ?? {}),
      substanceSuspected: Array.isArray(restored.substanceForm?.substanceSuspected)
        ? restored.substanceForm.substanceSuspected
        : s.substanceSuspected
    }));
    setSubstanceManual(restored.substanceManual ?? '');
    setSubstanceBaseline({
      substanceForm: {
        ...substanceForm,
        ...(restored.substanceForm ?? {}),
        substanceSuspected: Array.isArray(restored.substanceForm?.substanceSuspected) ? restored.substanceForm.substanceSuspected : []
      },
      substanceManual: restored.substanceManual ?? ''
    });
  }, [activeCompanyId, draftKeySubstance, restoreDraft, tab, user?.id]);

  useEffect(() => {
    if (tab !== 'Vaccination Records') return;
    if (!activeCompanyId || !user?.id) return;
    const restored = restoreDraft<VaccinationDraft>(draftKeyVaccination);
    if (!restored) return;

    setVaccineName(restored.vaccineName ?? '');
    setVaccinationForm((s) => ({ ...s, ...(restored.vaccinationForm ?? {}) }));
    setVaccinationBaseline({
      vaccineName: restored.vaccineName ?? '',
      vaccinationForm: { ...(restored.vaccinationForm ?? {}) }
    });
  }, [activeCompanyId, draftKeyVaccination, restoreDraft, tab, user?.id]);

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
    return await listHealthSubstanceCases({
      companyId: activeCompanyId,
      actorRole: activeRole as CompanyRole,
      actorIsHrManager: activeMembership?.is_hr_manager === true
    });
  }, [activeCompanyId, activeRole, activeMembership?.is_hr_manager, refreshKey]);

  const { data: vaccinations } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return await listHealthVaccinations({ companyId: activeCompanyId, dueInDays: 365 });
  }, [activeCompanyId, refreshKey]);

  async function submitSubstance(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCompanyId || !user?.id) return;
    const allSubstances = [...substanceForm.substanceSuspected, ...(substanceManual ? [substanceManual] : [])];
    if (editingSubstanceId) {
      await updateHealthSubstanceCase(
        activeCompanyId,
        editingSubstanceId as any,
        {
          employee_name: substanceForm.employeeName,
          date_of_report: substanceForm.dateOfReport,
          test_conducted_by: substanceForm.testConductedBy || null,
          type_of_case: substanceForm.typeOfCase as any,
          substance_suspected: allSubstances,
          observed_behaviour_symptoms: substanceForm.observedBehaviourSymptoms || null,
          witness_names: substanceForm.witnessNames.split(',').map((v) => v.trim()).filter(Boolean),
          type_of_test: substanceForm.typeOfTest as any,
          test_result: substanceForm.testResult as any,
          immediate_action_taken: substanceForm.immediateActionTaken || null,
          outcome: substanceForm.outcome as any
        },
        user.id
      );
    } else {
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
        actorRole: activeRole as CompanyRole,
        actorIsHrManager: activeMembership?.is_hr_manager === true
      });
    }
    setRefreshKey((k) => k + 1);
    setEditingSubstanceId(null);
    const clearedSubstanceForm = {
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
    };
    setSubstanceForm(clearedSubstanceForm);
    setSubstanceManual('');
    setSubstanceBaseline({
      substanceForm: clearedSubstanceForm,
      substanceManual: ''
    });
    clearDraft(draftKeySubstance);
  }

  async function submitCampaign(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCompanyId || !user?.id) return;
    if (editingCampaignId) {
      await updateHealthWellnessCampaign(activeCompanyId, editingCampaignId, {
        title: campaignForm.title,
        campaign_type: campaignForm.campaignType,
        date_from: campaignForm.dateFrom || null,
        date_to: campaignForm.dateTo || null,
        description: campaignForm.description || null
      });
    } else {
      await createHealthWellnessCampaign({
        companyId: activeCompanyId,
        title: campaignForm.title,
        campaignType: campaignForm.campaignType,
        dateFrom: campaignForm.dateFrom || null,
        dateTo: campaignForm.dateTo || null,
        description: campaignForm.description || null,
        createdByUserId: user.id
      });
    }
    setEditingCampaignId(null);
    setCampaignForm({
      title: '',
      campaignType: 'Mental health',
      dateFrom: '',
      dateTo: '',
      description: ''
    });
    setRefreshKey((k) => k + 1);
  }

  async function submitVaccination(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCompanyId || !user?.id) return;
    if (editingVaccinationId) {
      await updateHealthVaccination(
        activeCompanyId,
        editingVaccinationId as any,
        {
          employee_name: vaccinationForm.employeeName,
          vaccine_name: vaccineName,
          dose_no: vaccinationForm.doseNo ? Number(vaccinationForm.doseNo) : null,
          date_administered: vaccinationForm.dateAdministered || null,
          batch_no: vaccinationForm.batchNo || null,
          administered_by: vaccinationForm.administeredBy || null,
          next_due_date: vaccinationForm.nextDueDate || null,
          validity: vaccinationForm.validity || null
        },
        user.id
      );
    } else {
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
    }
    setRefreshKey((k) => k + 1);
    setEditingVaccinationId(null);
    setVaccineName('');
    const clearedVaccinationForm = {
      employeeName: '',
      doseNo: '',
      dateAdministered: '',
      batchNo: '',
      administeredBy: '',
      nextDueDate: '',
      validity: ''
    };
    setVaccinationForm(clearedVaccinationForm);
    setVaccinationBaseline({
      vaccineName: '',
      vaccinationForm: clearedVaccinationForm
    });
    clearDraft(draftKeyVaccination);
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
          <div className="space-y-4">
            <form className="bg-white border border-surface-300 rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-3" onSubmit={submitCampaign}>
              <input required value={campaignForm.title} onChange={(e) => setCampaignForm((s) => ({ ...s, title: e.target.value }))} placeholder="Campaign title" className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
              <select value={campaignForm.campaignType} onChange={(e) => setCampaignForm((s) => ({ ...s, campaignType: e.target.value as HealthWellnessCampaignType }))} className="px-3 py-2 border border-surface-300 rounded-lg text-sm">
                <option value="Mental health">Mental health</option>
                <option value="EAP">EAP</option>
                <option value="Stress management">Stress management</option>
                <option value="Awareness">Awareness</option>
              </select>
              <textarea value={campaignForm.description} onChange={(e) => setCampaignForm((s) => ({ ...s, description: e.target.value }))} placeholder="Description" className="px-3 py-2 border border-surface-300 rounded-lg text-sm md:row-span-2" />
              <input type="date" value={campaignForm.dateFrom} onChange={(e) => setCampaignForm((s) => ({ ...s, dateFrom: e.target.value }))} className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
              <input type="date" value={campaignForm.dateTo} onChange={(e) => setCampaignForm((s) => ({ ...s, dateTo: e.target.value }))} className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
              <div className="flex gap-2">
                <button className="px-3 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600">{editingCampaignId ? 'Update campaign' : 'Save campaign'}</button>
                {editingCampaignId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCampaignId(null);
                      setCampaignForm({
                        title: '',
                        campaignType: 'Mental health',
                        dateFrom: '',
                        dateTo: '',
                        description: ''
                      });
                    }}
                    className="px-3 py-2 rounded-lg border border-surface-300 text-sm"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
            <div className="bg-white border border-surface-300 rounded-xl p-4">
              <p className="text-sm text-charcoal-500 mb-3">Mental health, EAP, stress management and awareness campaigns.</p>
              <div className="space-y-2">
                {(campaigns ?? []).map((c) => (
                  <div key={c.id} className="border border-surface-200 rounded-lg p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{c.title}</p>
                        <p className="text-charcoal-500">{c.campaign_type} | {c.date_from ?? '-'} to {c.date_to ?? '-'}</p>
                        {c.description && <p className="text-charcoal-500 mt-1">{c.description}</p>}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button type="button" onClick={() => { setEditingCampaignId(c.id); setCampaignForm({ title: c.title ?? '', campaignType: c.campaign_type ?? 'Mental health', dateFrom: c.date_from ?? '', dateTo: c.date_to ?? '', description: c.description ?? '' }); }} className="px-2 py-1 border rounded text-xs">Edit</button>
                        <button type="button" onClick={async () => { if (!activeCompanyId) return; if (!window.confirm('Delete this wellness campaign?')) return; await deleteHealthWellnessCampaign(activeCompanyId, c.id); if (editingCampaignId === c.id) { setEditingCampaignId(null); setCampaignForm({ title: '', campaignType: 'Mental health', dateFrom: '', dateTo: '', description: '' }); } setRefreshKey((k) => k + 1); }} className="px-2 py-1 border border-critical/30 text-critical rounded text-xs">Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
              <div className="flex gap-2">
                <button className="px-3 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600">{editingSubstanceId ? 'Update substance case' : 'Save substance case'}</button>
                {editingSubstanceId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSubstanceId(null);
                      setSubstanceForm({
                        employeeName: '',
                        dateOfReport: '',
                        testConductedBy: '',
                        typeOfCase: 'Reasonable Suspicion',
                        substanceSuspected: [],
                        observedBehaviourSymptoms: '',
                        witnessNames: '',
                        typeOfTest: 'Breathalyser',
                        testResult: 'Negative',
                        immediateActionTaken: '',
                        outcome: 'Verbal Warning'
                      });
                      setSubstanceManual('');
                    }}
                    className="px-3 py-2 rounded-lg border border-surface-300 text-sm"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
            <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-50"><tr><th className="px-3 py-2 text-left">Employee</th><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Case type</th><th className="px-3 py-2 text-left">Result</th><th className="px-3 py-2 text-left">Actions</th></tr></thead>
                <tbody className="divide-y divide-surface-100">{(substanceCases ?? []).map((s) => <tr key={s.id}><td className="px-3 py-2">{s.employee_name ?? '-'}</td><td className="px-3 py-2">{s.date_of_report}</td><td className="px-3 py-2">{s.type_of_case}</td><td className="px-3 py-2">{s.test_result}</td><td className="px-3 py-2"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => { setEditingSubstanceId(s.id); setSubstanceForm({ employeeName: s.employee_name ?? '', dateOfReport: s.date_of_report ?? '', testConductedBy: s.test_conducted_by ?? '', typeOfCase: s.type_of_case ?? 'Reasonable Suspicion', substanceSuspected: s.substance_suspected ?? [], observedBehaviourSymptoms: s.observed_behaviour_symptoms ?? '', witnessNames: (s.witness_names ?? []).join(', '), typeOfTest: s.type_of_test ?? 'Breathalyser', testResult: s.test_result ?? 'Negative', immediateActionTaken: s.immediate_action_taken ?? '', outcome: s.outcome ?? 'Verbal Warning' }); setSubstanceManual(s.substance_suspected_other ?? ''); }} className="px-2 py-1 border rounded text-xs">Edit</button><button type="button" onClick={() => setSubstanceEvidenceId(s.id)} className="px-2 py-1 border rounded text-xs">Evidence</button><button type="button" onClick={async () => { if (!activeCompanyId || !user?.id) return; if (!window.confirm('Delete this substance case?')) return; await deleteHealthSubstanceCase(activeCompanyId, s.id, user.id); if (editingSubstanceId === s.id) setEditingSubstanceId(null); setRefreshKey((k) => k + 1); }} className="px-2 py-1 border border-critical/30 text-critical rounded text-xs">Delete</button></div></td></tr>)}</tbody>
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
              <div className="flex gap-2">
                <button className="px-3 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600">{editingVaccinationId ? 'Update vaccination' : 'Save vaccination'}</button>
                {editingVaccinationId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingVaccinationId(null);
                      setVaccineName('');
                      setVaccinationForm({
                        employeeName: '',
                        doseNo: '',
                        dateAdministered: '',
                        batchNo: '',
                        administeredBy: '',
                        nextDueDate: '',
                        validity: ''
                      });
                    }}
                    className="px-3 py-2 rounded-lg border border-surface-300 text-sm"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
            <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-50"><tr><th className="px-3 py-2 text-left">Employee</th><th className="px-3 py-2 text-left">Vaccine</th><th className="px-3 py-2 text-left">Dose</th><th className="px-3 py-2 text-left">Administered</th><th className="px-3 py-2 text-left">Next due</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-left">Actions</th></tr></thead>
                <tbody className="divide-y divide-surface-100">{(vaccinations ?? []).map((v) => <tr key={v.id} className={String((v as any).status ?? 'active') === 'archived' ? 'bg-surface-50 text-charcoal-500' : ''}><td className="px-3 py-2">{v.employee_name ?? '-'}</td><td className="px-3 py-2">{v.vaccine_name}</td><td className="px-3 py-2">{v.dose_no ?? '-'}</td><td className="px-3 py-2">{v.date_administered ?? '-'}</td><td className="px-3 py-2">{v.next_due_date ?? '-'}</td><td className="px-3 py-2">{String((v as any).status ?? 'active')}</td><td className="px-3 py-2"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => { setEditingVaccinationId(v.id); setVaccineName(v.vaccine_name ?? ''); setVaccinationForm({ employeeName: v.employee_name ?? '', doseNo: v.dose_no != null ? String(v.dose_no) : '', dateAdministered: v.date_administered ?? '', batchNo: v.batch_no ?? '', administeredBy: v.administered_by ?? '', nextDueDate: v.next_due_date ?? '', validity: v.validity ?? '' }); }} className="px-2 py-1 border rounded text-xs">Edit</button><button type="button" onClick={() => setVaccinationEvidenceId(v.id)} className="px-2 py-1 border rounded text-xs">Documents</button><button type="button" onClick={async () => { if (!activeCompanyId || !user?.id) return; if (!window.confirm('Delete this vaccination record?')) return; await deleteHealthVaccination(activeCompanyId, v.id, user.id); if (editingVaccinationId === v.id) setEditingVaccinationId(null); setRefreshKey((k) => k + 1); }} className="px-2 py-1 border border-critical/30 text-critical rounded text-xs">Delete</button></div></td></tr>)}</tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      {activeCompanyId && user?.id && (
        <>
          {substanceEvidenceId && (
            <EvidenceModal
              open={Boolean(substanceEvidenceId)}
              onClose={() => setSubstanceEvidenceId(null)}
              companyId={activeCompanyId}
              actorUserId={user.id}
              entityType="health_substance_case"
              entityId={substanceEvidenceId}
            />
          )}
          {vaccinationEvidenceId && (
            <EvidenceModal
              open={Boolean(vaccinationEvidenceId)}
              onClose={() => setVaccinationEvidenceId(null)}
              companyId={activeCompanyId}
              actorUserId={user.id}
              entityType="health_vaccination"
              entityId={vaccinationEvidenceId}
            />
          )}
        </>
      )}
    </Layout>
  );
}
