import React, { useMemo, useState } from 'react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import { listUserProfiles } from '../../api/services/profilesService';
import { deleteEnvImpactAssessment, listEnvImpactAssessments, listLegalRequirementOptions, listRiskAssessmentOptions, upsertEnvImpactAssessment } from '../../api/services/environmentService';
import { toCsv, downloadTextFile } from '../../utils/csv';

const currentYear = new Date().getFullYear();

export function EnvironmentEiaPage() {
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();

  const [year, setYear] = useState(currentYear);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [responsibleUserId, setResponsibleUserId] = useState('');
  const [search, setSearch] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [editing, setEditing] = useState<any | null>(null);

  const [form, setForm] = useState<any>({
    refNumber: '', activityOrProcess: '', environmentalAspectCause: '', potentialImpactEffect: '', legalRequirementId: '', legalRequirementLabelSnapshot: '',
    existingControls: '', severity: 3, likelihood: 3, additionalControls: '', responsibleUserId: '', responsibleExternalName: '', reviewDate: '', linkedRiskAssessmentIds: [] as string[]
  });

  const { data: profiles } = useAsync(async () => (activeCompanyId ? await listUserProfiles(activeCompanyId) : []), [activeCompanyId]);
  const { data: legalOptions } = useAsync(async () => (activeCompanyId ? await listLegalRequirementOptions(activeCompanyId) : []), [activeCompanyId]);
  const { data: riskOptions } = useAsync(async () => (activeCompanyId ? await listRiskAssessmentOptions(activeCompanyId) : []), [activeCompanyId]);
  const { data: rows, loading, error, refresh } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return await listEnvImpactAssessments(activeCompanyId, { year, fromDate: fromDate || undefined, toDate: toDate || undefined, responsibleUserId: responsibleUserId || undefined, search });
  }, [activeCompanyId, year, fromDate, toDate, responsibleUserId, search, refreshKey]);

  const userLabel = useMemo(() => new Map((profiles ?? []).map((p) => [p.user_id, p.full_name || p.email || p.user_id])), [profiles]);
  const riskRating = Number(form.severity || 1) * Number(form.likelihood || 1);
  const riskLevel = riskRating <= 5 ? 'Low' : riskRating <= 12 ? 'Medium' : 'High';

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCompanyId || !user?.id) return;
    await upsertEnvImpactAssessment({
      companyId: activeCompanyId,
      actorUserId: user.id,
      actorRole: activeRole,
      id: editing?.id,
      ...form,
      legalRequirementId: form.legalRequirementId || null,
      responsibleUserId: form.responsibleUserId || null,
      linkedRiskAssessmentIds: form.linkedRiskAssessmentIds
    });
    setEditing(null);
    setForm({ refNumber: '', activityOrProcess: '', environmentalAspectCause: '', potentialImpactEffect: '', legalRequirementId: '', legalRequirementLabelSnapshot: '', existingControls: '', severity: 3, likelihood: 3, additionalControls: '', responsibleUserId: '', responsibleExternalName: '', reviewDate: '', linkedRiskAssessmentIds: [] });
    setRefreshKey((k) => k + 1);
    await refresh();
  }

  function startEdit(row: any) {
    setEditing(row);
    setForm({
      refNumber: row.ref_number, activityOrProcess: row.activity_or_process, environmentalAspectCause: row.environmental_aspect_cause, potentialImpactEffect: row.potential_impact_effect,
      legalRequirementId: row.legal_requirement_id ?? '', legalRequirementLabelSnapshot: row.legal_requirement_label_snapshot ?? '', existingControls: row.existing_controls ?? '',
      severity: row.severity, likelihood: row.likelihood, additionalControls: row.additional_controls ?? '', responsibleUserId: row.responsible_user_id ?? '',
      responsibleExternalName: row.responsible_external_name ?? '', reviewDate: row.review_date ?? '', linkedRiskAssessmentIds: row.linked_risk_assessment_ids ?? []
    });
  }

  async function handleDelete(row: any) {
    if (!activeCompanyId || !user?.id) return;
    if (!window.confirm(`Delete EIA record ${row.ref_number}?`)) return;
    await deleteEnvImpactAssessment({
      companyId: activeCompanyId,
      recordId: row.id,
      actorUserId: user.id,
      actorRole: activeRole
    });
    if (editing?.id === row.id) {
      setEditing(null);
      setForm({
        refNumber: '',
        activityOrProcess: '',
        environmentalAspectCause: '',
        potentialImpactEffect: '',
        legalRequirementId: '',
        legalRequirementLabelSnapshot: '',
        existingControls: '',
        severity: 3,
        likelihood: 3,
        additionalControls: '',
        responsibleUserId: '',
        responsibleExternalName: '',
        reviewDate: '',
        linkedRiskAssessmentIds: []
      });
    }
    setRefreshKey((k) => k + 1);
    await refresh();
  }

  return (
    <Layout title="Environmental Impact Assessment (EIA)">
      <div className="space-y-4">
        <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="px-3 py-2 border rounded-lg text-sm" />
            <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value || currentYear))} className="px-3 py-2 border rounded-lg text-sm" />
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
            <select value={responsibleUserId} onChange={(e) => setResponsibleUserId(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
              <option value="">All responsible</option>
              {(profiles ?? []).map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name || p.email || p.user_id}</option>)}
            </select>
            <button type="button" onClick={() => downloadTextFile(`environment-eia-${new Date().toISOString().slice(0, 10)}.csv`, toCsv((rows ?? []).map((r: any) => ({ ref_number: r.ref_number, activity_or_process: r.activity_or_process, risk_rating: r.risk_rating, risk_level: r.risk_level, review_date: r.review_date ?? '' }))), 'text/csv;charset=utf-8')} className="px-3 py-2 border rounded-lg text-sm hover:bg-surface-50">Export CSV</button>
          </div>
        </div>

        <form onSubmit={onSave} className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
          <p className="font-semibold text-sm text-charcoal">{editing ? 'Edit EIA Record' : 'Create EIA Record'}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input value={form.refNumber} onChange={(e) => setForm({ ...form, refNumber: e.target.value })} placeholder="Ref number" className="px-3 py-2 border rounded-lg text-sm" required />
            <input value={form.activityOrProcess} onChange={(e) => setForm({ ...form, activityOrProcess: e.target.value })} placeholder="Activity or process" className="px-3 py-2 border rounded-lg text-sm" required />
            <input value={form.environmentalAspectCause} onChange={(e) => setForm({ ...form, environmentalAspectCause: e.target.value })} placeholder="Environmental aspect (cause)" className="px-3 py-2 border rounded-lg text-sm" required />
            <input value={form.potentialImpactEffect} onChange={(e) => setForm({ ...form, potentialImpactEffect: e.target.value })} placeholder="Potential impact (effect)" className="px-3 py-2 border rounded-lg text-sm" required />
            <select value={form.legalRequirementId} onChange={(e) => { const selected = (legalOptions ?? []).find((x) => x.id === e.target.value); setForm({ ...form, legalRequirementId: e.target.value, legalRequirementLabelSnapshot: selected?.label ?? '' }); }} className="px-3 py-2 border rounded-lg text-sm">
              <option value="">Link legal requirement</option>
              {(legalOptions ?? []).map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
            <input value={form.existingControls} onChange={(e) => setForm({ ...form, existingControls: e.target.value })} placeholder="Existing controls" className="px-3 py-2 border rounded-lg text-sm" />
            <input type="number" min={1} max={5} value={form.severity} onChange={(e) => setForm({ ...form, severity: Number(e.target.value || 1) })} placeholder="Severity 1-5" className="px-3 py-2 border rounded-lg text-sm" required />
            <input type="number" min={1} max={5} value={form.likelihood} onChange={(e) => setForm({ ...form, likelihood: Number(e.target.value || 1) })} placeholder="Likelihood 1-5" className="px-3 py-2 border rounded-lg text-sm" required />
            <input value={`${riskRating} (${riskLevel})`} readOnly className="px-3 py-2 border rounded-lg text-sm bg-surface-50" />
            <input value={form.additionalControls} onChange={(e) => setForm({ ...form, additionalControls: e.target.value })} placeholder="Additional controls" className="px-3 py-2 border rounded-lg text-sm" />
            <select value={form.responsibleUserId} onChange={(e) => setForm({ ...form, responsibleUserId: e.target.value })} className="px-3 py-2 border rounded-lg text-sm">
              <option value="">Responsible user</option>
              {(profiles ?? []).map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name || p.email || p.user_id}</option>)}
            </select>
            <input value={form.responsibleExternalName} onChange={(e) => setForm({ ...form, responsibleExternalName: e.target.value })} placeholder="Responsible external name" className="px-3 py-2 border rounded-lg text-sm" />
            <input type="date" value={form.reviewDate} onChange={(e) => setForm({ ...form, reviewDate: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div>
            <p className="text-xs text-charcoal-500 mb-1">Linked risk assessments</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-36 overflow-auto border rounded-lg p-2">
              {(riskOptions ?? []).map((r) => {
                const checked = form.linkedRiskAssessmentIds.includes(r.id);
                return (
                  <label key={r.id} className="text-sm flex items-center gap-2">
                    <input type="checkbox" checked={checked} onChange={(e) => setForm({ ...form, linkedRiskAssessmentIds: e.target.checked ? [...form.linkedRiskAssessmentIds, r.id] : form.linkedRiskAssessmentIds.filter((x: string) => x !== r.id) })} />
                    {r.label}
                  </label>
                );
              })}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold">{editing ? 'Update' : 'Create'}</button>
            {editing && <button type="button" onClick={() => { setEditing(null); setForm({ refNumber: '', activityOrProcess: '', environmentalAspectCause: '', potentialImpactEffect: '', legalRequirementId: '', legalRequirementLabelSnapshot: '', existingControls: '', severity: 3, likelihood: 3, additionalControls: '', responsibleUserId: '', responsibleExternalName: '', reviewDate: '', linkedRiskAssessmentIds: [] }); }} className="px-4 py-2 rounded-lg border text-sm">Cancel</button>}
          </div>
        </form>

        {error && <div className="text-sm text-critical">{String(error.message)}</div>}
        {loading ? <p className="text-sm text-charcoal-500">Loading...</p> : (
          <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-surface-50"><tr><th className="px-3 py-2 text-left">Ref</th><th className="px-3 py-2 text-left">Activity</th><th className="px-3 py-2 text-left">Risk</th><th className="px-3 py-2 text-left">Level</th><th className="px-3 py-2 text-left">Responsible</th><th className="px-3 py-2 text-left">Review date</th><th className="px-3 py-2 text-left">Actions</th></tr></thead>
              <tbody className="divide-y divide-surface-100">
                {(rows ?? []).map((row: any) => <tr key={row.id}><td className="px-3 py-2">{row.ref_number}</td><td className="px-3 py-2">{row.activity_or_process}</td><td className="px-3 py-2">{row.risk_rating}</td><td className="px-3 py-2">{row.risk_level}</td><td className="px-3 py-2">{row.responsible_user_id ? (userLabel.get(row.responsible_user_id) ?? row.responsible_user_id) : (row.responsible_external_name || '-')}</td><td className="px-3 py-2">{row.review_date || '-'}</td><td className="px-3 py-2"><div className="flex items-center gap-2"><button type="button" onClick={() => startEdit(row)} className="px-2 py-1 border rounded text-xs">View/Edit</button><button type="button" onClick={() => void handleDelete(row)} className="px-2 py-1 border border-critical/30 text-critical rounded text-xs">Delete</button></div></td></tr>)}
                {(rows ?? []).length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-charcoal-500">No EIA records.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
