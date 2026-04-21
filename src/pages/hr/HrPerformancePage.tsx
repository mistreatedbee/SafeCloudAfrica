import React, { useEffect, useMemo, useState } from 'react';
import { useUser } from '@insforge/react';
import { Layout } from '../../components/layout/Layout';
import { HrSectionNav } from './HrSectionNav';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { createHrRecord, deleteHrRecord, listHrEmployees, listHrRecords, updateHrRecord } from '../../api/services/hrService';
import { createTask } from '../../api/services/tasksService';
import type { UUID } from '../../api/models/core';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';
import { toUserFacingError } from '../../utils/userFacingMessage';

export function HrPerformancePage() {
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const canManage = ['owner', 'admin', 'manager', 'supervisor'].includes(activeRole ?? '');
  const [employeeId, setEmployeeId] = useState('');
  const [cycle, setCycle] = useState('Annual');
  const [overallRating, setOverallRating] = useState('3');
  const [strengths, setStrengths] = useState('');
  const [assistanceRequired, setAssistanceRequired] = useState('');
  const [weaknesses, setWeaknesses] = useState('');
  const [managerRating, setManagerRating] = useState('3');
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
    overallRating: string;
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
      overallRating,
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
      overallRating,
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
    setOverallRating(restored.overallRating ?? '3');
    setStrengths(restored.strengths ?? '');
    setAssistanceRequired(restored.assistanceRequired ?? '');
    setWeaknesses(restored.weaknesses ?? '');
    setManagerRating(restored.managerRating ?? '3');
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

  const { data: reviews, refetch } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listHrRecords(activeCompanyId, 'hr_performance_reviews');
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
    setOverallRating('3');
    setStrengths('');
    setAssistanceRequired('');
    setWeaknesses('');
    setManagerRating('3');
    setManagerRemarks('');
    setCorrectiveActionsRequired('');
    setResponsibleUserId('');
    setDueDate(new Date().toISOString().slice(0, 10));
  }

  function beginEdit(row: any) {
    setEditingReviewId(row.id as UUID);
    setEmployeeId(String(row.employee_id ?? ''));
    setCycle(String(row.cycle ?? 'Annual'));
    setOverallRating(String(row.overall_rating ?? '3'));
    setStrengths(String(row.strengths ?? ''));
    setAssistanceRequired(String(row.assistance_required ?? ''));
    setWeaknesses(String(row.weaknesses ?? ''));
    setManagerRating(String(row.manager_rating ?? '3'));
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
            overall_rating: Math.max(1, Math.min(5, Number(overallRating || 3))),
            strengths,
            assistance_required: assistanceRequired || null,
            weaknesses: weaknesses || null,
            manager_rating: Math.max(1, Math.min(5, Number(managerRating || 3))),
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
          overall_rating: Math.max(1, Math.min(5, Number(overallRating || 3))),
          strengths,
          assistance_required: assistanceRequired || null,
          weaknesses: weaknesses || null,
          manager_rating: Math.max(1, Math.min(5, Number(managerRating || 3))),
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
          overallRating: '3',
          strengths: '',
          assistanceRequired: '',
          weaknesses: '',
          managerRating: '3',
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

  return (
    <Layout title="Performance Management">
      <div className="space-y-4">
        <HrSectionNav />
        {error && <div className="bg-critical/10 border border-critical/30 rounded-xl p-3 text-sm text-critical">{error}</div>}
        {success && <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700">{success}</div>}

        <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold">Performance review entry</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Employee</span>
              <select className="w-full border border-surface-300 rounded-lg px-3 py-2" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                <option value="">Employee</option>
                {(employees ?? []).map((employee) => <option key={employee.id} value={employee.id}>{employee.first_name} {employee.last_name}</option>)}
              </select>
            </label>
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Cycle</span><input className="w-full border border-surface-300 rounded-lg px-3 py-2" value={cycle} onChange={(e) => setCycle(e.target.value)} /></label>
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Overall rating (1-5)</span><input type="number" min={1} max={5} className="w-full border border-surface-300 rounded-lg px-3 py-2" value={overallRating} onChange={(e) => setOverallRating(e.target.value)} /></label>
            <label className="text-sm md:col-span-3"><span className="block text-xs text-charcoal-500 mb-1">Strengths</span><textarea rows={2} className="w-full border border-surface-300 rounded-lg px-3 py-2" value={strengths} onChange={(e) => setStrengths(e.target.value)} /></label>
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Assistance required</span><input className="w-full border border-surface-300 rounded-lg px-3 py-2" value={assistanceRequired} onChange={(e) => setAssistanceRequired(e.target.value)} /></label>
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Weaknesses</span><input className="w-full border border-surface-300 rounded-lg px-3 py-2" value={weaknesses} onChange={(e) => setWeaknesses(e.target.value)} /></label>
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Manager rating (1-5)</span><input type="number" min={1} max={5} className="w-full border border-surface-300 rounded-lg px-3 py-2" value={managerRating} onChange={(e) => setManagerRating(e.target.value)} /></label>
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
