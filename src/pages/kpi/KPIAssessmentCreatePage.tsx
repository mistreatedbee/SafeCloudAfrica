import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import { listUserProfiles } from '../../api/services/profilesService';
import { listDepartments } from '../../api/services/departmentsService';
import { listKpiItems } from '../../api/services/kpiItemService';
import { createKPIAssessment } from '../../api/services/kpiAssessmentService';
import type { Department, KPIItem, KpiAssessmentType, KpiImportance, KpiPeriodType } from '../../api/models/entities';
import type { UUID } from '../../api/models/core';

type QuestionnaireInput = {
  kpiItemId: UUID | null;
  kpiQuestionnaire: string;
  importanceRating: KpiImportance;
};

const EMPTY_QUESTIONNAIRE: QuestionnaireInput = { kpiItemId: null, kpiQuestionnaire: '', importanceRating: 'medium' };

export function KPIAssessmentCreatePage() {
  const navigate = useNavigate();
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();

  const [assessmentName, setAssessmentName] = useState('');
  const [assessmentType, setAssessmentType] = useState<KpiAssessmentType>('employee');
  const [employeeId, setEmployeeId] = useState<UUID | ''>('');
  const [employeeNameSnapshot, setEmployeeNameSnapshot] = useState('');
  const [managerId, setManagerId] = useState<UUID | ''>('');
  const [managerNameSnapshot, setManagerNameSnapshot] = useState('');
  const [departmentId, setDepartmentId] = useState<UUID | ''>('');
  const [projectName, setProjectName] = useState('');
  const [periodType, setPeriodType] = useState<KpiPeriodType>('monthly');
  const [periodStartDate, setPeriodStartDate] = useState('');
  const [periodEndDate, setPeriodEndDate] = useState('');
  const [questionnaires, setQuestionnaires] = useState<QuestionnaireInput[]>([{ ...EMPTY_QUESTIONNAIRE }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canCreate = activeRole === 'owner' || activeRole === 'admin' || activeRole === 'manager' || activeRole === 'supervisor';

  const { data: profiles } = useAsync(async () => (activeCompanyId ? listUserProfiles(activeCompanyId) : []), [activeCompanyId]);
  const { data: departments } = useAsync<Department[]>(
    async () => (activeCompanyId ? listDepartments(activeCompanyId) : []),
    [activeCompanyId]
  );
  const { data: kpiItems } = useAsync(
    async () => (activeCompanyId ? listKpiItems({ organizationId: activeCompanyId, activeOnly: true }) : []),
    [activeCompanyId]
  );

  const managerOptions = useMemo(() => profiles ?? [], [profiles]);

  const addQuestionnaire = () => setQuestionnaires((prev) => [...prev, { ...EMPTY_QUESTIONNAIRE }]);
  const removeQuestionnaire = (i: number) => setQuestionnaires((prev) => prev.filter((_, idx) => idx !== i));

  const updateQuestionnaire = (i: number, patch: Partial<QuestionnaireInput>) => {
    setQuestionnaires((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], ...patch };
      if (patch.kpiItemId !== undefined && patch.kpiItemId) {
        const item = (kpiItems ?? []).find((k) => k.kpi_item_id === patch.kpiItemId);
        if (item) {
          next[i].kpiQuestionnaire = item.title;
          next[i].importanceRating = item.default_importance;
        }
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCompanyId || !user?.id || !canCreate) return;

    const manager = (managerId || user.id) as UUID;
    const managerName = managerNameSnapshot || (profiles?.find((p) => p.user_id === manager)?.full_name ?? '');
    const empId = assessmentType === 'employee' ? (employeeId || null) : null;
    const empName = assessmentType === 'employee' ? employeeNameSnapshot.trim() : null;
    const projName = assessmentType === 'project' ? projectName.trim() : null;
    const assessmentTitle = assessmentName.trim();

    if (!assessmentTitle) {
      setError('KPI Assessment name is required.');
      return;
    }
    if (assessmentType === 'employee' && !empId && !empName) {
      setError('Select an employee or enter employee name.');
      return;
    }
    if (assessmentType === 'project' && !projName) {
      setError('Project name is required for project assessments.');
      return;
    }

    const questionnairePayload = questionnaires
      .filter((q) => q.kpiQuestionnaire.trim())
      .map((q) => ({
        kpiItemId: q.kpiItemId,
        kpiTitle: q.kpiQuestionnaire.trim(),
        customKpiTitle: q.kpiQuestionnaire.trim(),
        importanceRating: q.importanceRating
      }));

    if (questionnairePayload.length === 0) {
      setError('Add at least one KPI Questionnaire.');
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setSaving(true);
    try {
      const created = await createKPIAssessment({
        organizationId: activeCompanyId,
        assessmentName: assessmentTitle,
        assessmentType,
        employeeId: empId ?? undefined,
        employeeNameSnapshot: empName || undefined,
        managerId: manager,
        managerNameSnapshot: managerName,
        departmentId: (departmentId || null) as UUID | null,
        projectName: projName || undefined,
        periodType,
        periodStartDate: periodStartDate || new Date().toISOString().slice(0, 10),
        periodEndDate: periodEndDate || new Date().toISOString().slice(0, 10),
        createdByUserId: user.id as UUID,
        lines: questionnairePayload
      });
      setSuccessMessage('KPI Assessment saved successfully. Redirecting...');
      setTimeout(() => navigate(`/modules/hr/kpis/assessments/${created.assessment_id}`), 300);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create KPI Assessment.');
    } finally {
      setSaving(false);
    }
  };

  if (!canCreate) {
    return (
      <div className="bg-white rounded-xl border border-surface-300 p-6 shadow-card">
        <h2 className="text-lg font-semibold text-charcoal mb-2">KPI Assessment</h2>
        <p className="text-sm text-charcoal-600">You do not have permission to create KPI Assessments.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <button type="button" onClick={() => navigate('/modules/hr/kpis/assessments')} className="text-sm text-charcoal-500 hover:text-charcoal">
        Back to KPI Assessment
      </button>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card space-y-4">
          <h2 className="text-lg font-semibold text-charcoal">New KPI Assessment</h2>

          {error && <div className="bg-critical/5 border border-critical/20 rounded-lg p-3 text-sm text-critical">{error}</div>}
          {successMessage && <div className="bg-teal/5 border border-teal/20 rounded-lg p-3 text-sm text-teal-700">{successMessage}</div>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">KPI Assessment name</label>
              <input
                type="text"
                value={assessmentName}
                onChange={(e) => setAssessmentName(e.target.value)}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
                placeholder="e.g. Q1 Operations KPI Assessment"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">Assessment type</label>
              <select
                value={assessmentType}
                onChange={(e) => setAssessmentType(e.target.value as KpiAssessmentType)}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
              >
                <option value="employee">Employee</option>
                <option value="project">Project</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">Period</label>
              <select
                value={periodType}
                onChange={(e) => setPeriodType(e.target.value as KpiPeriodType)}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">Period start</label>
              <input
                type="date"
                value={periodStartDate}
                onChange={(e) => setPeriodStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">Period end</label>
              <input
                type="date"
                value={periodEndDate}
                onChange={(e) => setPeriodEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">Department</label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value as UUID | '')}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
              >
                <option value="">Unassigned</option>
                {(departments ?? []).map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">Manager</label>
              <select
                value={managerId}
                onChange={(e) => {
                  const id = e.target.value as UUID | '';
                  setManagerId(id);
                  const p = managerOptions.find((x) => x.user_id === id);
                  setManagerNameSnapshot(p?.full_name ?? '');
                }}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
              >
                <option value={user?.id ?? ''}>Me</option>
                {managerOptions.map((p) => (
                  <option key={p.user_id} value={p.user_id}>{p.full_name ?? p.email ?? p.user_id}</option>
                ))}
              </select>
            </div>
          </div>

          {assessmentType === 'employee' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">Employee</label>
                <select
                  value={employeeId}
                  onChange={(e) => {
                    const id = e.target.value as UUID | '';
                    setEmployeeId(id);
                    const p = profiles?.find((x) => x.user_id === id);
                    setEmployeeNameSnapshot(p?.full_name ?? '');
                  }}
                  className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
                >
                  <option value="">Select</option>
                  {(profiles ?? []).map((p) => (
                    <option key={p.user_id} value={p.user_id}>{p.full_name ?? p.email ?? p.user_id}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">Employee name (snapshot)</label>
                <input
                  type="text"
                  value={employeeNameSnapshot}
                  onChange={(e) => setEmployeeNameSnapshot(e.target.value)}
                  className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
                  placeholder="Display name"
                />
              </div>
            </div>
          )}

          {assessmentType === 'project' && (
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">Project</label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
                placeholder="Project name"
              />
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card space-y-4">
          <h3 className="font-semibold text-charcoal">KPI Assessment</h3>
          <p className="text-sm text-charcoal-500">Add KPI Questionnaire rows for this assessment.</p>

          {questionnaires.map((q, i) => (
            <div key={i} className="flex flex-wrap gap-2 items-start p-3 border border-surface-200 rounded-lg">
              {(kpiItems ?? []).length > 0 && (
                <select
                  value={q.kpiItemId ?? ''}
                  onChange={(e) => updateQuestionnaire(i, { kpiItemId: (e.target.value || null) as UUID | null })}
                  className="px-3 py-2 border border-surface-300 rounded-lg text-sm w-56"
                >
                  <option value="">Custom KPI Questionnaire</option>
                  {(kpiItems ?? []).map((k: KPIItem) => (
                    <option key={k.kpi_item_id} value={k.kpi_item_id}>{k.title}</option>
                  ))}
                </select>
              )}

              <input
                type="text"
                value={q.kpiQuestionnaire}
                onChange={(e) => updateQuestionnaire(i, { kpiQuestionnaire: e.target.value })}
                placeholder="KPI Questionnaire"
                className="flex-1 min-w-[220px] px-3 py-2 border border-surface-300 rounded-lg text-sm"
              />

              <select
                value={q.importanceRating}
                onChange={(e) => updateQuestionnaire(i, { importanceRating: e.target.value as KpiImportance })}
                className="px-3 py-2 border border-surface-300 rounded-lg text-sm"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>

              <button type="button" onClick={() => removeQuestionnaire(i)} className="text-critical hover:underline text-sm">
                Remove
              </button>
            </div>
          ))}

          <button type="button" onClick={addQuestionnaire} className="text-sm text-teal hover:underline font-medium">
            + Add KPI Questionnaire
          </button>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-teal text-white font-semibold hover:bg-teal-600 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Create KPI Assessment'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/modules/hr/kpis/assessments')}
            className="px-4 py-2 rounded-lg border border-surface-300 text-charcoal hover:bg-surface-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
