import React, { useEffect, useMemo, useState } from 'react';
import { useUser } from '@insforge/react';
import { Layout } from '../../components/layout/Layout';
import { HrSectionNav } from './HrSectionNav';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { createHrRecord, deleteHrRecord, listHrEmployees, listHrRecords, updateHrRecord } from '../../api/services/hrService';
import { listDepartments } from '../../api/services/departmentsService';
import { HrEmployeeSelect } from '../../components/ui/HrEmployeeSelect';
import { createTask } from '../../api/services/tasksService';
import type { UUID } from '../../api/models/core';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';
import { toUserFacingError } from '../../utils/userFacingMessage';

type KpaRow = {
  id: string;
  keyPerformanceArea: string;
  outcomeDeliverables: string;
  employeeRating: string;
  managerRating: string;
};

function createBlankKpaRow(): KpaRow {
  return {
    id: crypto.randomUUID(),
    keyPerformanceArea: '',
    outcomeDeliverables: '',
    employeeRating: '',
    managerRating: ''
  };
}

function normalizeKpaRows(value: unknown): KpaRow[] {
  if (!Array.isArray(value)) return [createBlankKpaRow()];
  const rows = value.map((row: any) => ({
    id: String(row.id || crypto.randomUUID()),
    keyPerformanceArea: String(row.keyPerformanceArea ?? row.key_performance_area ?? ''),
    outcomeDeliverables: String(row.outcomeDeliverables ?? row.outcome_deliverables ?? ''),
    employeeRating: String(row.employeeRating ?? row.employee_rating ?? ''),
    managerRating: String(row.managerRating ?? row.manager_rating ?? '')
  }));
  return rows.length > 0 ? rows : [createBlankKpaRow()];
}

export function HrPerformancePage() {
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const canManage = ['owner', 'admin', 'manager', 'supervisor'].includes(activeRole ?? '');
  const [employeeId, setEmployeeId] = useState('');
  const [cycle, setCycle] = useState('Annual');
  const [kpaRows, setKpaRows] = useState<KpaRow[]>(() => [createBlankKpaRow()]);
  const [strengths, setStrengths] = useState('');
  const [assistanceRequired, setAssistanceRequired] = useState('');
  const [weaknesses, setWeaknesses] = useState('');
  const [managerRating, setManagerRating] = useState('');
  const [managerRemarks, setManagerRemarks] = useState('');
  const [correctiveActionsRequired, setCorrectiveActionsRequired] = useState('');
  const [responsibleUserId, setResponsibleUserId] = useState('');
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [editingReviewId, setEditingReviewId] = useState<UUID | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  type HrPerformanceDraftPayload = {
    employeeId: string;
    cycle: string;
    kpaRows: KpaRow[];
    strengths: string;
    assistanceRequired: string;
    weaknesses: string;
    managerRating: string;
    managerRemarks: string;
    correctiveActionsRequired: string;
    responsibleUserId: string;
    dueDate: string;
  };

  const { restoreDraft, clearDraft } = useDraftManager();
  const draftKey = `hr-performance:${activeCompanyId ?? 'none'}:${user?.id ?? 'anon'}`;

  const payload = useMemo<HrPerformanceDraftPayload>(
    () => ({
      employeeId,
      cycle,
      kpaRows,
      strengths,
      assistanceRequired,
      weaknesses,
      managerRating,
      managerRemarks,
      correctiveActionsRequired,
      responsibleUserId,
      dueDate
    }),
    [
      employeeId,
      cycle,
      kpaRows,
      strengths,
      assistanceRequired,
      weaknesses,
      managerRating,
      managerRemarks,
      correctiveActionsRequired,
      responsibleUserId,
      dueDate
    ]
  );

  const payloadJson = useMemo(() => JSON.stringify(payload), [payload]);
  const [draftBaselineJson, setDraftBaselineJson] = useState<string | null>(null);

  const hasDirtyDraft = useMemo(() => {
    if (draftBaselineJson == null) return false;
    return payloadJson !== draftBaselineJson;
  }, [draftBaselineJson, payloadJson]);

  const draftEnabled = Boolean(activeCompanyId && user?.id);

  useDraftRegistration({
    key: draftKey,
    enabled: draftEnabled,
    isDirty: () => hasDirtyDraft,
    serialize: () => payload
  });

  useEffect(() => {
    if (!draftEnabled) return;

    setDraftBaselineJson(payloadJson);
    const restored = restoreDraft<HrPerformanceDraftPayload>(draftKey);
    if (!restored) return;

    setEmployeeId(restored.employeeId ?? '');
    setCycle(restored.cycle ?? 'Annual');
    setKpaRows(normalizeKpaRows(restored.kpaRows));
    setStrengths(restored.strengths ?? '');
    setAssistanceRequired(restored.assistanceRequired ?? '');
    setWeaknesses(restored.weaknesses ?? '');
    setManagerRating(restored.managerRating ?? '');
    setManagerRemarks(restored.managerRemarks ?? '');
    setCorrectiveActionsRequired(restored.correctiveActionsRequired ?? '');
    setResponsibleUserId(restored.responsibleUserId ?? '');
    setDueDate(restored.dueDate ?? new Date().toISOString().slice(0, 10));

    setDraftBaselineJson(JSON.stringify(restored));
  }, [draftEnabled, draftKey, restoreDraft]);

  const { data: employees } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listHrEmployees(activeCompanyId);
  }, [activeCompanyId]);

  const { data: departments } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listDepartments(activeCompanyId);
  }, [activeCompanyId]);

  const departmentLabel = useMemo(
    () => new Map((departments ?? []).map((d) => [String(d.id), d.name])),
    [departments]
  );

  const { data: reviews, refetch } = useAsync(async () => {
    if (!activeCompanyId) return [];
    try {
      return await listHrRecords(activeCompanyId, 'hr_performance_reviews');
    } catch (err) {
      console.error('[hr.performance] list error', err);
      return [];
    }
  }, [activeCompanyId]);

  const employeeLabel = useMemo(
    () => new Map((employees ?? []).map((employee) => [employee.id as UUID, `${employee.first_name} ${employee.last_name}`])),
    [employees]
  );

  const overdueCorrective = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return (reviews ?? []).filter((row) => row.corrective_due_date && String(row.corrective_due_date) < today && String(row.status ?? '') !== 'CLOSED').length;
  }, [reviews]);

  function resetForm() {
    setEditingReviewId(null);
    setEmployeeId('');
    setCycle('Annual');
    setKpaRows([createBlankKpaRow()]);
    setStrengths('');
    setAssistanceRequired('');
    setWeaknesses('');
    setManagerRating('');
    setManagerRemarks('');
    setCorrectiveActionsRequired('');
    setResponsibleUserId('');
    setDueDate(new Date().toISOString().slice(0, 10));
  }

  function beginEdit(row: any) {
    setEditingReviewId(row.id as UUID);
    setEmployeeId(String(row.employee_id ?? ''));
    setCycle(String(row.cycle ?? 'Annual'));
    setKpaRows(normalizeKpaRows(row.kpa_rows));
    setStrengths(String(row.strengths ?? ''));
    setAssistanceRequired(String(row.assistance_required ?? ''));
    setWeaknesses(String(row.weaknesses ?? ''));
    setManagerRating(String(row.manager_rating ?? ''));
    setManagerRemarks(String(row.manager_remarks ?? ''));
    setCorrectiveActionsRequired(String(row.corrective_actions_required ?? ''));
    setResponsibleUserId(String(row.corrective_responsible_user_id ?? ''));
    setDueDate(String(row.corrective_due_date ?? new Date().toISOString().slice(0, 10)));
    setError(null);
    setSuccess(null);
  }

  async function onCreate() {
    if (!activeCompanyId || !user?.id || !employeeId) return;
    setError(null);
    setSuccess(null);
    try {
      let linkedTaskId: UUID | null = null;
      const currentReview = (reviews ?? []).find((row) => String(row.id) === String(editingReviewId));
      if (editingReviewId) {
        linkedTaskId = (currentReview?.linked_task_id as UUID | null) ?? null;
      }
      if (!linkedTaskId && correctiveActionsRequired.trim()) {
        const task = await createTask({
          companyId: activeCompanyId,
          module: 'hr',
          title: `Performance corrective action: ${employeeLabel.get(employeeId as UUID) ?? employeeId}`,
          description: correctiveActionsRequired.trim(),
          category: 'kpi_follow_up',
          riskLevel: 'medium',
          priority: 'medium',
          dueAt: dueDate || undefined,
          assigneeUserId: (responsibleUserId || undefined) as UUID | undefined,
          sourceEntityType: 'hr_performance_review',
          createdByUserId: user.id as UUID
        });
        linkedTaskId = task.id;
      }

      if (editingReviewId) {
        await updateHrRecord('hr_performance_reviews', {
          companyId: activeCompanyId,
          rowId: editingReviewId,
          actorUserId: user.id as UUID,
          patch: {
            employee_id: employeeId,
            cycle,
            overall_rating: null,
            kpa_rows: kpaRows.map((r) => ({
              ...r,
              employeeRating: r.employeeRating !== '' ? Math.max(1, Math.min(5, Number(r.employeeRating))) : null,
              managerRating: r.managerRating !== '' ? Math.max(1, Math.min(5, Number(r.managerRating))) : null
            })),
            strengths,
            assistance_required: assistanceRequired || null,
            weaknesses: weaknesses || null,
            manager_rating: managerRating ? Math.max(1, Math.min(5, Number(managerRating))) : null,
            manager_remarks: managerRemarks || null,
            corrective_actions_required: correctiveActionsRequired || null,
            corrective_responsible_user_id: responsibleUserId || null,
            corrective_due_date: dueDate || null,
            linked_task_id: linkedTaskId
          }
        });
      } else {
        await createHrRecord('hr_performance_reviews', {
          company_id: activeCompanyId,
          employee_id: employeeId,
          cycle,
          review_date: new Date().toISOString().slice(0, 10),
          reviewer_user_id: user.id,
          overall_rating: null,
          kpa_rows: kpaRows.map((r) => ({
            ...r,
            employeeRating: r.employeeRating !== '' ? Math.max(1, Math.min(5, Number(r.employeeRating))) : null,
            managerRating: r.managerRating !== '' ? Math.max(1, Math.min(5, Number(r.managerRating))) : null
          })),
          strengths,
          assistance_required: assistanceRequired || null,
          weaknesses: weaknesses || null,
          manager_rating: managerRating ? Math.max(1, Math.min(5, Number(managerRating))) : null,
          manager_remarks: managerRemarks || null,
          corrective_actions_required: correctiveActionsRequired || null,
          corrective_responsible_user_id: responsibleUserId || null,
          corrective_due_date: dueDate || null,
          improvements: null,
          goals_next_period: null,
          attachments: [],
          employee_acknowledged: false,
          hr_final_approved: false,
          status: 'IN_REVIEW',
          linked_task_id: linkedTaskId,
          created_by_user_id: user.id
        });
      }
      resetForm();
      clearDraft(draftKey);
      setSuccess('Saved successfully');
      setDraftBaselineJson(
        JSON.stringify({
          employeeId: '',
          cycle: 'Annual',
          kpaRows: [createBlankKpaRow()],
          strengths: '',
          assistanceRequired: '',
          weaknesses: '',
          managerRating: '',
          managerRemarks: '',
          correctiveActionsRequired: '',
          responsibleUserId: '',
          dueDate: new Date().toISOString().slice(0, 10)
        })
      );
      await refetch();
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to save this performance review right now.'));
    }
  }

  async function onDelete(rowId: UUID) {
    if (!activeCompanyId || !user?.id) return;
    if (!window.confirm('Delete this performance review? This cannot be undone.')) return;
    try {
      await deleteHrRecord('hr_performance_reviews', {
        companyId: activeCompanyId,
        rowId,
        actorUserId: user.id as UUID
      });
      if (String(editingReviewId ?? '') === String(rowId)) resetForm();
      setSuccess('Saved successfully');
      setError(null);
      await refetch();
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to delete this performance review right now.'));
    }
  }

  function updateKpaRow(rowId: string, patch: Partial<KpaRow>) {
    setKpaRows((rows) => rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
  }

  return (
    <Layout title="Performance Management">
      <div className="space-y-4">
        <HrSectionNav />
        {error && <div className="bg-critical/10 border border-critical/30 rounded-xl p-3 text-sm text-critical">{error}</div>}
        {success && <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700">{success}</div>}

        <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold">Performance review entry</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <HrEmployeeSelect
                companyId={activeCompanyId ?? null}
                value={employeeId as any}
                valueField="id"
                includeUnlinked={true}
                onChange={(val) => setEmployeeId(val)}
                onEmployeeChange={(emp) => {
                  if (emp?.department_id) {
                    // department label lookup already happens via employeeLabel map — no extra state needed
                  }
                }}
                label="Employee"
                placeholder="Search employee..."
              />
            </div>
            <label className="text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Department</span>
              <input
                className="w-full border border-surface-300 rounded-lg px-3 py-2 bg-surface-50"
                readOnly
                value={(() => {
                  const emp = (employees ?? []).find((e) => String(e.id) === employeeId);
                  if (!emp?.department_id) return '';
                  return departmentLabel.get(String(emp.department_id)) ?? '';
                })()}
                placeholder="Auto-filled from employee"
              />
            </label>
            <label className="text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Cycle</span>
              <select className="w-full border border-surface-300 rounded-lg px-3 py-2" value={cycle} onChange={(e) => setCycle(e.target.value)}>
                <option value="Annual">Annual</option>
                <option value="Quarterly">Quarterly</option>
                <option value="Monthly">Monthly</option>
              </select>
            </label>
            <div className="md:col-span-3 rounded-lg border border-surface-200 overflow-auto">
              <div className="flex items-center justify-between gap-3 border-b border-surface-200 px-3 py-2">
                <p className="text-sm font-semibold text-charcoal">Key performance areas</p>
                <button type="button" className="rounded-lg border border-surface-300 px-3 py-1.5 text-xs" onClick={() => setKpaRows((rows) => [...rows, createBlankKpaRow()])}>
                  Add row
                </button>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-surface-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Key Performance Area</th>
                    <th className="px-3 py-2 text-left">Outcome/Deliverables</th>
                    <th className="px-3 py-2 text-left">Employee Rating</th>
                    <th className="px-3 py-2 text-left">Manager Rating</th>
                    <th className="px-3 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {kpaRows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2"><input className="w-full rounded-lg border border-surface-300 px-3 py-2" value={row.keyPerformanceArea} onChange={(e) => updateKpaRow(row.id, { keyPerformanceArea: e.target.value })} /></td>
                      <td className="px-3 py-2"><input className="w-full rounded-lg border border-surface-300 px-3 py-2" value={row.outcomeDeliverables} onChange={(e) => updateKpaRow(row.id, { outcomeDeliverables: e.target.value })} /></td>
                      <td className="px-3 py-2"><input type="number" min={1} max={5} className="w-28 rounded-lg border border-surface-300 px-3 py-2" value={row.employeeRating} onChange={(e) => updateKpaRow(row.id, { employeeRating: e.target.value })} /></td>
                      <td className="px-3 py-2"><input type="number" min={1} max={5} className="w-28 rounded-lg border border-surface-300 px-3 py-2" value={row.managerRating} onChange={(e) => updateKpaRow(row.id, { managerRating: e.target.value })} /></td>
                      <td className="px-3 py-2">
                        <button type="button" className="text-critical hover:underline" onClick={() => setKpaRows((rows) => rows.length > 1 ? rows.filter((item) => item.id !== row.id) : [createBlankKpaRow()])}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Overall manager rating (1–5)</span>
              <input type="number" min={1} max={5} className="w-32 border border-surface-300 rounded-lg px-3 py-2" value={managerRating} onChange={(e) => setManagerRating(e.target.value)} placeholder="1–5" />
            </label>
            <label className="text-sm md:col-span-2"><span className="block text-xs text-charcoal-500 mb-1">Strengths</span><textarea rows={2} className="w-full border border-surface-300 rounded-lg px-3 py-2" value={strengths} onChange={(e) => setStrengths(e.target.value)} /></label>
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Assistance required</span><input className="w-full border border-surface-300 rounded-lg px-3 py-2" autoComplete="off" value={assistanceRequired} onChange={(e) => setAssistanceRequired(e.target.value)} /></label>
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Weaknesses</span><input className="w-full border border-surface-300 rounded-lg px-3 py-2" autoComplete="off" value={weaknesses} onChange={(e) => setWeaknesses(e.target.value)} /></label>
            <label className="text-sm md:col-span-3"><span className="block text-xs text-charcoal-500 mb-1">Manager remarks</span><textarea rows={2} className="w-full border border-surface-300 rounded-lg px-3 py-2" value={managerRemarks} onChange={(e) => setManagerRemarks(e.target.value)} /></label>
            <label className="text-sm md:col-span-2"><span className="block text-xs text-charcoal-500 mb-1">Corrective actions required</span><textarea rows={2} className="w-full border border-surface-300 rounded-lg px-3 py-2" value={correctiveActionsRequired} onChange={(e) => setCorrectiveActionsRequired(e.target.value)} /></label>
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Responsible person</span>
              <select className="w-full border border-surface-300 rounded-lg px-3 py-2" value={responsibleUserId} onChange={(e) => setResponsibleUserId(e.target.value)}>
                <option value="">Select responsible person</option>
                {(employees ?? []).map((employee) => <option key={employee.id} value={employee.user_id ?? ''}>{employee.first_name} {employee.last_name}</option>)}
              </select>
            </label>
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Due date</span><input type="date" className="w-full border border-surface-300 rounded-lg px-3 py-2" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-lg bg-teal text-white text-sm" onClick={() => void onCreate()} disabled={!canManage}>
              {editingReviewId ? 'Update review' : 'Save review'}
            </button>
            {editingReviewId && (
              <button className="px-4 py-2 rounded-lg border border-surface-300 text-sm" onClick={resetForm}>
                Cancel edit
              </button>
            )}
          </div>
        </div>

        <div className="bg-white border border-surface-300 rounded-xl p-4">
          <p className="text-sm text-charcoal-600">Overdue corrective actions: <span className="font-semibold">{overdueCorrective}</span></p>
        </div>

        <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-100"><tr><th className="text-left px-3 py-2">Employee</th><th className="text-left px-3 py-2">Cycle</th><th className="text-left px-3 py-2">Ratings</th><th className="text-left px-3 py-2">Corrective action</th><th className="text-left px-3 py-2">Task</th><th className="text-left px-3 py-2">Status</th><th className="text-left px-3 py-2">Actions</th></tr></thead>
            <tbody>
              {(reviews ?? []).map((row) => (
                <tr key={row.id} className="border-t border-surface-100">
                  <td className="px-3 py-2">{employeeLabel.get(row.employee_id as UUID) ?? String(row.employee_id ?? '')}</td>
                  <td className="px-3 py-2">{String(row.cycle ?? '')}</td>
                  <td className="px-3 py-2">{String(row.overall_rating ?? '')} / {String(row.manager_rating ?? '')}</td>
                  <td className="px-3 py-2">{String(row.corrective_actions_required ?? '-')}<br /><span className="text-xs text-charcoal-500">Due: {String(row.corrective_due_date ?? '-')}</span></td>
                  <td className="px-3 py-2">{row.linked_task_id ? <a className="text-teal underline" href={`/dashboard/management/tasks/${row.linked_task_id}`}>Open task</a> : '-'}</td>
                  <td className="px-3 py-2">{String(row.status ?? '')}</td>
                  <td className="px-3 py-2">
                    {canManage && (
                      <div className="flex gap-2">
                        <button type="button" className="text-charcoal-700 hover:underline" onClick={() => beginEdit(row)}>
                          Edit
                        </button>
                        <button type="button" className="text-critical hover:underline" onClick={() => void onDelete(row.id as UUID)}>
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
