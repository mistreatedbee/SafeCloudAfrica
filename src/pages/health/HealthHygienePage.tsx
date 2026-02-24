import React, { useEffect, useState } from 'react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import { createHealthHygieneRecord, listHealthHygieneRecords } from '../../api/services/healthService';
import { listRiskAssessments } from '../../api/services/risksService';
import { SelectOrType } from '../../components/ui/SelectOrType';
import { getMergedOptions } from '../../api/services/dynamicOptionsService';
import type { OptionItem } from '../../api/services/dynamicOptionsService';
import type { RiskAssessment } from '../../api/services/risksService';

const tabs = ['Monitoring Records', 'Certificates/Lab Reports', 'Non-compliance & Action Plans'] as const;
type TabKey = (typeof tabs)[number];

export function HealthHygienePage() {
  const { user } = useUser();
  const { activeCompanyId } = useTenant();
  const [tab, setTab] = useState<TabKey>('Monitoring Records');
  const [refreshKey, setRefreshKey] = useState(0);
  const [monitoringOptions, setMonitoringOptions] = useState<OptionItem[]>([]);
  const [form, setForm] = useState({
    monitoringType: '',
    siteLocation: '',
    department: '',
    monitoredOn: '',
    conductedBy: '',
    methodOrStandard: '',
    resultsSummary: '',
    complianceStatus: 'UNKNOWN' as 'COMPLIANT' | 'NON_COMPLIANT' | 'PARTIAL' | 'UNKNOWN',
    nonComplianceReason: '',
    linkedRiskAssessmentIds: [] as string[]
  });

  useEffect(() => {
    async function loadOptions() {
      if (!activeCompanyId) return;
      const builtIns = ['Noise surveys', 'Air quality monitoring', 'Dust sampling', 'Vibration testing', 'Illumination testing', 'Thermal stress monitoring'];
      const merged = await getMergedOptions({ companyId: activeCompanyId, moduleKey: 'health', fieldKey: 'monitoringType' }, builtIns);
      setMonitoringOptions(merged);
    }
    void loadOptions();
  }, [activeCompanyId]);

  const { data: records } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return await listHealthHygieneRecords({ companyId: activeCompanyId, limit: 300 });
  }, [activeCompanyId, refreshKey]);

  const { data: risks } = useAsync<RiskAssessment[]>(async () => {
    if (!activeCompanyId) return [];
    return await listRiskAssessments({ companyId: activeCompanyId, limit: 200 });
  }, [activeCompanyId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCompanyId || !user?.id) return;
    await createHealthHygieneRecord({
      companyId: activeCompanyId,
      monitoringType: form.monitoringType,
      siteLocation: form.siteLocation || null,
      department: form.department || null,
      monitoredOn: form.monitoredOn,
      conductedBy: form.conductedBy || null,
      methodOrStandard: form.methodOrStandard || null,
      resultsSummary: form.resultsSummary || null,
      complianceStatus: form.complianceStatus,
      nonComplianceReason: form.nonComplianceReason || null,
      linkedRiskAssessmentIds: form.linkedRiskAssessmentIds as any,
      createdByUserId: user.id
    });
    setRefreshKey((k) => k + 1);
    setForm({ ...form, monitoredOn: '', resultsSummary: '', nonComplianceReason: '' });
  }

  return (
    <Layout title="Occupational Hygiene Monitoring">
      <div className="space-y-5">
        <div className="bg-white border border-surface-300 rounded-xl p-4">
          <h3 className="font-semibold text-charcoal mb-3">Add monitoring record</h3>
          <form className="grid grid-cols-1 md:grid-cols-3 gap-3" onSubmit={submit}>
            <SelectOrType value={form.monitoringType} onChange={(v) => setForm((s) => ({ ...s, monitoringType: v }))} options={monitoringOptions} placeholder="Monitoring type" allowCreate companyId={activeCompanyId ?? undefined} moduleKey="health" fieldKey="monitoringType" createdByUserId={user?.id ?? undefined} />
            <input value={form.siteLocation} onChange={(e) => setForm((s) => ({ ...s, siteLocation: e.target.value }))} placeholder="Site / location" className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
            <input value={form.department} onChange={(e) => setForm((s) => ({ ...s, department: e.target.value }))} placeholder="Department" className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
            <input type="date" value={form.monitoredOn} onChange={(e) => setForm((s) => ({ ...s, monitoredOn: e.target.value }))} className="px-3 py-2 border border-surface-300 rounded-lg text-sm" required />
            <input value={form.conductedBy} onChange={(e) => setForm((s) => ({ ...s, conductedBy: e.target.value }))} placeholder="Conducted by" className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
            <input value={form.methodOrStandard} onChange={(e) => setForm((s) => ({ ...s, methodOrStandard: e.target.value }))} placeholder="Method / standard" className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
            <textarea value={form.resultsSummary} onChange={(e) => setForm((s) => ({ ...s, resultsSummary: e.target.value }))} placeholder="Results summary" className="px-3 py-2 border border-surface-300 rounded-lg text-sm md:col-span-2" />
            <select value={form.complianceStatus} onChange={(e) => setForm((s) => ({ ...s, complianceStatus: e.target.value as any }))} className="px-3 py-2 border border-surface-300 rounded-lg text-sm">
              <option value="COMPLIANT">Compliant</option>
              <option value="NON_COMPLIANT">Non-compliant</option>
              <option value="PARTIAL">Partial</option>
              <option value="UNKNOWN">Unknown</option>
            </select>
            {form.complianceStatus === 'NON_COMPLIANT' && (
              <input value={form.nonComplianceReason} onChange={(e) => setForm((s) => ({ ...s, nonComplianceReason: e.target.value }))} placeholder="Non-compliance reason" className="px-3 py-2 border border-surface-300 rounded-lg text-sm md:col-span-2" />
            )}
            <select multiple value={form.linkedRiskAssessmentIds} onChange={(e) => setForm((s) => ({ ...s, linkedRiskAssessmentIds: Array.from(e.target.selectedOptions).map((o) => o.value) }))} className="px-3 py-2 border border-surface-300 rounded-lg text-sm h-28">
              {(risks ?? []).map((r) => <option key={r.id} value={r.id}>{r.assessment_number} - {r.title}</option>)}
            </select>
            <button className="px-3 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600">Save hygiene record</button>
          </form>
        </div>

        <div className="flex gap-2">
          {tabs.map((t) => <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 rounded-lg text-sm border ${tab === t ? 'bg-teal text-white border-teal' : 'bg-white border-surface-300 text-charcoal'}`}>{t}</button>)}
        </div>

        <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-50"><tr><th className="px-3 py-2 text-left">Type</th><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Compliance</th><th className="px-3 py-2 text-left">Lab certs</th><th className="px-3 py-2 text-left">Action plan</th></tr></thead>
            <tbody className="divide-y divide-surface-100">
              {(records ?? []).map((r) => (
                <tr key={r.id} className={r.compliance_status === 'NON_COMPLIANT' ? 'bg-critical/5' : ''}>
                  <td className="px-3 py-2">{r.monitoring_type}</td>
                  <td className="px-3 py-2">{r.monitored_on}</td>
                  <td className="px-3 py-2">{r.compliance_status}</td>
                  <td className="px-3 py-2">{r.lab_certificate_file_ids?.length ?? 0}</td>
                  <td className="px-3 py-2">{r.action_plan_id ? <a className="text-teal underline" href="/tasks">View Action Plan</a> : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}

