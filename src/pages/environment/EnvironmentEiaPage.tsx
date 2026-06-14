import React, { useMemo, useState } from 'react';
import { useUser } from '@insforge/react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { listHrEmployees } from '../../api/services/hrService';
import { createActivityLog } from '../../api/services/activityLogService';
import { deleteEnvImpactAssessment, listEnvImpactAssessments, listLegalRequirementOptions, listRiskAssessmentOptions, upsertEnvImpactAssessment } from '../../api/services/environmentService';
import { buildEnvironmentReportCsv, downloadEnvironmentReportCsv, printEnvironmentReportPdf, renderEnvironmentReportHtml } from '../../api/services/environmentReportsService';
import { HrEmployeeSelect } from '../../components/ui/HrEmployeeSelect';
import { toUserFacingError } from '../../utils/userFacingMessage';

const currentYear = new Date().getFullYear();

function emptyForm() {
  return {
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
    responsibleEmployeeId: '',
    responsibleUserId: '',
    responsibleNameSnapshot: '',
    responsibleExternalName: '',
    reviewDate: '',
    linkedRiskAssessmentIds: [] as string[]
  };
}

export function EnvironmentEiaPage() {
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const [year, setYear] = useState(currentYear);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [responsibleEmployeeFilter, setResponsibleEmployeeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [editing, setEditing] = useState<ReturnType<typeof emptyForm> & { id?: string } | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const [form, setForm] = useState<ReturnType<typeof emptyForm>>(emptyForm());

  const { data: employees } = useAsync(async () => (activeCompanyId ? await listHrEmployees(activeCompanyId) : []), [activeCompanyId]);
  const { data: legalOptions } = useAsync(async () => (activeCompanyId ? await listLegalRequirementOptions(activeCompanyId) : []), [activeCompanyId]);
  const { data: riskOptions } = useAsync(async () => (activeCompanyId ? await listRiskAssessmentOptions(activeCompanyId) : []), [activeCompanyId]);
  const { data: rows, loading, error, refresh } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return await listEnvImpactAssessments(activeCompanyId, { year, fromDate: fromDate || undefined, toDate: toDate || undefined, search });
  }, [activeCompanyId, year, fromDate, toDate, search, refreshKey]);

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

  const filteredRows = useMemo(() => {
    if (!responsibleEmployeeFilter) return rows ?? [];
    return (rows ?? []).filter(
      (row: any) =>
        String(row.responsible_employee_id ?? '') === String(responsibleEmployeeFilter) ||
        String(row.responsible_user_id ?? '') ===
          String((employees ?? []).find((employee) => employee.id === responsibleEmployeeFilter)?.user_id ?? '')
    );
  }, [employees, responsibleEmployeeFilter, rows]);

  const selectedRows = useMemo(
    () => filteredRows.filter((row: any) => selectedRowIds.includes(String(row.id))),
    [filteredRows, selectedRowIds]
  );

  const riskRating = Number(form.severity || 1) * Number(form.likelihood || 1);
  const riskLevel = riskRating <= 5 ? 'Low' : riskRating <= 12 ? 'Medium' : 'High';

  function resetForm() {
    setEditing(null);
    setForm(emptyForm());
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCompanyId || !user?.id) return;
    setSaveError('');
    try {
      const saved = await upsertEnvImpactAssessment({
        companyId: activeCompanyId,
        actorUserId: user.id,
        actorRole: activeRole,
        id: editing?.id,
        ...form,
        legalRequirementId: form.legalRequirementId || null,
        responsibleEmployeeId: form.responsibleEmployeeId || null,
        responsibleUserId: form.responsibleUserId || null,
        responsibleNameSnapshot: form.responsibleNameSnapshot || form.responsibleExternalName || null,
        responsibleExternalName:
          form.responsibleEmployeeId || form.responsibleUserId ? null : form.responsibleExternalName || null,
        linkedRiskAssessmentIds: form.linkedRiskAssessmentIds
      });
      setMessage(editing ? `EIA record ${saved.ref_number} updated.` : `EIA record ${saved.ref_number} created.`);
      resetForm();
      setSelectedRowIds([]);
      setRefreshKey((key) => key + 1);
      await refresh();
    } catch (err) {
      setSaveError(toUserFacingError(err, 'Unable to save EIA record. Please try again.'));
    }
  }

  function startEdit(row: any) {
    setEditing(row);
    setMessage('');
    setForm({
      refNumber: row.ref_number,
      activityOrProcess: row.activity_or_process,
      environmentalAspectCause: row.environmental_aspect_cause,
      potentialImpactEffect: row.potential_impact_effect,
      legalRequirementId: row.legal_requirement_id ?? '',
      legalRequirementLabelSnapshot: row.legal_requirement_label_snapshot ?? '',
      existingControls: row.existing_controls ?? '',
      severity: row.severity,
      likelihood: row.likelihood,
      additionalControls: row.additional_controls ?? '',
      responsibleEmployeeId: row.responsible_employee_id ?? '',
      responsibleUserId: row.responsible_user_id ?? '',
      responsibleNameSnapshot: row.responsible_name_snapshot ?? '',
      responsibleExternalName: row.responsible_external_name ?? '',
      reviewDate: row.review_date ?? '',
      linkedRiskAssessmentIds: row.linked_risk_assessment_ids ?? []
    });
    document.getElementById('env-eia-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function handleDelete(row: { id: string; ref_number: string }) {
    if (!activeCompanyId || !user?.id) return;
    if (!window.confirm(`Delete EIA record ${row.ref_number}?`)) return;
    setSaveError('');
    try {
      await deleteEnvImpactAssessment({
        companyId: activeCompanyId,
        recordId: row.id,
        actorUserId: user.id,
        actorRole: activeRole
      });
      if (editing?.id === row.id) resetForm();
      setMessage(`EIA record ${row.ref_number} deleted.`);
      setSelectedRowIds((current) => current.filter((id) => id !== String(row.id)));
      setRefreshKey((key) => key + 1);
      await refresh();
    } catch (err) {
      setSaveError(toUserFacingError(err, 'Unable to delete EIA record. Please try again.'));
    }
  }

  async function exportRows(mode: 'csv' | 'pdf') {
    if (!activeCompanyId || !user?.id) return;
    const reportRows = selectedRows.length > 0 ? selectedRows : filteredRows;
    const version = 1;
    if (mode === 'csv') {
      downloadEnvironmentReportCsv(`environment-eia-${new Date().toISOString().slice(0, 10)}.csv`, buildEnvironmentReportCsv('eia', reportRows, version));
    } else {
      printEnvironmentReportPdf(renderEnvironmentReportHtml('eia', reportRows, version));
    }
    await createActivityLog({
      companyId: activeCompanyId,
      actorUserId: user.id,
      action: `reports.generate.environment.eia.${mode}`,
      entityType: 'report',
      metadata: { format: mode.toUpperCase(), rowCount: reportRows.length, version }
    });
  }

  return (
    <Layout title="Environmental Impact Assessment (EIA)">
      <div className="space-y-4">
        {message && <div className="rounded-xl border border-success/30 bg-success/5 p-3 text-sm text-success">{message}</div>}
        {saveError && <div className="rounded-xl border border-critical/30 bg-critical/5 p-3 text-sm text-critical">{saveError}</div>}

        <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="px-3 py-2 border rounded-lg text-sm" />
            <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value || currentYear))} className="px-3 py-2 border rounded-lg text-sm" />
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
            <button type="button" onClick={() => void exportRows('csv')} className="px-3 py-2 border rounded-lg text-sm hover:bg-surface-50">
              Export Excel/CSV
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void exportRows('pdf')} className="px-3 py-2 border rounded-lg text-sm hover:bg-surface-50">
              Export PDF
            </button>
            <span className="px-3 py-2 text-xs text-charcoal-500">
              {selectedRows.length > 0 ? `${selectedRows.length} selected for combined report.` : 'Export uses all filtered EIA records unless rows are selected.'}
            </span>
          </div>
        </div>

        <form id="env-eia-form" onSubmit={onSave} className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-sm text-charcoal">{editing ? 'Edit EIA Record' : 'Create EIA Record'}</p>
            <button type="button" onClick={resetForm} className="px-3 py-2 rounded-lg border text-sm hover:bg-surface-50">
              New Record
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input value={form.refNumber} onChange={(e) => setForm({ ...form, refNumber: e.target.value })} placeholder="Ref number" className="px-3 py-2 border rounded-lg text-sm" required />
            <input value={form.activityOrProcess} onChange={(e) => setForm({ ...form, activityOrProcess: e.target.value })} placeholder="Activity or process" className="px-3 py-2 border rounded-lg text-sm" required />
            <input value={form.environmentalAspectCause} onChange={(e) => setForm({ ...form, environmentalAspectCause: e.target.value })} placeholder="Environmental aspect (cause)" className="px-3 py-2 border rounded-lg text-sm" required />
            <input value={form.potentialImpactEffect} onChange={(e) => setForm({ ...form, potentialImpactEffect: e.target.value })} placeholder="Potential impact (effect)" className="px-3 py-2 border rounded-lg text-sm" required />
            <select value={form.legalRequirementId} onChange={(e) => {
              const selected = (legalOptions ?? []).find((item) => item.id === e.target.value);
              setForm({ ...form, legalRequirementId: e.target.value, legalRequirementLabelSnapshot: selected?.label ?? '' });
            }} className="px-3 py-2 border rounded-lg text-sm">
              <option value="">Link legal requirement</option>
              {(legalOptions ?? []).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            <input value={form.existingControls} onChange={(e) => setForm({ ...form, existingControls: e.target.value })} placeholder="Existing controls" className="px-3 py-2 border rounded-lg text-sm" />
            <input type="number" min={1} max={5} value={form.severity} onChange={(e) => setForm({ ...form, severity: Number(e.target.value || 1) })} placeholder="Severity 1-5" className="px-3 py-2 border rounded-lg text-sm" required />
            <input type="number" min={1} max={5} value={form.likelihood} onChange={(e) => setForm({ ...form, likelihood: Number(e.target.value || 1) })} placeholder="Likelihood 1-5" className="px-3 py-2 border rounded-lg text-sm" required />
            <input value={`${riskRating} (${riskLevel})`} readOnly className="px-3 py-2 border rounded-lg text-sm bg-surface-50" />
            <input value={form.additionalControls} onChange={(e) => setForm({ ...form, additionalControls: e.target.value })} placeholder="Additional controls" className="px-3 py-2 border rounded-lg text-sm" />
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
            <input type="date" value={form.reviewDate} onChange={(e) => setForm({ ...form, reviewDate: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" />
          </div>

          <div>
            <p className="text-xs text-charcoal-500 mb-1">Linked risk assessments</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-36 overflow-auto border rounded-lg p-2">
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
          </div>

          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold">
              {editing ? 'Update' : 'Create'}
            </button>
            {editing && (
              <button type="button" onClick={resetForm} className="px-4 py-2 rounded-lg border text-sm">
                Cancel
              </button>
            )}
          </div>
        </form>

        {error && <div className="rounded-xl border border-critical/30 bg-critical/5 p-3 text-sm text-critical">{toUserFacingError(error, 'Unable to load EIA records.')}</div>}
        {loading && <div className="text-center py-8 text-sm text-charcoal-500">Loading EIA records…</div>}
        {!loading && (
          <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
            <table className="w-full text-sm min-w-[980px]">
              <thead className="bg-surface-50">
                <tr>
                  <th className="px-3 py-2 text-left">Select</th>
                  <th className="px-3 py-2 text-left">Ref</th>
                  <th className="px-3 py-2 text-left">Activity</th>
                  <th className="px-3 py-2 text-left">Risk</th>
                  <th className="px-3 py-2 text-left">Level</th>
                  <th className="px-3 py-2 text-left">Responsible</th>
                  <th className="px-3 py-2 text-left">Review date</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {filteredRows.map((row: any) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedRowIds.includes(String(row.id))}
                        onChange={(e) =>
                          setSelectedRowIds((current) =>
                            e.target.checked ? [...current, String(row.id)] : current.filter((id) => id !== String(row.id))
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-2">{row.ref_number}</td>
                    <td className="px-3 py-2">{row.activity_or_process}</td>
                    <td className="px-3 py-2">{row.risk_rating}</td>
                    <td className="px-3 py-2">{row.risk_level}</td>
                    <td className="px-3 py-2">
                      {row.responsible_name_snapshot ||
                        employeeNameById.get(row.responsible_employee_id) ||
                        row.responsible_external_name ||
                        row.responsible_user_id ||
                        '-'}
                    </td>
                    <td className="px-3 py-2">{row.review_date || '-'}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => startEdit(row)} className="px-2 py-1 border rounded text-xs">
                          View/Edit
                        </button>
                        <button type="button" onClick={() => void handleDelete(row)} className="px-2 py-1 border border-critical/30 text-critical rounded text-xs">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-charcoal-500">
                      No EIA records.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
