import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import { listUserProfiles } from '../../api/services/profilesService';
import { deleteEnvWaterMonitoring, listEnvWaterMonitoring, upsertEnvWaterMonitoring, listLegalRequirementOptions } from '../../api/services/environmentService';
import { toCsv, downloadTextFile } from '../../utils/csv';
import { ListEmptyState } from '../../components/ui/ListEmptyState';
import { DropletsIcon } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { EvidenceModal } from '../../components/evidence/EvidenceModal';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';

const currentYear = new Date().getFullYear();

const WATER_EQUIPMENT_OPTIONS: string[] = [
  'Water sampling bottles',
  'pH meters',
  'Turbidity meters',
  'Dissolved oxygen meters',
  'Conductivity meters',
  'Multi-parameter water quality meters',
  'Laboratory testing kits'
];

export function EnvironmentWaterPage() {
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const [year, setYear] = useState(currentYear);
  const [status, setStatus] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [responsibleUserId, setResponsibleUserId] = useState('');
  const [search, setSearch] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [editing, setEditing] = useState<any | null>(null);
  const [showEvidenceForId, setShowEvidenceForId] = useState<string | null>(null);
  const [form, setForm] = useState<any>({
    referenceNumber: '',
    siteFacilityName: '',
    gpsLocationOrSamplingPointId: '',
    waterType: 'Surface',
    samplingDate: new Date().toISOString().slice(0, 10),
    samplingTime: '',
    purpose: '',
    scope: '',
    monitoringProcess: '',
    legalRequirementId: '',
    legalReferenceSnapshot: '',
    sampleType: 'grab',
    samplingMethodUsed: '',
    weatherConditions: '',
    samplerName: '',
    samplerCompany: '',
    laboratoryUsed: '',
    visualCondition: '',
    odour: '',
    oilSheen: '',
    sedimentPresence: '',
    blockedDrainsOrOverflows: '',
    equipmentUsed: [] as string[],
    parameters: [
      {
        parameterName: 'pH',
        unitOfMeasure: '',
        testMethodOrStandard: '',
        resultValue: '',
        complianceLimit: '',
        complianceStatus: 'Pass'
      }
    ],
    breachedLegislationOrPermitReference: '',
    assessedEnvironmentalRisk: 'Medium',
    potentialCause: '',
    controlsEffectivenessReview: '',
    conclusionComplianceStatement: '',
    laboratoryReportsFileIds: [] as string[],
    calibrationCertificatesFileIds: [] as string[],
    permitsLicencesFileIds: [] as string[],
    samplingLocationsFileIds: [] as string[],
    reviewedByUserId: '',
    approvedByUserId: '',
    approvedAt: ''
  });
  const { restoreDraft, clearDraft } = useDraftManager();
  const draftKey = `env-water:${activeCompanyId ?? 'none'}:${user?.id ?? 'anon'}:${editing?.id ?? 'new'}`;
  const [formBaseline, setFormBaseline] = useState<any>(() => form);
  const [justSaved, setJustSaved] = useState(false);

  const hasDirtyDraft = JSON.stringify(form) !== JSON.stringify(formBaseline);

  useDraftRegistration({
    key: draftKey,
    enabled: Boolean(activeCompanyId && user?.id),
    isDirty: () => hasDirtyDraft,
    serialize: () => form
  });

  useEffect(() => {
    if (!activeCompanyId || !user?.id) return;
    const restored = restoreDraft<any>(draftKey);
    if (restored) {
      setForm(restored);
      setFormBaseline(restored);
    } else {
      setFormBaseline(form);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, activeCompanyId, restoreDraft, user?.id]);

  useEffect(() => {
    if (!justSaved) return;
    setFormBaseline(form);
    setJustSaved(false);
  }, [form, justSaved]);

  const { data: profiles } = useAsync(async () => (activeCompanyId ? await listUserProfiles(activeCompanyId) : []), [activeCompanyId]);
  const { data: legalOptions } = useAsync(async () => (activeCompanyId ? await listLegalRequirementOptions(activeCompanyId) : []), [activeCompanyId]);
  const { data: rows, loading, error, refetch } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return await listEnvWaterMonitoring(activeCompanyId, { year, status, fromDate: fromDate || undefined, toDate: toDate || undefined, responsibleUserId: responsibleUserId || undefined, search });
  }, [activeCompanyId, year, status, fromDate, toDate, responsibleUserId, search, refreshKey]);

  const userLabel = useMemo(() => new Map((profiles ?? []).map((p) => [p.user_id, p.full_name || p.email || p.user_id])), [profiles]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCompanyId || !user?.id) return;
    const keyToClear = draftKey;
    await upsertEnvWaterMonitoring({
      companyId: activeCompanyId,
      actorUserId: user.id,
      actorRole: activeRole,
      id: editing?.id,
      ...form,
      legalRequirementId: form.legalRequirementId || null,
      reviewedByUserId: form.reviewedByUserId || null,
      approvedByUserId: form.approvedByUserId || null,
      approvedAt: form.approvedAt || null
    });
    setEditing(null);
    setForm({
      referenceNumber: '',
      siteFacilityName: '',
      gpsLocationOrSamplingPointId: '',
      waterType: 'Surface',
      samplingDate: new Date().toISOString().slice(0, 10),
      samplingTime: '',
      purpose: '',
      scope: '',
      monitoringProcess: '',
      legalRequirementId: '',
      legalReferenceSnapshot: '',
      sampleType: 'grab',
      samplingMethodUsed: '',
      weatherConditions: '',
      samplerName: '',
      samplerCompany: '',
      laboratoryUsed: '',
      visualCondition: '',
      odour: '',
      oilSheen: '',
      sedimentPresence: '',
      blockedDrainsOrOverflows: '',
      equipmentUsed: [],
      parameters: [
        {
          parameterName: 'pH',
          unitOfMeasure: '',
          testMethodOrStandard: '',
          resultValue: '',
          complianceLimit: '',
          complianceStatus: 'Pass'
        }
      ],
      breachedLegislationOrPermitReference: '',
      assessedEnvironmentalRisk: 'Medium',
      potentialCause: '',
      controlsEffectivenessReview: '',
      conclusionComplianceStatement: '',
      laboratoryReportsFileIds: [],
      calibrationCertificatesFileIds: [],
      permitsLicencesFileIds: [],
      samplingLocationsFileIds: [],
      reviewedByUserId: '',
      approvedByUserId: '',
      approvedAt: ''
    });
    clearDraft(keyToClear);
    setJustSaved(true);
    setRefreshKey((k) => k + 1);
    await refetch();
  }

  function startEdit(row: any) {
    setEditing(row);
    const nextForm = {
      referenceNumber: row.reference_number,
      siteFacilityName: row.site_facility_name,
      gpsLocationOrSamplingPointId: row.gps_location_or_sampling_point_id,
      waterType: row.water_type,
      samplingDate: row.sampling_date,
      samplingTime: row.sampling_time ?? '',
      purpose: row.purpose ?? '',
      scope: row.scope ?? '',
      monitoringProcess: row.monitoring_process ?? '',
      legalRequirementId: row.legal_requirement_id ?? '',
      legalReferenceSnapshot: row.legal_reference_snapshot ?? '',
      sampleType: row.sample_type ?? 'grab',
      samplingMethodUsed: row.sampling_method_used ?? '',
      weatherConditions: row.weather_conditions ?? '',
      samplerName: row.sampler_name ?? '',
      samplerCompany: row.sampler_company ?? '',
      laboratoryUsed: row.laboratory_used ?? '',
      visualCondition: row.visual_condition ?? '',
      odour: row.odour ?? '',
      oilSheen: row.oil_sheen ?? '',
      sedimentPresence: row.sediment_presence ?? '',
      blockedDrainsOrOverflows: row.blocked_drains_or_overflows ?? '',
      equipmentUsed: row.equipment_used ?? [],
      parameters: row.parameters ?? [],
      breachedLegislationOrPermitReference: row.breached_legislation_or_permit_reference ?? '',
      assessedEnvironmentalRisk: row.assessed_environmental_risk ?? 'Medium',
      potentialCause: row.potential_cause ?? '',
      controlsEffectivenessReview: row.controls_effectiveness_review ?? '',
      conclusionComplianceStatement: row.conclusion_compliance_statement ?? '',
      laboratoryReportsFileIds: row.laboratory_reports_file_ids ?? [],
      calibrationCertificatesFileIds: row.calibration_certificates_file_ids ?? [],
      permitsLicencesFileIds: row.permits_licences_file_ids ?? [],
      samplingLocationsFileIds: row.sampling_locations_file_ids ?? [],
      reviewedByUserId: row.reviewed_by_user_id ?? '',
      approvedByUserId: row.approved_by_user_id ?? '',
      approvedAt: row.approved_at?.slice(0, 16) ?? ''
    };
    setForm(nextForm);
    setFormBaseline(nextForm);
  }

  const trendData = useMemo(() => {
    const all: any[] = [];
    (rows ?? []).forEach((row: any) => (row.parameters ?? []).forEach((p: any) => {
      const n = Number(p.resultValue);
      if (!Number.isFinite(n)) return;
      all.push({ date: row.sampling_date, point: row.gps_location_or_sampling_point_id, parameter: p.parameterName, value: n, status: p.complianceStatus });
    }));
    return all.sort((a, b) => a.date.localeCompare(b.date)).slice(-120);
  }, [rows]);

  return (
    <Layout title="Water Monitoring">
      <div className="space-y-4">
        <div className="bg-white border rounded-xl p-4 grid grid-cols-1 md:grid-cols-7 gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="px-3 py-2 border rounded-lg text-sm" />
          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value || currentYear))} className="px-3 py-2 border rounded-lg text-sm" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 border rounded-lg text-sm"><option value="all">All status</option><option value="Pass">Pass</option><option value="Fail">Fail</option></select>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
          <select value={responsibleUserId} onChange={(e) => setResponsibleUserId(e.target.value)} className="px-3 py-2 border rounded-lg text-sm"><option value="">All responsible</option>{(profiles ?? []).map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name || p.email || p.user_id}</option>)}</select>
          <button type="button" onClick={() => downloadTextFile(`environment-water-${new Date().toISOString().slice(0, 10)}.csv`, toCsv((rows ?? []).map((r: any) => ({ reference_number: r.reference_number, sampling_date: r.sampling_date, site_facility_name: r.site_facility_name, overall_compliance_status: r.overall_compliance_status, system_generated_capa_id: r.system_generated_capa_id ?? '' }))), 'text/csv;charset=utf-8')} className="px-3 py-2 border rounded-lg text-sm hover:bg-surface-50">Export CSV</button>
        </div>

        <form id="env-water-monitoring-form" onSubmit={onSave} className="bg-white border rounded-xl p-4 space-y-3">
          <p className="font-semibold text-sm">{editing ? 'Edit water monitoring' : 'Create water monitoring'}</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input value={form.referenceNumber} onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })} placeholder="Reference number" className="px-3 py-2 border rounded-lg text-sm" required />
            <input value={form.siteFacilityName} onChange={(e) => setForm({ ...form, siteFacilityName: e.target.value })} placeholder="Site/facility" className="px-3 py-2 border rounded-lg text-sm" required />
            <input value={form.gpsLocationOrSamplingPointId} onChange={(e) => setForm({ ...form, gpsLocationOrSamplingPointId: e.target.value })} placeholder="Sampling point ID" className="px-3 py-2 border rounded-lg text-sm" required />
            <input value={form.waterType} onChange={(e) => setForm({ ...form, waterType: e.target.value })} placeholder="Water type" className="px-3 py-2 border rounded-lg text-sm" required />
            <input type="date" value={form.samplingDate} onChange={(e) => setForm({ ...form, samplingDate: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" required />
            <input type="time" value={form.samplingTime} onChange={(e) => setForm({ ...form, samplingTime: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" />
            <input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="Purpose" className="px-3 py-2 border rounded-lg text-sm" />
            <input value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} placeholder="Scope" className="px-3 py-2 border rounded-lg text-sm" />
            <select value={form.legalRequirementId} onChange={(e) => { const selected = (legalOptions ?? []).find((x) => x.id === e.target.value); setForm({ ...form, legalRequirementId: e.target.value, legalReferenceSnapshot: selected?.label ?? '' }); }} className="px-3 py-2 border rounded-lg text-sm"><option value="">Legal requirement</option>{(legalOptions ?? []).map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select>
            <input value={form.samplingMethodUsed} onChange={(e) => setForm({ ...form, samplingMethodUsed: e.target.value })} placeholder="Sampling method" className="px-3 py-2 border rounded-lg text-sm" />
            <input value={form.sampleType} onChange={(e) => setForm({ ...form, sampleType: e.target.value })} placeholder="Sample type" className="px-3 py-2 border rounded-lg text-sm" />
            <input value={form.weatherConditions} onChange={(e) => setForm({ ...form, weatherConditions: e.target.value })} placeholder="Weather conditions" className="px-3 py-2 border rounded-lg text-sm" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex flex-col space-y-1">
              <span className="text-xs font-medium text-charcoal-600">Water Monitoring Process</span>
              <input
                value={form.monitoringProcess}
                onChange={(e) => setForm({ ...form, monitoringProcess: e.target.value })}
                placeholder="e.g. Drinking water testing, Wastewater monitoring"
                className="px-3 py-2 border rounded-lg text-sm"
              />
              <span className="text-xs text-charcoal-500">
                Describe the process or activity where water monitoring is conducted.
              </span>
            </div>

            <div className="flex flex-col space-y-1">
              <span className="text-xs font-medium text-charcoal-600">Equipment Used for Water Testing</span>
              <div className="grid grid-cols-1 gap-1 text-sm">
                {WATER_EQUIPMENT_OPTIONS.map((item) => (
                  <label key={item} className="inline-flex items-center gap-2 text-xs md:text-sm">
                    <input
                      type="checkbox"
                      className="rounded border-surface-300"
                      checked={form.equipmentUsed.includes(item)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...form.equipmentUsed, item]
                          : form.equipmentUsed.filter((t: string) => t !== item);
                        setForm({ ...form, equipmentUsed: next });
                      }}
                    />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Parameters</p>
            {form.parameters.map((p: any, idx: number) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-6 gap-2">
                <input value={p.parameterName} onChange={(e) => setForm({ ...form, parameters: form.parameters.map((x: any, i: number) => i === idx ? { ...x, parameterName: e.target.value } : x) })} placeholder="Parameter" className="px-3 py-2 border rounded-lg text-sm" required />
                <input value={p.unitOfMeasure} onChange={(e) => setForm({ ...form, parameters: form.parameters.map((x: any, i: number) => i === idx ? { ...x, unitOfMeasure: e.target.value } : x) })} placeholder="Unit" className="px-3 py-2 border rounded-lg text-sm" />
                <input value={p.testMethodOrStandard} onChange={(e) => setForm({ ...form, parameters: form.parameters.map((x: any, i: number) => i === idx ? { ...x, testMethodOrStandard: e.target.value } : x) })} placeholder="Method/Standard" className="px-3 py-2 border rounded-lg text-sm" />
                <input value={p.resultValue} onChange={(e) => setForm({ ...form, parameters: form.parameters.map((x: any, i: number) => i === idx ? { ...x, resultValue: e.target.value } : x) })} placeholder="Result" className="px-3 py-2 border rounded-lg text-sm" required />
                <input value={p.complianceLimit} onChange={(e) => setForm({ ...form, parameters: form.parameters.map((x: any, i: number) => i === idx ? { ...x, complianceLimit: e.target.value } : x) })} placeholder="Limit" className="px-3 py-2 border rounded-lg text-sm" required />
                <select value={p.complianceStatus} onChange={(e) => setForm({ ...form, parameters: form.parameters.map((x: any, i: number) => i === idx ? { ...x, complianceStatus: e.target.value } : x) })} className="px-3 py-2 border rounded-lg text-sm"><option value="Pass">Pass</option><option value="Fail">Fail</option></select>
              </div>
            ))}
            <button type="button" onClick={() => setForm({ ...form, parameters: [...form.parameters, { parameterName: '', unitOfMeasure: '', testMethodOrStandard: '', resultValue: '', complianceLimit: '', complianceStatus: 'Pass' }] })} className="px-3 py-2 border rounded-lg text-sm">Add parameter</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input value={form.breachedLegislationOrPermitReference} onChange={(e) => setForm({ ...form, breachedLegislationOrPermitReference: e.target.value })} placeholder="Breached legislation/permit" className="px-3 py-2 border rounded-lg text-sm" />
            <select value={form.assessedEnvironmentalRisk} onChange={(e) => setForm({ ...form, assessedEnvironmentalRisk: e.target.value })} className="px-3 py-2 border rounded-lg text-sm"><option>Low</option><option>Medium</option><option>High</option></select>
            <input value={form.potentialCause} onChange={(e) => setForm({ ...form, potentialCause: e.target.value })} placeholder="Potential cause" className="px-3 py-2 border rounded-lg text-sm" />
            <input value={form.controlsEffectivenessReview} onChange={(e) => setForm({ ...form, controlsEffectivenessReview: e.target.value })} placeholder="Controls effectiveness review" className="px-3 py-2 border rounded-lg text-sm" />
          </div>
          <textarea value={form.conclusionComplianceStatement} onChange={(e) => setForm({ ...form, conclusionComplianceStatement: e.target.value })} placeholder="Conclusion / compliance statement" className="w-full px-3 py-2 border rounded-lg text-sm" rows={2} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <select value={form.reviewedByUserId} onChange={(e) => setForm({ ...form, reviewedByUserId: e.target.value })} className="px-3 py-2 border rounded-lg text-sm"><option value="">Reviewed by</option>{(profiles ?? []).map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name || p.email || p.user_id}</option>)}</select>
            <select value={form.approvedByUserId} onChange={(e) => setForm({ ...form, approvedByUserId: e.target.value })} className="px-3 py-2 border rounded-lg text-sm"><option value="">Approved by</option>{(profiles ?? []).map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name || p.email || p.user_id}</option>)}</select>
            <input type="datetime-local" value={form.approvedAt} onChange={(e) => setForm({ ...form, approvedAt: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Laboratory Results Upload</p>
            <p className="text-xs text-charcoal-500">
              Attach laboratory water analysis reports, chemical analysis reports, and water quality certificates (PDF, DOCX, XLSX, images).
            </p>
            <input
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
              className="text-sm"
              onChange={() => {
                // Files are uploaded via the document storage system on the server side;
                // this form only tracks stored file IDs loaded from the record.
              }}
            />
            {Array.isArray(form.laboratoryReportsFileIds) && form.laboratoryReportsFileIds.length > 0 && (
              <div className="mt-2 border rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-surface-50 text-xs font-semibold text-charcoal">Laboratory result files</div>
                <div className="divide-y divide-surface-100">
                  {form.laboratoryReportsFileIds.map((id: string) => (
                    <div key={id} className="px-3 py-2 flex items-center justify-between text-xs">
                      <span className="truncate mr-2">{id}</span>
                      <span className="text-charcoal-400">Stored in document storage</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-2"><button type="submit" className="px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold">{editing ? 'Update' : 'Create'}</button>{editing && <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg border text-sm">Cancel</button>}</div>
        </form>

        <div className="bg-white border rounded-xl p-4">
          <h3 className="font-semibold mb-3">Result Trends</h3>
          <ResponsiveContainer width="100%" height={240}><LineChart data={trendData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis /><Tooltip /><Line type="monotone" dataKey="value" stroke="#3498DB" dot={{ r: 2 }} /></LineChart></ResponsiveContainer>
        </div>

        {error && <div className="text-sm text-critical">{String(error.message)}</div>}
        {loading ? <p className="text-sm text-charcoal-500">Loading...</p> : (
          <div className="bg-white border rounded-xl overflow-auto">
            <table className="w-full min-w-[1250px] text-sm">
              <thead className="bg-surface-50">
                <tr>
                  <th className="px-3 py-2 text-left">Reference</th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Site</th>
                  <th className="px-3 py-2 text-left">Point</th>
                  <th className="px-3 py-2 text-left">Overall</th>
                  <th className="px-3 py-2 text-left">Reviewer</th>
                  <th className="px-3 py-2 text-left">NCR</th>
                  <th className="px-3 py-2 text-left">Documents</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {(rows ?? []).map((r: any) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2">{r.reference_number}</td>
                    <td className="px-3 py-2">{r.sampling_date}</td>
                    <td className="px-3 py-2">{r.site_facility_name}</td>
                    <td className="px-3 py-2">{r.gps_location_or_sampling_point_id}</td>
                    <td className="px-3 py-2">{r.overall_compliance_status}</td>
                    <td className="px-3 py-2">{r.reviewed_by_user_id ? (userLabel.get(r.reviewed_by_user_id) ?? r.reviewed_by_user_id) : '-'}</td>
                    <td className="px-3 py-2">{r.system_generated_capa_id ? <Link to={`/dashboard/management/ncrs`} className="text-teal hover:underline">View NCR</Link> : '-'}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setShowEvidenceForId(r.id)}
                        className="px-2 py-1 border rounded text-xs"
                      >
                        Lab documents
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button type="button" onClick={() => startEdit(r)} className="px-2 py-1 border rounded text-xs">View/Edit</button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!activeCompanyId || !user?.id) return;
                            if (!window.confirm('Delete this water monitoring record?')) return;
                            await deleteEnvWaterMonitoring({
                              companyId: activeCompanyId,
                              recordId: r.id,
                              actorUserId: user.id,
                              actorRole: activeRole
                            });
                            if (String(editing?.id ?? '') === String(r.id)) setEditing(null);
                            setRefreshKey((k) => k + 1);
                            await refetch();
                          }}
                          className="px-2 py-1 border border-critical/30 text-critical rounded text-xs"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(rows ?? []).length === 0 && (
                  <ListEmptyState
                    tableColSpan={9}
                    icon={DropletsIcon}
                    title="No water monitoring records"
                    description="Record sampling results, parameters, and lab evidence for each site and sampling point."
                    primaryAction={{
                      kind: 'button',
                      label: 'Go to create form',
                      onClick: () => document.getElementById('env-water-monitoring-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }}
                  />
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeCompanyId && user?.id && showEvidenceForId && (
          <EvidenceModal
            isOpen={!!showEvidenceForId}
            onClose={() => setShowEvidenceForId(null)}
            companyId={activeCompanyId}
            actorUserId={user.id}
            entityType="env_water_monitoring"
            entityId={showEvidenceForId}
          />
        )}
      </div>
    </Layout>
  );
}

