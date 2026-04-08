import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import { listUserProfiles } from '../../api/services/profilesService';
import { deleteEnvAirQuality, listEnvAirQuality, upsertEnvAirQuality, listLegalRequirementOptions } from '../../api/services/environmentService';
import { toCsv, downloadTextFile } from '../../utils/csv';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ListEmptyState } from '../../components/ui/ListEmptyState';
import { WindIcon } from 'lucide-react';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';

const currentYear = new Date().getFullYear();

const MONITORING_TOOL_OPTIONS: string[] = [
  'Air Sampling Pumps',
  'Gas Detectors',
  'Particulate Matter Monitors',
  'Multi-Gas Monitors',
  'Calibration Equipment'
];

export function EnvironmentAirPage() {
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
  const [form, setForm] = useState<any>({
    referenceNumber: '',
    emissionSourceCategories: ['Dust'],
    legalRequirementIds: [] as string[],
    legalReferencesSnapshot: [] as string[],
    monitoringFrequency: 'Monthly',
    monitoringDate: new Date().toISOString().slice(0, 10),
    monitoringTime: '',
    monitoringLocation: '',
    methodUsed: 'Visual',
    equipmentId: '',
    calibrationStatus: '',
    weatherConditions: '',
    conductedByName: '',
    conductedByCompany: '',
    monitoringTools: [] as string[],
    laboratoryResultsFileIds: [] as string[],
    labName: '',
    labAccreditationNumber: '',
    labAccreditationAuthority: '',
    labAccreditationCertificateFileIds: [] as string[],
    results: [{ parameter: 'PM10', resultValue: '', limitValue: '', status: 'Pass' }],
    nonConformanceNotes: '',
    trendAnalysisNotes: '',
    reviewedByUserId: '',
    approvedByUserId: '',
    approvedAt: ''
  });
  const { restoreDraft, clearDraft } = useDraftManager();
  const draftKey = `env-air:${activeCompanyId ?? 'none'}:${user?.id ?? 'anon'}:${editing?.id ?? 'new'}`;
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
    return await listEnvAirQuality(activeCompanyId, { year, status, fromDate: fromDate || undefined, toDate: toDate || undefined, responsibleUserId: responsibleUserId || undefined, search });
  }, [activeCompanyId, year, status, fromDate, toDate, responsibleUserId, search, refreshKey]);

  const userLabel = useMemo(() => new Map((profiles ?? []).map((p) => [p.user_id, p.full_name || p.email || p.user_id])), [profiles]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCompanyId || !user?.id) return;
    const keyToClear = draftKey;
    await upsertEnvAirQuality({
      companyId: activeCompanyId,
      actorUserId: user.id,
      actorRole: activeRole,
      id: editing?.id,
      ...form,
      legalRequirementIds: form.legalRequirementIds,
      monitoringTools: form.monitoringTools,
      laboratoryResultsFileIds: form.laboratoryResultsFileIds,
      labName: form.labName,
      labAccreditationNumber: form.labAccreditationNumber,
      labAccreditationAuthority: form.labAccreditationAuthority,
      labAccreditationCertificateFileIds: form.labAccreditationCertificateFileIds,
      reviewedByUserId: form.reviewedByUserId || null,
      approvedByUserId: form.approvedByUserId || null,
      approvedAt: form.approvedAt || null
    });
    setEditing(null);
    setForm({
      referenceNumber: '',
      emissionSourceCategories: ['Dust'],
      legalRequirementIds: [],
      legalReferencesSnapshot: [],
      monitoringFrequency: 'Monthly',
      monitoringDate: new Date().toISOString().slice(0, 10),
      monitoringTime: '',
      monitoringLocation: '',
      methodUsed: 'Visual',
      equipmentId: '',
      calibrationStatus: '',
      weatherConditions: '',
      conductedByName: '',
      conductedByCompany: '',
      monitoringTools: [],
      laboratoryResultsFileIds: [],
      labName: '',
      labAccreditationNumber: '',
      labAccreditationAuthority: '',
      labAccreditationCertificateFileIds: [],
      results: [{ parameter: 'PM10', resultValue: '', limitValue: '', status: 'Pass' }],
      nonConformanceNotes: '',
      trendAnalysisNotes: '',
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
      emissionSourceCategories: row.emission_source_categories ?? [],
      legalRequirementIds: row.legal_requirement_ids ?? [],
      legalReferencesSnapshot: row.legal_references_snapshot ?? [],
      monitoringFrequency: row.monitoring_frequency,
      monitoringDate: row.monitoring_date,
      monitoringTime: row.monitoring_time ?? '',
      monitoringLocation: row.monitoring_location,
      methodUsed: row.method_used,
      equipmentId: row.equipment_id ?? '',
      calibrationStatus: row.calibration_status ?? '',
      weatherConditions: row.weather_conditions ?? '',
      conductedByName: row.conducted_by_name ?? '',
      conductedByCompany: row.conducted_by_company ?? '',
      monitoringTools: row.monitoring_tools ?? [],
      laboratoryResultsFileIds: row.attachment_file_ids ?? [],
      labName: row.lab_name ?? '',
      labAccreditationNumber: row.lab_accreditation_number ?? '',
      labAccreditationAuthority: row.lab_accreditation_authority ?? '',
      labAccreditationCertificateFileIds: row.lab_accreditation_certificate_file_ids ?? [],
      results: row.results ?? [],
      nonConformanceNotes: row.non_conformance_notes ?? '',
      trendAnalysisNotes: row.trend_analysis_notes ?? '',
      reviewedByUserId: row.reviewed_by_user_id ?? '',
      approvedByUserId: row.approved_by_user_id ?? '',
      approvedAt: row.approved_at?.slice(0, 16) ?? ''
    };
    setForm(nextForm);
    setFormBaseline(nextForm);
  }

  const trendData = useMemo(() => {
    const all: any[] = [];
    (rows ?? []).forEach((row: any) => (row.results ?? []).forEach((p: any) => {
      const n = Number(p.resultValue);
      if (!Number.isFinite(n)) return;
      all.push({ date: row.monitoring_date, parameter: p.parameter, value: n, status: p.status });
    }));
    return all.sort((a, b) => a.date.localeCompare(b.date)).slice(-120);
  }, [rows]);

  return (
    <Layout title="Air Quality Monitoring">
      <div className="space-y-4">
        <div className="bg-white border rounded-xl p-4 grid grid-cols-1 md:grid-cols-7 gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="px-3 py-2 border rounded-lg text-sm" />
          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value || currentYear))} className="px-3 py-2 border rounded-lg text-sm" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 border rounded-lg text-sm"><option value="all">All status</option><option value="Pass">Pass</option><option value="Fail">Fail</option></select>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
          <select value={responsibleUserId} onChange={(e) => setResponsibleUserId(e.target.value)} className="px-3 py-2 border rounded-lg text-sm"><option value="">All responsible</option>{(profiles ?? []).map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name || p.email || p.user_id}</option>)}</select>
          <button type="button" onClick={() => downloadTextFile(`environment-air-${new Date().toISOString().slice(0, 10)}.csv`, toCsv((rows ?? []).map((r: any) => ({ reference_number: r.reference_number, monitoring_date: r.monitoring_date, monitoring_location: r.monitoring_location, overall_status: r.overall_status, system_generated_capa_id: r.system_generated_capa_id ?? '' }))), 'text/csv;charset=utf-8')} className="px-3 py-2 border rounded-lg text-sm hover:bg-surface-50">Export CSV</button>
        </div>

        <form id="env-air-quality-form" onSubmit={onSave} className="bg-white border rounded-xl p-4 space-y-3">
          <p className="font-semibold text-sm">{editing ? 'Edit air quality monitoring' : 'Create air quality monitoring'}</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input value={form.referenceNumber} onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })} placeholder="Reference number" className="px-3 py-2 border rounded-lg text-sm" required />
            <input value={form.emissionSourceCategories.join(', ')} onChange={(e) => setForm({ ...form, emissionSourceCategories: e.target.value.split(',').map((x: string) => x.trim()).filter(Boolean) })} placeholder="Emission source categories (comma separated)" className="px-3 py-2 border rounded-lg text-sm" />
            <div className="flex flex-col space-y-1">
              <span className="text-xs font-medium text-charcoal-600">Linked Standard / Legal Requirement</span>
              <select
                multiple
                value={form.legalRequirementIds}
                onChange={(e) =>
                  setForm({
                    ...form,
                    legalRequirementIds: Array.from(e.target.selectedOptions).map((o) => o.value),
                    legalReferencesSnapshot: Array.from(e.target.selectedOptions).map((o) => o.text)
                  })
                }
                className="px-3 py-2 border rounded-lg text-sm min-h-[96px]"
              >
                {(legalOptions ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <input value={form.monitoringFrequency} onChange={(e) => setForm({ ...form, monitoringFrequency: e.target.value })} placeholder="Monitoring frequency" className="px-3 py-2 border rounded-lg text-sm" required />
            <input type="date" value={form.monitoringDate} onChange={(e) => setForm({ ...form, monitoringDate: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" required />
            <input type="time" value={form.monitoringTime} onChange={(e) => setForm({ ...form, monitoringTime: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" />
            <input value={form.monitoringLocation} onChange={(e) => setForm({ ...form, monitoringLocation: e.target.value })} placeholder="Monitoring location" className="px-3 py-2 border rounded-lg text-sm" required />
            <input value={form.methodUsed} onChange={(e) => setForm({ ...form, methodUsed: e.target.value })} placeholder="Method used" className="px-3 py-2 border rounded-lg text-sm" required />
            <input value={form.equipmentId} onChange={(e) => setForm({ ...form, equipmentId: e.target.value })} placeholder="Equipment ID" className="px-3 py-2 border rounded-lg text-sm" />
            <input value={form.calibrationStatus} onChange={(e) => setForm({ ...form, calibrationStatus: e.target.value })} placeholder="Calibration status" className="px-3 py-2 border rounded-lg text-sm" />
            <input value={form.weatherConditions} onChange={(e) => setForm({ ...form, weatherConditions: e.target.value })} placeholder="Weather conditions" className="px-3 py-2 border rounded-lg text-sm" />
            <input value={form.conductedByName} onChange={(e) => setForm({ ...form, conductedByName: e.target.value })} placeholder="Conducted by" className="px-3 py-2 border rounded-lg text-sm" />
            <input value={form.conductedByCompany} onChange={(e) => setForm({ ...form, conductedByCompany: e.target.value })} placeholder="Conducted by company" className="px-3 py-2 border rounded-lg text-sm" />
            <div className="flex flex-col space-y-1">
              <span className="text-xs font-medium text-charcoal-600">Monitoring Tools</span>
              <div className="grid grid-cols-1 gap-1 text-sm">
                {MONITORING_TOOL_OPTIONS.map((tool) => (
                  <label key={tool} className="inline-flex items-center gap-2 text-xs md:text-sm">
                    <input
                      type="checkbox"
                      className="rounded border-surface-300"
                      checked={form.monitoringTools.includes(tool)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...form.monitoringTools, tool]
                          : form.monitoringTools.filter((t: string) => t !== tool);
                        setForm({ ...form, monitoringTools: next });
                      }}
                    />
                    <span>{tool}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Laboratory Results Upload</p>
            <p className="text-xs text-charcoal-500">
              Attach laboratory reports (PDF, DOCX, XLSX, images) related to this air quality monitoring.
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
            {Array.isArray(form.laboratoryResultsFileIds) && form.laboratoryResultsFileIds.length > 0 && (
              <div className="mt-2 border rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-surface-50 text-xs font-semibold text-charcoal">Laboratory result files</div>
                <div className="divide-y divide-surface-100">
                  {form.laboratoryResultsFileIds.map((id: string) => (
                    <div key={id} className="px-3 py-2 flex items-center justify-between text-xs">
                      <span className="truncate mr-2">{id}</span>
                      <span className="text-charcoal-400">Stored in document storage</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Laboratory Accreditation</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                value={form.labName}
                onChange={(e) => setForm({ ...form, labName: e.target.value })}
                placeholder="Lab name"
                className="px-3 py-2 border rounded-lg text-sm"
              />
              <input
                value={form.labAccreditationNumber}
                onChange={(e) => setForm({ ...form, labAccreditationNumber: e.target.value })}
                placeholder="Accreditation number"
                className="px-3 py-2 border rounded-lg text-sm"
              />
              <input
                value={form.labAccreditationAuthority}
                onChange={(e) => setForm({ ...form, labAccreditationAuthority: e.target.value })}
                placeholder="Accreditation authority (optional)"
                className="px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-medium text-charcoal-600">Upload Accreditation Certificate</span>
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
              {Array.isArray(form.labAccreditationCertificateFileIds) && form.labAccreditationCertificateFileIds.length > 0 && (
                <div className="mt-2 border rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-surface-50 text-xs font-semibold text-charcoal">Accreditation certificates</div>
                  <div className="divide-y divide-surface-100">
                    {form.labAccreditationCertificateFileIds.map((id: string) => (
                      <div key={id} className="px-3 py-2 flex items-center justify-between text-xs">
                        <span className="truncate mr-2">{id}</span>
                        <span className="text-charcoal-400">Stored in document storage</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Results</p>
            {form.results.map((r: any, idx: number) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <input value={r.parameter} onChange={(e) => setForm({ ...form, results: form.results.map((x: any, i: number) => i === idx ? { ...x, parameter: e.target.value } : x) })} placeholder="Parameter" className="px-3 py-2 border rounded-lg text-sm" required />
                <input value={r.resultValue} onChange={(e) => setForm({ ...form, results: form.results.map((x: any, i: number) => i === idx ? { ...x, resultValue: e.target.value } : x) })} placeholder="Result" className="px-3 py-2 border rounded-lg text-sm" required />
                <input value={r.limitValue} onChange={(e) => setForm({ ...form, results: form.results.map((x: any, i: number) => i === idx ? { ...x, limitValue: e.target.value } : x) })} placeholder="Limit" className="px-3 py-2 border rounded-lg text-sm" required />
                <select value={r.status} onChange={(e) => setForm({ ...form, results: form.results.map((x: any, i: number) => i === idx ? { ...x, status: e.target.value } : x) })} className="px-3 py-2 border rounded-lg text-sm"><option value="Pass">Pass</option><option value="Fail">Fail</option></select>
              </div>
            ))}
            <button type="button" onClick={() => setForm({ ...form, results: [...form.results, { parameter: '', resultValue: '', limitValue: '', status: 'Pass' }] })} className="px-3 py-2 border rounded-lg text-sm">Add result</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input value={form.nonConformanceNotes} onChange={(e) => setForm({ ...form, nonConformanceNotes: e.target.value })} placeholder="Non-conformance notes" className="px-3 py-2 border rounded-lg text-sm" />
            <input value={form.trendAnalysisNotes} onChange={(e) => setForm({ ...form, trendAnalysisNotes: e.target.value })} placeholder="Trend analysis notes" className="px-3 py-2 border rounded-lg text-sm" />
            <select value={form.reviewedByUserId} onChange={(e) => setForm({ ...form, reviewedByUserId: e.target.value })} className="px-3 py-2 border rounded-lg text-sm"><option value="">Reviewed by</option>{(profiles ?? []).map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name || p.email || p.user_id}</option>)}</select>
            <select value={form.approvedByUserId} onChange={(e) => setForm({ ...form, approvedByUserId: e.target.value })} className="px-3 py-2 border rounded-lg text-sm"><option value="">Approved by</option>{(profiles ?? []).map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name || p.email || p.user_id}</option>)}</select>
            <input type="datetime-local" value={form.approvedAt} onChange={(e) => setForm({ ...form, approvedAt: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div className="flex gap-2"><button type="submit" className="px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold">{editing ? 'Update' : 'Create'}</button>{editing && <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg border text-sm">Cancel</button>}</div>
        </form>

        <div className="bg-white border rounded-xl p-4"><h3 className="font-semibold mb-3">Trend Graph</h3><ResponsiveContainer width="100%" height={240}><LineChart data={trendData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis /><Tooltip /><Line type="monotone" dataKey="value" stroke="#9B59B6" dot={{ r: 2 }} /></LineChart></ResponsiveContainer></div>

        {error && <div className="text-sm text-critical">{String(error.message)}</div>}
        {loading ? <p className="text-sm text-charcoal-500">Loading...</p> : (
          <div className="bg-white border rounded-xl overflow-auto"><table className="w-full min-w-[1120px] text-sm"><thead className="bg-surface-50"><tr><th className="px-3 py-2 text-left">Reference</th><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Location</th><th className="px-3 py-2 text-left">Method</th><th className="px-3 py-2 text-left">Overall</th><th className="px-3 py-2 text-left">Reviewer</th><th className="px-3 py-2 text-left">NCR</th><th className="px-3 py-2 text-left">Actions</th></tr></thead><tbody className="divide-y divide-surface-100">{(rows ?? []).map((r: any) => <tr key={r.id}><td className="px-3 py-2">{r.reference_number}</td><td className="px-3 py-2">{r.monitoring_date}</td><td className="px-3 py-2">{r.monitoring_location}</td><td className="px-3 py-2">{r.method_used}</td><td className="px-3 py-2">{r.overall_status}</td><td className="px-3 py-2">{r.reviewed_by_user_id ? (userLabel.get(r.reviewed_by_user_id) ?? r.reviewed_by_user_id) : '-'}</td><td className="px-3 py-2">{r.system_generated_capa_id ? <Link to="/dashboard/management/ncrs" className="text-teal hover:underline">View NCR</Link> : '-'}</td><td className="px-3 py-2"><div className="flex gap-2"><button type="button" onClick={() => startEdit(r)} className="px-2 py-1 border rounded text-xs">View/Edit</button><button type="button" onClick={async () => { if (!activeCompanyId || !user?.id) return; if (!window.confirm('Delete this air quality monitoring record?')) return; await deleteEnvAirQuality({ companyId: activeCompanyId, recordId: r.id, actorUserId: user.id, actorRole: activeRole }); if (String(editing?.id ?? '') === String(r.id)) setEditing(null); setRefreshKey((k) => k + 1); await refetch(); }} className="px-2 py-1 border border-critical/30 text-critical rounded text-xs">Delete</button></div></td></tr>)}{(rows ?? []).length === 0 && (
                    <ListEmptyState
                      tableColSpan={8}
                      icon={WindIcon}
                      title="No air quality monitoring records"
                      description="Log stack or ambient results, methods, limits, and approvals for each monitoring event."
                      primaryAction={{
                        kind: 'button',
                        label: 'Go to create form',
                        onClick: () => document.getElementById('env-air-quality-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }}
                    />
                  )}</tbody></table></div>
        )}
      </div>
    </Layout>
  );
}
