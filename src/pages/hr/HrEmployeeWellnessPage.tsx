import React, { useEffect, useMemo, useState } from 'react';
import { useUser } from '@insforge/react';
import { Link, useLocation } from 'react-router-dom';
import { Layout } from '../../components/layout/Layout';
import { HrSectionNav } from './HrSectionNav';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { HrEmployeeSelect } from '../../components/ui/HrEmployeeSelect';
import type { UUID } from '../../api/models/entities';
import {
  deleteHrRecord,
  listHrEmployees,
  listEmployeeWellnessAssessments,
  createEmployeeWellnessAssessment,
  getEmployeeWellnessAssessment,
  updateEmployeeWellnessAssessment,
  type HrEmployee,
  type HrEmployeeWellnessAssessment,
  type HrEmployeeWellnessAction
} from '../../api/services/hrService';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';

type YesNo = 'yes' | 'no' | null;

type WellnessRow = {
  key: string;
  label: string;
  answer: YesNo;
  comments: string;
};

type HealthRow = {
  key: string;
  label: string;
  status: string;
  comments: string;
};

type SupportRow = {
  key: string;
  label: string;
  answer: YesNo;
  comments: string;
};

type ActivityRow = {
  key: string;
  label: string;
  participation: 'yes' | 'no' | '';
  comments: string;
};

type ActionPlanRow = {
  id?: UUID;
  identifiedIssue: string;
  actionRequired: string;
  responsibleEmployeeId: UUID | null;
  targetDate: string;
};

const WELLNESS_ROWS: Omit<WellnessRow, 'answer' | 'comments'>[] = [
  { key: 'physically_healthy', label: 'Employee feels physically healthy' },
  { key: 'stress_at_work', label: 'Employee experiencing stress at work' },
  { key: 'personal_challenges', label: 'Employee experiencing personal challenges' },
  { key: 'medical_support', label: 'Employee requires medical support' },
  { key: 'work_life_balance', label: 'Employee satisfied with work-life balance' }
];

const HEALTH_ROWS: Omit<HealthRow, 'status' | 'comments'>[] = [
  { key: 'physical_fitness', label: 'Physical fitness' },
  { key: 'stress_level', label: 'Stress level' },
  { key: 'smoking', label: 'Smoking' },
  { key: 'alcohol', label: 'Alcohol consumption' },
  { key: 'sleep_quality', label: 'Sleep quality' }
];

const SUPPORT_ROWS: Omit<SupportRow, 'answer' | 'comments'>[] = [
  { key: 'stress_management', label: 'Stress management support' },
  { key: 'counselling', label: 'Counselling services' },
  { key: 'medical_referral', label: 'Medical referral' },
  { key: 'financial_wellness', label: 'Financial wellness advice' },
  { key: 'health_education', label: 'Health education' }
];

const ACTIVITY_ROWS: Omit<ActivityRow, 'participation' | 'comments'>[] = [
  { key: 'health_screening', label: 'Health screening' },
  { key: 'fitness_programme', label: 'Fitness programme' },
  { key: 'mental_health_awareness', label: 'Mental health awareness' },
  { key: 'wellness_training', label: 'Wellness training' }
];

export function HrEmployeeWellnessPage() {
  const location = useLocation();
  const { activeCompanyId } = useTenant();
  const { user } = useUser();
  const [selectedEmployeeUserId, setSelectedEmployeeUserId] = useState<UUID | ''>('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<UUID | null>(null);
  const [assessmentDate, setAssessmentDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [companyNameSnapshot, setCompanyNameSnapshot] = useState<string>('');
  const [employeeNumberSnapshot, setEmployeeNumberSnapshot] = useState<string>('');
  const [departmentSnapshot, setDepartmentSnapshot] = useState<string>('');
  const [jobTitleSnapshot, setJobTitleSnapshot] = useState<string>('');
  const [lineManagerSnapshot, setLineManagerSnapshot] = useState<string>('');
  const [employeeSignature, setEmployeeSignature] = useState('');
  const [hrSignature, setHrSignature] = useState('');
  const [approvalDate, setApprovalDate] = useState<string>('');
  const [wellnessRows, setWellnessRows] = useState<WellnessRow[]>(
    WELLNESS_ROWS.map((row) => ({ ...row, answer: null, comments: '' }))
  );
  const [healthRows, setHealthRows] = useState<HealthRow[]>(
    HEALTH_ROWS.map((row) => ({ ...row, status: '', comments: '' }))
  );
  const [supportRows, setSupportRows] = useState<SupportRow[]>(
    SUPPORT_ROWS.map((row) => ({ ...row, answer: null, comments: '' }))
  );
  const [activityRows, setActivityRows] = useState<ActivityRow[]>(
    ACTIVITY_ROWS.map((row) => ({ ...row, participation: '', comments: '' }))
  );
  const [actionPlanRows, setActionPlanRows] = useState<ActionPlanRow[]>([
    { identifiedIssue: '', actionRequired: '', responsibleEmployeeId: null, targetDate: '' }
  ]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<UUID | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingAssessmentId, setDeletingAssessmentId] = useState<UUID | null>(null);

  const { data: employees } = useAsync<HrEmployee[]>(
    async () => {
      if (!activeCompanyId) return [];
      return listHrEmployees(activeCompanyId);
    },
    [activeCompanyId]
  );

  const selectedEmployee = useMemo(
    () =>
      employees?.find((e) => e.user_id === selectedEmployeeUserId) ??
      employees?.find((e) => e.id === selectedEmployeeId) ??
      null,
    [employees, selectedEmployeeUserId, selectedEmployeeId]
  );

  const { data: assessments, refetch: refetchAssessments } = useAsync<HrEmployeeWellnessAssessment[]>(
    async () => {
      if (!activeCompanyId) return [];
      return listEmployeeWellnessAssessments({ companyId: activeCompanyId, employeeId: selectedEmployee?.id as UUID | undefined });
    },
    [activeCompanyId, selectedEmployee?.id]
  );

  const employeeById = useMemo(() => new Map((employees ?? []).map((e) => [e.id, e])), [employees]);

  const handleEmployeeChange = (
    employeeId: UUID | '',
    meta: { nameSnapshot: string; employeeId?: UUID | null; employeeNumber?: string | null; userId?: UUID | null }
  ) => {
    setSelectedEmployeeId((employeeId || null) as any);
    setSelectedEmployeeUserId((meta.userId ?? '') as any);
    setSelectedAssessmentId(null);
    setError(null);
    if (!employeeId || !employees?.length) {
      setEmployeeNumberSnapshot('');
      setDepartmentSnapshot('');
      setJobTitleSnapshot('');
      setLineManagerSnapshot('');
      return;
    }
    const emp = employees.find((e) => e.id === employeeId) ?? null;
    setEmployeeNumberSnapshot(emp?.employee_no ?? '');
    setJobTitleSnapshot(emp?.job_title ?? '');
    setDepartmentSnapshot(emp?.department_id ? String(emp.department_id) : '');
    if (emp?.supervisor_user_id) {
      const manager = employees.find((e) => e.user_id === emp.supervisor_user_id) ?? null;
      if (manager) {
        const name = `${manager.first_name ?? ''} ${manager.last_name ?? ''}`.trim() || manager.email;
        setLineManagerSnapshot(name ?? '');
      } else {
        setLineManagerSnapshot('');
      }
    } else {
      setLineManagerSnapshot('');
    }
    if (!companyNameSnapshot && emp?.company_id) {
      setCompanyNameSnapshot('');
    }
  };

  const handleWellnessCheckbox = (rowKey: string, value: YesNo) => {
    setWellnessRows((rows) =>
      rows.map((row) =>
        row.key === rowKey
          ? {
              ...row,
              answer: row.answer === value ? null : value
            }
          : row
      )
    );
  };

  const handleSupportCheckbox = (rowKey: string, value: YesNo) => {
    setSupportRows((rows) =>
      rows.map((row) =>
        row.key === rowKey
          ? {
              ...row,
              answer: row.answer === value ? null : value
            }
          : row
      )
    );
  };

  const handleAddActionRow = () => {
    setActionPlanRows((rows) => [...rows, { identifiedIssue: '', actionRequired: '', responsibleEmployeeId: null, targetDate: '' }]);
  };

  const handleRemoveActionRow = (index: number) => {
    setActionPlanRows((rows) => (rows.length <= 1 ? rows : rows.filter((_, i) => i !== index)));
  };

  const serializeWellnessAnswers = () => {
    const result: Record<string, unknown> = {};
    for (const row of wellnessRows) {
      result[row.key] = {
        answer: row.answer,
        comments: row.comments
      };
    }
    return result;
  };

  const serializeHealth = () => {
    const result: Record<string, unknown> = {};
    for (const row of healthRows) {
      result[row.key] = {
        status: row.status,
        comments: row.comments
      };
    }
    return result;
  };

  const serializeSupport = () => {
    const result: Record<string, unknown> = {};
    for (const row of supportRows) {
      result[row.key] = {
        answer: row.answer,
        comments: row.comments
      };
    }
    return result;
  };

  const serializeActivities = () => {
    const result: Record<string, unknown> = {};
    for (const row of activityRows) {
      result[row.key] = {
        participation: row.participation,
        comments: row.comments
      };
    }
    return result;
  };

  type EmployeeWellnessDraftPayload = {
    assessmentDate: string;
    wellnessRows: WellnessRow[];
    healthRows: HealthRow[];
    supportRows: SupportRow[];
    activityRows: ActivityRow[];
    actionPlanRows: ActionPlanRow[];
    employeeSignature: string;
    hrSignature: string;
    approvalDate: string;
  };

  const { restoreDraft, clearDraft } = useDraftManager();
  const employeeSelectionKey = selectedEmployeeId ? String(selectedEmployeeId) : selectedEmployeeUserId ? String(selectedEmployeeUserId) : '';
  const draftKeyEmployeeWellness = `hr-employee-wellness:${activeCompanyId ?? 'none'}:${user?.id ?? 'anon'}:${employeeSelectionKey || 'unselected'}:${
    selectedAssessmentId ?? 'new'
  }`;
  const isDraftEnabled = Boolean(activeCompanyId && user?.id && employeeSelectionKey);

  const draftPayload = useMemo<EmployeeWellnessDraftPayload>(
    () => ({
      assessmentDate,
      wellnessRows,
      healthRows,
      supportRows,
      activityRows,
      actionPlanRows,
      employeeSignature,
      hrSignature,
      approvalDate
    }),
    [actionPlanRows, activityRows, approvalDate, assessmentDate, employeeSignature, healthRows, hrSignature, supportRows, wellnessRows]
  );

  const [wellnessDraftBaseline, setWellnessDraftBaseline] = useState<EmployeeWellnessDraftPayload>(() => draftPayload);

  const hasDirtyWellnessDraft = useMemo(() => {
    return JSON.stringify(draftPayload) !== JSON.stringify(wellnessDraftBaseline);
  }, [draftPayload, wellnessDraftBaseline]);

  useDraftRegistration({
    key: draftKeyEmployeeWellness,
    enabled: isDraftEnabled,
    isDirty: () => hasDirtyWellnessDraft,
    serialize: () => draftPayload
  });

  useEffect(() => {
    if (!isDraftEnabled) return;
    const restored = restoreDraft<EmployeeWellnessDraftPayload>(draftKeyEmployeeWellness);
    if (restored) {
      const next: EmployeeWellnessDraftPayload = {
        assessmentDate: typeof restored.assessmentDate === 'string' ? restored.assessmentDate : assessmentDate,
        wellnessRows: Array.isArray(restored.wellnessRows) ? restored.wellnessRows : wellnessRows,
        healthRows: Array.isArray(restored.healthRows) ? restored.healthRows : healthRows,
        supportRows: Array.isArray(restored.supportRows) ? restored.supportRows : supportRows,
        activityRows: Array.isArray(restored.activityRows) ? restored.activityRows : activityRows,
        actionPlanRows: Array.isArray(restored.actionPlanRows) && restored.actionPlanRows.length > 0 ? restored.actionPlanRows : actionPlanRows,
        employeeSignature: typeof restored.employeeSignature === 'string' ? restored.employeeSignature : employeeSignature,
        hrSignature: typeof restored.hrSignature === 'string' ? restored.hrSignature : hrSignature,
        approvalDate: typeof restored.approvalDate === 'string' ? restored.approvalDate : approvalDate
      };

      setAssessmentDate(next.assessmentDate);
      setWellnessRows(next.wellnessRows);
      setHealthRows(next.healthRows);
      setSupportRows(next.supportRows);
      setActivityRows(next.activityRows);
      setActionPlanRows(next.actionPlanRows);
      setEmployeeSignature(next.employeeSignature);
      setHrSignature(next.hrSignature);
      setApprovalDate(next.approvalDate);
      setWellnessDraftBaseline(next);
      return;
    }

    // No draft found for this context; treat current state as "clean" so we don't re-save immediately.
    setWellnessDraftBaseline(draftPayload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKeyEmployeeWellness, isDraftEnabled, restoreDraft]);

  const resetForm = () => {
    const keyToClear = draftKeyEmployeeWellness;
    const nextAssessmentDate = new Date().toISOString().slice(0, 10);
    const nextWellnessRows = WELLNESS_ROWS.map((row) => ({ ...row, answer: null, comments: '' }));
    const nextHealthRows = HEALTH_ROWS.map((row) => ({ ...row, status: '', comments: '' }));
    const nextSupportRows = SUPPORT_ROWS.map((row) => ({ ...row, answer: null, comments: '' }));
    const nextActivityRows = ACTIVITY_ROWS.map((row) => ({ ...row, participation: '', comments: '' }));
    const nextActionPlanRows: ActionPlanRow[] = [{ identifiedIssue: '', actionRequired: '', responsibleEmployeeId: null, targetDate: '' }];

    setAssessmentDate(nextAssessmentDate);
    setWellnessRows(nextWellnessRows);
    setHealthRows(nextHealthRows);
    setSupportRows(nextSupportRows);
    setActivityRows(nextActivityRows);
    setActionPlanRows(nextActionPlanRows);
    setEmployeeSignature('');
    setHrSignature('');
    setApprovalDate('');
    setSelectedAssessmentId(null);

    clearDraft(keyToClear);
    setWellnessDraftBaseline({
      assessmentDate: nextAssessmentDate,
      wellnessRows: nextWellnessRows,
      healthRows: nextHealthRows,
      supportRows: nextSupportRows,
      activityRows: nextActivityRows,
      actionPlanRows: nextActionPlanRows,
      employeeSignature: '',
      hrSignature: '',
      approvalDate: ''
    });
  };

  const loadAssessment = async (assessmentId: UUID) => {
    if (!activeCompanyId) return;
    setError(null);
    try {
      const { assessment, actions } = await getEmployeeWellnessAssessment({ companyId: activeCompanyId, assessmentId });
      if (!assessment) return;
      setSelectedAssessmentId(assessmentId);
      setAssessmentDate(assessment.assessment_date ?? new Date().toISOString().slice(0, 10));
      setCompanyNameSnapshot(assessment.company_name ?? '');
      setEmployeeNumberSnapshot(assessment.employee_number ?? '');
      setJobTitleSnapshot(assessment.job_title ?? '');
      setLineManagerSnapshot(assessment.line_manager_name ?? '');
      if (assessment.approval_date) setApprovalDate(assessment.approval_date);
      setEmployeeSignature(assessment.employee_signature ?? '');
      setHrSignature(assessment.wellness_officer_signature ?? '');

      const wellness = (assessment.wellness_assessment_answers ?? {}) as Record<string, { answer?: YesNo; comments?: string }>;
      setWellnessRows(
        WELLNESS_ROWS.map((row) => ({
          ...row,
          answer: (wellness[row.key]?.answer as YesNo) ?? null,
          comments: wellness[row.key]?.comments ?? ''
        }))
      );
      const health = (assessment.health_lifestyle_assessment ?? {}) as Record<string, { status?: string; comments?: string }>;
      setHealthRows(
        HEALTH_ROWS.map((row) => ({
          ...row,
          status: health[row.key]?.status ?? '',
          comments: health[row.key]?.comments ?? ''
        }))
      );
      const support = (assessment.workplace_wellness_needs ?? {}) as Record<string, { answer?: YesNo; comments?: string }>;
      setSupportRows(
        SUPPORT_ROWS.map((row) => ({
          ...row,
          answer: (support[row.key]?.answer as YesNo) ?? null,
          comments: support[row.key]?.comments ?? ''
        }))
      );
      const activities = (assessment.programme_participation ?? {}) as Record<string, { participation?: string; comments?: string }>;
      setActivityRows(
        ACTIVITY_ROWS.map((row) => ({
          ...row,
          participation: (activities[row.key]?.participation as 'yes' | 'no' | '') ?? '',
          comments: activities[row.key]?.comments ?? ''
        }))
      );
      setActionPlanRows(
        (actions ?? []).map<ActionPlanRow>((action) => ({
          id: action.id,
          identifiedIssue: action.identified_issue,
          actionRequired: action.action_required,
          responsibleEmployeeId: action.responsible_employee_id ?? null,
          targetDate: action.target_date ?? ''
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load wellness assessment.');
    }
  };

  const handleSave = async () => {
    if (!activeCompanyId || !user?.id || !selectedEmployee || !selectedEmployee.id) {
      setError('Please select an employee before saving.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const keyToClear = draftKeyEmployeeWellness;
      let createdAssessmentId: UUID | null = null;
      const wellnessAssessmentAnswers = serializeWellnessAnswers();
      const healthLifestyleAssessment = serializeHealth();
      const workplaceWellnessNeeds = serializeSupport();
      const programmeParticipation = serializeActivities();

      const actions = actionPlanRows.map((row) => ({
        id: row.id,
        identifiedIssue: row.identifiedIssue,
        actionRequired: row.actionRequired,
        responsibleEmployeeId: row.responsibleEmployeeId,
        targetDate: row.targetDate || null
      }));

      if (!selectedAssessmentId) {
        const { assessment } = await createEmployeeWellnessAssessment({
          companyId: activeCompanyId,
          employeeId: selectedEmployee.id,
          departmentId: selectedEmployee.department_id,
          assessmentDate,
          header: {
            companyName: companyNameSnapshot || null,
            employeeNumber: employeeNumberSnapshot || selectedEmployee.employee_no,
            jobTitle: jobTitleSnapshot || selectedEmployee.job_title,
            lineManagerName: lineManagerSnapshot || null
          },
          wellnessAssessmentAnswers,
          healthLifestyleAssessment,
          workplaceWellnessNeeds,
          programmeParticipation,
          approvals: {
            employeeSignature: employeeSignature || null,
            wellnessOfficerSignature: hrSignature || null,
            approvalDate: approvalDate || null
          },
          actions,
          actorUserId: user.id as UUID
        });
        createdAssessmentId = assessment.id;
        setSelectedAssessmentId(assessment.id);
      } else {
        await updateEmployeeWellnessAssessment({
          companyId: activeCompanyId,
          assessmentId: selectedAssessmentId,
          departmentId: selectedEmployee.department_id,
          assessmentDate,
          header: {
            companyName: companyNameSnapshot || null,
            employeeNumber: employeeNumberSnapshot || selectedEmployee.employee_no,
            jobTitle: jobTitleSnapshot || selectedEmployee.job_title,
            lineManagerName: lineManagerSnapshot || null
          },
          wellnessAssessmentAnswers,
          healthLifestyleAssessment,
          workplaceWellnessNeeds,
          programmeParticipation,
          approvals: {
            employeeSignature: employeeSignature || null,
            wellnessOfficerSignature: hrSignature || null,
            approvalDate: approvalDate || null
          },
          actions,
          actorUserId: user.id as UUID
        });
      }
      await refetchAssessments();

      clearDraft(keyToClear);
      if (createdAssessmentId) {
        const keyAfterCreate = `hr-employee-wellness:${activeCompanyId ?? 'none'}:${user?.id ?? 'anon'}:${employeeSelectionKey || 'unselected'}:${createdAssessmentId}`;
        clearDraft(keyAfterCreate);
      }
      setWellnessDraftBaseline(draftPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save wellness assessment.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAssessment = async (assessmentId: UUID) => {
    if (!activeCompanyId || !user?.id) return;
    if (!window.confirm('Delete this wellness assessment and its action plan rows? This cannot be undone.')) return;
    setError(null);
    setDeletingAssessmentId(assessmentId);
    try {
      await deleteHrRecord('hr_employee_wellness_assessments', {
        companyId: activeCompanyId,
        rowId: assessmentId,
        actorUserId: user.id as UUID
      });
      if (selectedAssessmentId === assessmentId) resetForm();
      await refetchAssessments();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete wellness assessment.');
    } finally {
      setDeletingAssessmentId(null);
    }
  };

  const employeeNameById = useMemo(
    () =>
      new Map(
        (employees ?? []).map((e) => [
          e.id,
          `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim() || e.email || e.employee_no
        ])
      ),
    [employees]
  );

  const supportNeededCount = useMemo(() => {
    return supportRows.filter((row) => row.answer === 'yes').length;
  }, [supportRows]);

  return (
    <Layout title="Employee Wellness Programme">
      <div className="space-y-4">
        {location.pathname.startsWith('/dashboard/hr') && <HrSectionNav />}
        {location.pathname.startsWith('/dashboard/health') && (
          <div>
            <Link to="/dashboard/health/wellness" className="text-sm font-medium text-teal hover:underline">
              ← Back to Wellness Programme
            </Link>
          </div>
        )}
        {error && <div className="bg-critical/10 border border-critical/30 rounded-xl p-3 text-sm text-critical">{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="bg-white border border-surface-300 rounded-xl p-3">
            <p className="text-xs text-charcoal-500">Total wellness assessments</p>
            <p className="text-xl font-semibold text-charcoal mt-1">{assessments?.length ?? 0}</p>
          </div>
          <div className="bg-white border border-surface-300 rounded-xl p-3">
            <p className="text-xs text-charcoal-500">Employees needing support</p>
            <p className="text-xl font-semibold text-warning mt-1">
              {(assessments ?? []).filter((a) => {
                const needs = (a.workplace_wellness_needs ?? {}) as Record<string, { answer?: YesNo }>;
                return Object.values(needs).some((v) => v?.answer === 'yes');
              }).length}
            </p>
          </div>
          <div className="bg-white border border-surface-300 rounded-xl p-3">
            <p className="text-xs text-charcoal-500">Action plans pending</p>
            <p className="text-xl font-semibold text-charcoal mt-1">
              {(assessments ?? []).length}
            </p>
          </div>
          <div className="bg-white border border-surface-300 rounded-xl p-3">
            <p className="text-xs text-charcoal-500">Support items (current form)</p>
            <p className="text-xl font-semibold text-charcoal mt-1">{supportNeededCount}</p>
          </div>
        </div>

        <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <h3 className="font-semibold text-charcoal">Employee information</h3>
            <div className="flex gap-2">
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border border-surface-300 text-sm"
                onClick={resetForm}
              >
                New assessment
              </button>
              <button
                type="button"
                className="px-4 py-1.5 rounded-lg bg-teal text-white text-sm"
                onClick={() => void handleSave()}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save wellness record'}
              </button>
              {selectedAssessmentId && (
                <button
                  type="button"
                  className="px-4 py-1.5 rounded-lg border border-critical/30 text-critical text-sm"
                  onClick={() => void handleDeleteAssessment(selectedAssessmentId)}
                  disabled={deletingAssessmentId === selectedAssessmentId}
                >
                  {deletingAssessmentId === selectedAssessmentId ? 'Deleting...' : 'Delete record'}
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <HrEmployeeSelect
                companyId={activeCompanyId ?? null}
                valueField="id"
                value={(selectedEmployeeId ?? '') as any}
                onChange={handleEmployeeChange}
                label="Employee Name"
                placeholder="Select employee"
              />
            </div>
            <label className="text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Employee Number</span>
              <input
                className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm"
                value={employeeNumberSnapshot}
                onChange={(e) => setEmployeeNumberSnapshot(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Company Name</span>
              <input
                className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm"
                value={companyNameSnapshot}
                onChange={(e) => setCompanyNameSnapshot(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Department</span>
              <input
                className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm"
                value={departmentSnapshot}
                onChange={(e) => setDepartmentSnapshot(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Job Title</span>
              <input
                className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm"
                value={jobTitleSnapshot}
                onChange={(e) => setJobTitleSnapshot(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Line Manager</span>
              <input
                className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm"
                value={lineManagerSnapshot}
                onChange={(e) => setLineManagerSnapshot(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Date</span>
              <input
                type="date"
                className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm"
                value={assessmentDate}
                onChange={(e) => setAssessmentDate(e.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-charcoal">Wellness assessment</h3>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-100">
                <tr>
                  <th className="text-left px-3 py-2">Wellness Area</th>
                  <th className="text-center px-3 py-2 w-24">Yes</th>
                  <th className="text-center px-3 py-2 w-24">No</th>
                  <th className="text-left px-3 py-2">Comments</th>
                </tr>
              </thead>
              <tbody>
                {wellnessRows.map((row) => (
                  <tr key={row.key} className="border-t border-surface-100">
                    <td className="px-3 py-2">{row.label}</td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={row.answer === 'yes'}
                        onChange={() => handleWellnessCheckbox(row.key, 'yes')}
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={row.answer === 'no'}
                        onChange={() => handleWellnessCheckbox(row.key, 'no')}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="w-full border border-surface-300 rounded-lg px-2 py-1 text-sm"
                        value={row.comments}
                        onChange={(e) =>
                          setWellnessRows((rows) =>
                            rows.map((r) => (r.key === row.key ? { ...r, comments: e.target.value } : r))
                          )
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-charcoal">Health and lifestyle assessment</h3>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-100">
                <tr>
                  <th className="text-left px-3 py-2">Health Factor</th>
                  <th className="text-left px-3 py-2 w-56">Status</th>
                  <th className="text-left px-3 py-2">Comments</th>
                </tr>
              </thead>
              <tbody>
                {healthRows.map((row) => (
                  <tr key={row.key} className="border-t border-surface-100">
                    <td className="px-3 py-2">{row.label}</td>
                    <td className="px-3 py-2">
                      <select
                        className="w-full border border-surface-300 rounded-lg px-2 py-1 text-sm"
                        value={row.status}
                        onChange={(e) =>
                          setHealthRows((rows) =>
                            rows.map((r) => (r.key === row.key ? { ...r, status: e.target.value } : r))
                          )
                        }
                      >
                        <option value="">Select</option>
                        {row.key === 'physical_fitness' && (
                          <>
                            <option value="Good">Good</option>
                            <option value="Fair">Fair</option>
                            <option value="Poor">Poor</option>
                          </>
                        )}
                        {row.key === 'stress_level' && (
                          <>
                            <option value="Low">Low</option>
                            <option value="Moderate">Moderate</option>
                            <option value="High">High</option>
                          </>
                        )}
                        {(row.key === 'smoking' || row.key === 'alcohol') && (
                          <>
                            <option value="Yes">Yes</option>
                            <option value="No">No</option>
                          </>
                        )}
                        {row.key === 'sleep_quality' && (
                          <>
                            <option value="Good">Good</option>
                            <option value="Fair">Fair</option>
                            <option value="Poor">Poor</option>
                          </>
                        )}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="w-full border border-surface-300 rounded-lg px-2 py-1 text-sm"
                        value={row.comments}
                        onChange={(e) =>
                          setHealthRows((rows) =>
                            rows.map((r) => (r.key === row.key ? { ...r, comments: e.target.value } : r))
                          )
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-charcoal">Workplace wellness needs</h3>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-100">
                <tr>
                  <th className="text-left px-3 py-2">Support Required</th>
                  <th className="text-center px-3 py-2 w-24">Yes</th>
                  <th className="text-center px-3 py-2 w-24">No</th>
                  <th className="text-left px-3 py-2">Comments</th>
                </tr>
              </thead>
              <tbody>
                {supportRows.map((row) => (
                  <tr key={row.key} className="border-t border-surface-100">
                    <td className="px-3 py-2">{row.label}</td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={row.answer === 'yes'}
                        onChange={() => handleSupportCheckbox(row.key, 'yes')}
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={row.answer === 'no'}
                        onChange={() => handleSupportCheckbox(row.key, 'no')}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="w-full border border-surface-300 rounded-lg px-2 py-1 text-sm"
                        value={row.comments}
                        onChange={(e) =>
                          setSupportRows((rows) =>
                            rows.map((r) => (r.key === row.key ? { ...r, comments: e.target.value } : r))
                          )
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-charcoal">Wellness programme activities</h3>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-100">
                <tr>
                  <th className="text-left px-3 py-2">Activity</th>
                  <th className="text-left px-3 py-2 w-40">Participation</th>
                  <th className="text-left px-3 py-2">Comments</th>
                </tr>
              </thead>
              <tbody>
                {activityRows.map((row) => (
                  <tr key={row.key} className="border-t border-surface-100">
                    <td className="px-3 py-2">{row.label}</td>
                    <td className="px-3 py-2">
                      <select
                        className="w-full border border-surface-300 rounded-lg px-2 py-1 text-sm"
                        value={row.participation}
                        onChange={(e) =>
                          setActivityRows((rows) =>
                            rows.map((r) => (r.key === row.key ? { ...r, participation: e.target.value as 'yes' | 'no' | '' } : r))
                          )
                        }
                      >
                        <option value="">Select</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="w-full border border-surface-300 rounded-lg px-2 py-1 text-sm"
                        value={row.comments}
                        onChange={(e) =>
                          setActivityRows((rows) =>
                            rows.map((r) => (r.key === row.key ? { ...r, comments: e.target.value } : r))
                          )
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-charcoal">Action plan</h3>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-100">
                <tr>
                  <th className="text-left px-3 py-2">Identified Issue</th>
                  <th className="text-left px-3 py-2">Action Required</th>
                  <th className="text-left px-3 py-2 w-56">Responsible Person</th>
                  <th className="text-left px-3 py-2 w-40">Target Date</th>
                  <th className="text-center px-3 py-2 w-16">Remove</th>
                </tr>
              </thead>
              <tbody>
                {actionPlanRows.map((row, index) => (
                  <tr key={row.id ?? index} className="border-t border-surface-100">
                    <td className="px-3 py-2">
                      <input
                        className="w-full border border-surface-300 rounded-lg px-2 py-1 text-sm"
                        value={row.identifiedIssue}
                        onChange={(e) =>
                          setActionPlanRows((rows) =>
                            rows.map((r, i) => (i === index ? { ...r, identifiedIssue: e.target.value } : r))
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="w-full border border-surface-300 rounded-lg px-2 py-1 text-sm"
                        value={row.actionRequired}
                        onChange={(e) =>
                          setActionPlanRows((rows) =>
                            rows.map((r, i) => (i === index ? { ...r, actionRequired: e.target.value } : r))
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className="w-full border border-surface-300 rounded-lg px-2 py-1 text-sm"
                        value={row.responsibleEmployeeId ?? ''}
                        onChange={(e) =>
                          setActionPlanRows((rows) =>
                            rows.map((r, i) =>
                              i === index
                                ? {
                                    ...r,
                                    responsibleEmployeeId: (e.target.value || null) as UUID | null
                                  }
                                : r
                            )
                          )
                        }
                      >
                        <option value="">Select employee</option>
                        {(employees ?? []).map((emp) => {
                          const name = `${emp.first_name ?? ''} ${emp.last_name ?? ''}`.trim() || emp.email || emp.employee_no;
                          return (
                            <option key={emp.id} value={emp.id}>
                              {name}
                            </option>
                          );
                        })}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        className="w-full border border-surface-300 rounded-lg px-2 py-1 text-sm"
                        value={row.targetDate}
                        onChange={(e) =>
                          setActionPlanRows((rows) =>
                            rows.map((r, i) => (i === index ? { ...r, targetDate: e.target.value } : r))
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        className="text-xs text-charcoal-500 hover:text-critical"
                        onClick={() => handleRemoveActionRow(index)}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="mt-2 px-3 py-1.5 rounded-lg border border-surface-300 text-sm"
            onClick={handleAddActionRow}
          >
            Add action plan row
          </button>
        </div>

        <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
          <p className="text-sm text-charcoal-700 font-medium">
            All information collected through this form will be treated as confidential and used only for employee wellness support.
          </p>
        </div>

        <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-charcoal">Approval</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Employee Signature (typed or digital)</span>
              <input
                className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm"
                value={employeeSignature}
                onChange={(e) => setEmployeeSignature(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Wellness Officer / HR Signature</span>
              <input
                className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm"
                value={hrSignature}
                onChange={(e) => setHrSignature(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Date</span>
              <input
                type="date"
                className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm"
                value={approvalDate}
                onChange={(e) => setApprovalDate(e.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-charcoal">Previous wellness assessments</h3>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-100">
                <tr>
                  <th className="text-left px-3 py-2">Date</th>
                  <th className="text-left px-3 py-2">Employee</th>
                  <th className="text-left px-3 py-2">Department</th>
                  <th className="text-left px-3 py-2">Stress level</th>
                  <th className="text-left px-3 py-2">Support needed</th>
                  <th className="text-left px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(assessments ?? []).map((row) => {
                  const employeeName = employeeNameById.get(row.employee_id as UUID) ?? String(row.employee_id);
                  const health = (row.health_lifestyle_assessment ?? {}) as Record<string, { status?: string }>;
                  const stressLevel = health.stress_level?.status ?? '';
                  const needs = (row.workplace_wellness_needs ?? {}) as Record<string, { answer?: YesNo }>;
                  const supportNeeded = Object.values(needs).some((v) => v?.answer === 'yes');
                  return (
                    <tr key={row.id} className="border-t border-surface-100">
                      <td className="px-3 py-2">{String(row.assessment_date ?? '')}</td>
                      <td className="px-3 py-2">{employeeName}</td>
                      <td className="px-3 py-2">{String(row.department_id ?? '')}</td>
                      <td className="px-3 py-2">{stressLevel || '-'}</td>
                      <td className="px-3 py-2">{supportNeeded ? 'Yes' : 'No'}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-3 text-xs">
                          <button
                            type="button"
                            className="text-teal underline"
                            onClick={() => void loadAssessment(row.id as UUID)}
                          >
                            View / edit
                          </button>
                          <button
                            type="button"
                            className="text-critical underline"
                            onClick={() => void handleDeleteAssessment(row.id as UUID)}
                            disabled={deletingAssessmentId === row.id}
                          >
                            {deletingAssessmentId === row.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {(assessments ?? []).length === 0 && (
                  <tr>
                    <td className="px-3 py-2 text-sm text-charcoal-500" colSpan={6}>
                      No wellness assessments recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}
