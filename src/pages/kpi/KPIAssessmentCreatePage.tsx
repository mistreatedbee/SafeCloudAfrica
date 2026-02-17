import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import { listUserProfiles } from '../../api/services/profilesService';
import { listKpiItems } from '../../api/services/kpiItemService';
import { createKPIAssessment } from '../../api/services/kpiAssessmentService';
import type { KPIItem, KpiAssessmentType, KpiImportance, KpiPeriodType } from '../../api/models/entities';
import type { UUID } from '../../api/models/core';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';

type LineInput = { kpiItemId: UUID | null; customKpiTitle: string; kpiTitle: string; importanceRating: KpiImportance };

export function KPIAssessmentCreatePage() {
  const navigate = useNavigate();
  const { activeCompanyId } = useTenant();
  const { user } = useUser();
  const [assessmentType, setAssessmentType] = useState<KpiAssessmentType>('employee');
  const [employeeId, setEmployeeId] = useState<UUID | ''>('');
  const [employeeNameSnapshot, setEmployeeNameSnapshot] = useState('');
  const [managerId, setManagerId] = useState<UUID | ''>('');
  const [managerNameSnapshot, setManagerNameSnapshot] = useState('');
  const [projectName, setProjectName] = useState('');
  const [periodType, setPeriodType] = useState<KpiPeriodType>('monthly');
  const [periodStartDate, setPeriodStartDate] = useState('');
  const [periodEndDate, setPeriodEndDate] = useState('');
  const [lines, setLines] = useState<LineInput[]>([{ kpiItemId: null, customKpiTitle: '', kpiTitle: '', importanceRating: 'medium' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: profiles } = useAsync(
    async () => (activeCompanyId ? listUserProfiles(activeCompanyId) : []),
    [activeCompanyId]
  );
  const { data: kpiItems } = useAsync(
    async () => (activeCompanyId ? listKpiItems({ organizationId: activeCompanyId, activeOnly: true }) : []),
    [activeCompanyId]
  );

  const addLine = () => setLines((prev) => [...prev, { kpiItemId: null, customKpiTitle: '', kpiTitle: '', importanceRating: 'medium' }]);
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));
  const updateLine = (i: number, patch: Partial<LineInput>) => {
    setLines((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], ...patch };
      if (patch.kpiItemId !== undefined && patch.kpiItemId) {
        const item = (kpiItems ?? []).find((k) => k.kpi_item_id === patch.kpiItemId);
        if (item) {
          next[i].kpiTitle = item.title;
          next[i].importanceRating = item.default_importance;
        }
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCompanyId || !user?.id) return;
    const manager = managerId || (user.id as UUID);
    const managerName = managerNameSnapshot || (profiles?.find((p) => p.user_id === manager)?.full_name ?? '');
    const empId = assessmentType === 'employee' ? (employeeId || null) : null;
    const empName = assessmentType === 'employee' ? employeeNameSnapshot : null;
    const projName = assessmentType === 'project' ? projectName : null;
    if (assessmentType === 'employee' && !empId && !employeeNameSnapshot) {
      setError('Select an employee or enter employee name.');
      return;
    }
    if (assessmentType === 'project' && !projectName.trim()) {
      setError('Enter project name.');
      return;
    }
    const linePayload = lines.filter((l) => l.kpiTitle.trim()).map((l) => ({
      kpiItemId: l.kpiItemId,
      customKpiTitle: l.customKpiTitle || null,
      kpiTitle: l.kpiTitle.trim(),
      importanceRating: l.importanceRating
    }));
    if (linePayload.length === 0) {
      setError('Add at least one KPI line.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const a = await createKPIAssessment({
        organizationId: activeCompanyId,
        assessmentType,
        employeeId: empId ?? undefined,
        employeeNameSnapshot: empName || undefined,
        managerId: manager,
        managerNameSnapshot: managerName,
        projectName: projName || undefined,
        periodType,
        periodStartDate: periodStartDate || new Date().toISOString().slice(0, 10),
        periodEndDate: periodEndDate || new Date().toISOString().slice(0, 10),
        createdByUserId: user.id as UUID,
        lines: linePayload
      });
      navigate(`/modules/hr/kpis/assessments/${a.assessment_id}`);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create assessment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <button
        type="button"
        onClick={() => navigate('/modules/hr/kpis/assessments')}
        className="text-sm text-charcoal-500 hover:text-charcoal"
      >
        ← Back to assessments
      </button>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card space-y-4">
          <h2 className="text-lg font-semibold text-charcoal">New KPI assessment</h2>
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-lg p-3 text-sm text-critical">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">Period type</label>
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
                  <option value="">Select…</option>
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
              <label className="block text-sm font-medium text-charcoal mb-1">Project name</label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
                placeholder="Project name"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">Manager</label>
              <select
                value={managerId}
                onChange={(e) => {
                  const id = e.target.value as UUID | '';
                  setManagerId(id);
                  const p = profiles?.find((x) => x.user_id === id);
                  setManagerNameSnapshot(p?.full_name ?? '');
                }}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
              >
                <option value={user?.id ?? ''}>Me</option>
                {(profiles ?? []).map((p) => (
                  <option key={p.user_id} value={p.user_id}>{p.full_name ?? p.email ?? p.user_id}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">Manager name (snapshot)</label>
              <input
                type="text"
                value={managerNameSnapshot}
                onChange={(e) => setManagerNameSnapshot(e.target.value)}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        </div>

        <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card space-y-4">
          <h3 className="font-semibold text-charcoal">KPI lines</h3>
          {(kpiItems ?? []).length > 0 && (
            <p className="text-sm text-charcoal-500">Pick from library or enter custom title.</p>
          )}
          {lines.map((line, i) => (
            <div key={i} className="flex flex-wrap gap-2 items-start p-3 border border-surface-200 rounded-lg">
              {((kpiItems ?? []) as KPIItem[]).length > 0 && (
                <select
                  value={line.kpiItemId ?? ''}
                  onChange={(e) => updateLine(i, { kpiItemId: (e.target.value || null) as UUID | null })}
                  className="px-3 py-2 border border-surface-300 rounded-lg text-sm w-48"
                >
                  <option value="">Custom KPI</option>
                  {((kpiItems ?? []) as KPIItem[]).map((k) => (
                    <option key={k.kpi_item_id} value={k.kpi_item_id}>{k.title}</option>
                  ))}
                </select>
              )}
              <input
                type="text"
                value={line.kpiTitle}
                onChange={(e) => updateLine(i, { kpiTitle: e.target.value })}
                placeholder="KPI title"
                className="flex-1 min-w-[200px] px-3 py-2 border border-surface-300 rounded-lg text-sm"
              />
              <select
                value={line.importanceRating}
                onChange={(e) => updateLine(i, { importanceRating: e.target.value as KpiImportance })}
                className="px-3 py-2 border border-surface-300 rounded-lg text-sm"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <button type="button" onClick={() => removeLine(i)} className="text-critical hover:underline text-sm">
                Remove
              </button>
            </div>
          ))}
          <button type="button" onClick={addLine} className="text-sm text-teal hover:underline font-medium">
            + Add KPI line
          </button>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-teal text-white font-semibold hover:bg-teal-600 disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create assessment'}
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
