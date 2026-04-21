import React, { useMemo, useState } from 'react';
import { useUser } from '@insforge/react';
import { GitBranchIcon } from 'lucide-react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { listHrEmployees } from '../../api/services/hrService';
import { buildEnvironmentReportCsv, downloadEnvironmentReportCsv, printEnvironmentReportPdf, renderEnvironmentReportHtml } from '../../api/services/environmentReportsService';
import { createActivityLog } from '../../api/services/activityLogService';
import { deleteEnvRiskOpportunity, listEnvImpactAssessments, listEnvRiskOpportunity, listLegalRequirementOptions, listRiskAssessmentOptions, upsertEnvRiskOpportunity } from '../../api/services/environmentService';
import { ListEmptyState } from '../../components/ui/ListEmptyState';
import { HrEmployeeSelect } from '../../components/ui/HrEmployeeSelect';

const currentYear = new Date().getFullYear();

function emptyForm() {
  return {
    referenceNumber: '',
    category: 'Operational',
    type: 'Risk',
    riskOrOpportunity: '',
    description: '',
    cause: '',
    potentialImpact: '',
    likelihood: 3,
    severityOrBenefit: 3,
    existingControls: '',
    actionRequired: '',
    responsibleEmployeeId: '',
    responsibleUserId: '',
    responsibleNameSnapshot: '',
    responsibleExternalName: '',
    targetDate: '',
    status: 'Open',
    linkedLegalRequirementId: '',
    linkedEiaId: '',
    linkedRiskAssessmentIds: [] as string[]
  };
}

export function EnvironmentRiskOpportunityPage() {
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const [year, setYear] = useState(currentYear);
  const [status, setStatus] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [responsibleEmployeeFilter, setResponsibleEmployeeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [editing, setEditing] = useState<any | null>(null);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState<any>(emptyForm());

  const { data: employees } = useAsync(async () => (activeCompanyId ? await listHrEmployees(activeCompanyId) : []), [activeCompanyId]);
  const { data: legalOptions } = useAsync(async () => (activeCompanyId ? await listLegalRequirementOptions(activeCompanyId) : []), [activeCompanyId]);
  const { data: eiaOptions } = useAsync(async () => (activeCompanyId ? await listEnvImpactAssessments(activeCompanyId, { year }) : []), [activeCompanyId, year]);
  const { data: riskOptions } = useAsync(async () => (activeCompanyId ? await listRiskAssessmentOptions(activeCompanyId) : []), [activeCompanyId]);
  const { data: rows, loading, error, refetch } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return await listEnvRiskOpportunity(activeCompanyId, { year, status, fromDate: fromDate || undefined, toDate: toDate || undefined, search });
  }, [activeCompanyId, year, status, fromDate, toDate, search, refreshKey]);

  const filteredRows = useMemo(() => {
    if (!responsibleEmployeeFilter) return rows ?? [];
    return (rows ?? []).filter(
      (row: any) =>
        String(row.responsible_employee_id ?? '') === String(responsibleEmployeeFilter) ||
        String(row.responsible_user_id ?? '') ===
          String((employees ?? []).find((employee) => employee.id === responsibleEmployeeFilter)?.user_id ?? '')
    );
  }, [employees, responsibleEmployeeFilter, rows]);

  const employeeNameById = useMemo(
    () =>
      new Map(
        (employees ?? []).map((employee) => [
          employee.id,
          `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim() || employee.email || employee.employee_no
        ])
      ),
    [employees]
  );

  const rating = Number(form.likelihood || 1) * Number(form.severityOrBenefit || 1);
  const level = rating <= 5 ? 'Low' : rating <= 12 ? 'Medium' : 'High';

  function resetForm() {
    setEditing(null);
    setForm(emptyForm());
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCompanyId || !user?.id) return;
    const saved = await upsertEnvRiskOpportunity({
      companyId: activeCompanyId,
      actorUserId: user.id,
      actorRole: activeRole,
      id: editing?.id,
      ...form,
      responsibleEmployeeId: form.responsibleEmployeeId || null,
      responsibleUserId: form.responsibleUserId || null,
      responsibleNameSnapshot: form.responsibleNameSnapshot || form.responsibleExternalName || null,
      responsibleExternalName:
        form.responsibleEmployeeId || form.responsibleUserId ? null : form.responsibleExternalName || null,
      linkedLegalRequirementId: form.linkedLegalRequirementId || null,
      linkedEiaId: form.linkedEiaId || null,
      linkedRiskAssessmentIds: form.linkedRiskAssessmentIds
    });
    setMessage(editing ? `${saved.reference_number} updated.` : `${saved.reference_number} created.`);
    resetForm();
    setRefreshKey((key) => key + 1);
    await refetch();
  }

  function startEdit(row: any) {
    setEditing(row);
    setMessage('');
    setForm({
      referenceNumber: row.reference_number,
      category: row.category,
      type: row.type,
      riskOrOpportunity: row.risk_or_opportunity,
      description: row.description ?? '',
      cause: row.cause ?? '',
      potentialImpact: row.potential_impact ?? '',
      likelihood: row.likelihood,
      severityOrBenefit: row.severity_or_benefit,
      existingControls: row.existing_controls ?? '',
      actionRequired: row.action_required ?? '',
      responsibleEmployeeId: row.responsible_employee_id ?? '',
      responsibleUserId: row.responsible_user_id ?? '',
      responsibleNameSnapshot: row.responsible_name_snapshot ?? '',
      responsibleExternalName: row.responsible_external_name ?? '',
      targetDate: row.target_date ?? '',
      status: row.status ?? 'Open',
      linkedLegalRequirementId: row.linked_legal_requirement_id ?? '',
      linkedEiaId: row.linked_eia_id ?? '',
      linkedRiskAssessmentIds: row.linked_risk_assessment_ids ?? []
    });
    document.getElementById('env-risk-opportunity-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function handleDelete(row: any) {
    if (!activeCompanyId || !user?.id) return;
    if (!window.confirm(`Delete risk/opportunity ${row.reference_number}?`)) return;
    await deleteEnvRiskOpportunity({
      companyId: activeCompanyId,
      recordId: row.id,
      actorUserId: user.id,
      actorRole: activeRole
    });
    if (editing?.id === row.id) resetForm();
    setMessage(`${row.reference_number} deleted.`);
    setRefreshKey((key) => key + 1);
    await refetch();
  }

  async function exportRegister(mode: 'csv' | 'pdf') {
    if (!activeCompanyId || !user?.id) return;
    const version = 1;
    if (mode === 'csv') {
      downloadEnvironmentReportCsv(
        `environment-risk-opportunity-${new Date().toISOString().slice(0, 10)}.csv`,
        buildEnvironmentReportCsv('risk_opportunity', filteredRows, version)
      );
    } else {
      printEnvironmentReportPdf(renderEnvironmentReportHtml('risk_opportunity', filteredRows, version));
    }
    await createActivityLog({
      companyId: activeCompanyId,
      actorUserId: user.id,
      action: `reports.generate.environment.risk_opportunity.${mode}`,
      entityType: 'report',
      metadata: { format: mode.toUpperCase(), rowCount: filteredRows.length, version }
    });
  }

  return (
    <Layout title="Environmental Risk & Opportunity Register">
      <div className="space-y-4">
        {message && <div className="rounded-xl border border-success/30 bg-success/5 p-3 text-sm text-success">{message}</div>}

        <div className="bg-white border rounded-xl p-4 grid grid-cols-1 md:grid-cols-7 gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="px-3 py-2 border rounded-lg text-sm" />
          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value || currentYear))} className="px-3 py-2 border rounded-lg text-sm" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 border rounded-lg text-sm"><option value="all">All status</option><option value="Open">Open</option><option value="In Progress">In Progress</option><option value="Closed">Closed</option></select>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
          <select value={responsibleEmployeeFilter} onChange={(e) => setResponsibleEmployeeFilter(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
            <option value="">All responsible</option>
            {(employees ?? []).map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.employee_no} - {`${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim()}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void exportRegister('csv')} className="px-3 py-2 border rounded-lg text-sm hover:bg-surface-50">Export Excel/CSV</button>
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={() => void exportRegister('pdf')} className="px-3 py-2 border rounded-lg text-sm hover:bg-surface-50">Export PDF</button>
        </div>

        <form id="env-risk-opportunity-form" onSubmit={onSave} className="bg-white border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-sm">{editing ? 'Edit risk/opportunity' : 'Create risk/opportunity'}</p>
            <button type="button" onClick={resetForm} className="px-3 py-2 rounded-lg border text-sm hover:bg-surface-50">
              New Record
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input value={form.referenceNumber} onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })} placeholder="Reference number" className="px-3 py-2 border rounded-lg text-sm" required />
            <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Category" className="px-3 py-2 border rounded-lg text-sm" required />
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="px-3 py-2 border rounded-lg text-sm"><option value="Risk">Risk</option><option value="Opportunity">Opportunity</option></select>
            <input value={form.riskOrOpportunity} onChange={(e) => setForm({ ...form, riskOrOpportunity: e.target.value })} placeholder="Risk/Opportunity" className="px-3 py-2 border rounded-lg text-sm" required />
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" className="px-3 py-2 border rounded-lg text-sm" />
            <input value={form.cause} onChange={(e) => setForm({ ...form, cause: e.target.value })} placeholder="Cause" className="px-3 py-2 border rounded-lg text-sm" />
            <input value={form.potentialImpact} onChange={(e) => setForm({ ...form, potentialImpact: e.target.value })} placeholder="Potential impact" className="px-3 py-2 border rounded-lg text-sm" />
            <input value={form.existingControls} onChange={(e) => setForm({ ...form, existingControls: e.target.value })} placeholder="Existing controls" className="px-3 py-2 border rounded-lg text-sm" />
            <input type="number" min={1} max={5} value={form.likelihood} onChange={(e) => setForm({ ...form, likelihood: Number(e.target.value || 1) })} className="px-3 py-2 border rounded-lg text-sm" placeholder="Likelihood 1-5" required />
            <input type="number" min={1} max={5} value={form.severityOrBenefit} onChange={(e) => setForm({ ...form, severityOrBenefit: Number(e.target.value || 1) })} className="px-3 py-2 border rounded-lg text-sm" placeholder="Severity/Benefit 1-5" required />
            <input value={`${rating} (${level})`} readOnly className="px-3 py-2 border rounded-lg text-sm bg-surface-50" />
            <input value={form.actionRequired} onChange={(e) => setForm({ ...form, actionRequired: e.target.value })} placeholder="Action required" className="px-3 py-2 border rounded-lg text-sm" />
            <HrEmployeeSelect
              companyId={activeCompanyId}
              value={form.responsibleEmployeeId}
              valueField="id"
              placeholder="Responsible employee"
              label="Responsible employee"
              onChange={(selectedValue, meta) => {
                setForm((current: any) => ({
                  ...current,
                  responsibleEmployeeId: selectedValue,
                  responsibleUserId: meta.userId ?? '',
                  responsibleNameSnapshot: meta.nameSnapshot ?? '',
                  responsibleExternalName: ''
                }));
              }}
            />
            <label className="block text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">External responsible name</span>
              <input
                value={form.responsibleExternalName}
                onChange={(e) =>
                  setForm({
                    ...form,
                    responsibleExternalName: e.target.value,
                    responsibleEmployeeId: '',
                    responsibleUserId: '',
                    responsibleNameSnapshot: ''
                  })
                }
                placeholder="Use only when not in HR"
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </label>
            <input type="date" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" />
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="px-3 py-2 border rounded-lg text-sm"><option>Open</option><option>In Progress</option><option>Closed</option></select>
            <select value={form.linkedLegalRequirementId} onChange={(e) => setForm({ ...form, linkedLegalRequirementId: e.target.value })} className="px-3 py-2 border rounded-lg text-sm"><option value="">Linked legal requirement</option>{(legalOptions ?? []).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
            <select value={form.linkedEiaId} onChange={(e) => setForm({ ...form, linkedEiaId: e.target.value })} className="px-3 py-2 border rounded-lg text-sm"><option value="">Linked EIA</option>{(eiaOptions ?? []).map((item: any) => <option key={item.id} value={item.id}>{item.ref_number}</option>)}</select>
          </div>

          <div className="max-h-32 overflow-auto border rounded-lg p-2 grid grid-cols-1 md:grid-cols-2 gap-2">
            {(riskOptions ?? []).map((item) => {
              const checked = form.linkedRiskAssessmentIds.includes(item.id);
              return (
                <label key={item.id} className="text-sm flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        linkedRiskAssessmentIds: e.target.checked
                          ? [...form.linkedRiskAssessmentIds, item.id]
                          : form.linkedRiskAssessmentIds.filter((id: string) => id !== item.id)
                      })
                    }
                  />
                  {item.label}
                </label>
              );
            })}
          </div>

          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold">{editing ? 'Update' : 'Create'}</button>
            {editing && <button type="button" onClick={resetForm} className="px-4 py-2 rounded-lg border text-sm">Cancel</button>}
          </div>
        </form>

        {error && <div className="text-sm text-critical">{String(error.message)}</div>}
        {loading ? <p className="text-sm text-charcoal-500">Loading...</p> : (
          <div className="bg-white border rounded-xl overflow-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-surface-50">
                <tr>
                  <th className="px-3 py-2 text-left">Ref</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Title</th>
                  <th className="px-3 py-2 text-left">Rating</th>
                  <th className="px-3 py-2 text-left">Level</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Responsible</th>
                  <th className="px-3 py-2 text-left">Target</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {filteredRows.map((row: any) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2">{row.reference_number}</td>
                    <td className="px-3 py-2">{row.type}</td>
                    <td className="px-3 py-2">{row.risk_or_opportunity}</td>
                    <td className="px-3 py-2">{row.rating}</td>
                    <td className="px-3 py-2">{row.level}</td>
                    <td className="px-3 py-2">{row.status}</td>
                    <td className="px-3 py-2">
                      {row.responsible_name_snapshot ||
                        employeeNameById.get(row.responsible_employee_id) ||
                        row.responsible_external_name ||
                        row.responsible_user_id ||
                        '-'}
                    </td>
                    <td className="px-3 py-2">{row.target_date || '-'}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => startEdit(row)} className="px-2 py-1 border rounded text-xs">View/Edit</button>
                        <button type="button" onClick={() => void handleDelete(row)} className="px-2 py-1 border border-critical/30 text-critical rounded text-xs">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <ListEmptyState
                    tableColSpan={9}
                    icon={GitBranchIcon}
                    title="No environmental risks or opportunities"
                    description="Capture risks and opportunities with ratings, owners, targets, and links to legal or EIA records."
                    primaryAction={{
                      kind: 'button',
                      label: 'Go to create form',
                      onClick: () => document.getElementById('env-risk-opportunity-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }}
                  />
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
