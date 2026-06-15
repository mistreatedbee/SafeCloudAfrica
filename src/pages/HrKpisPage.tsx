import React, { useMemo, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import type { HrKpi, HrKpiAssessmentType } from '../api/models/entities';
import { listHrKpis, createHrKpi, updateHrKpi, deleteHrKpi } from '../api/services/hrKpisService';
import { useUser } from '@insforge/react';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { XIcon } from 'lucide-react';
import type { UUID } from '../api/models/core';
import { toUserFacingError } from '../utils/userFacingMessage';

function HrKpiCreateModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  managerUserId: UUID;
  existing?: HrKpi | null;
  onSaved?: () => void;
}) {
  const [kpiTitle, setKpiTitle] = useState('');
  const [assessmentType, setAssessmentType] = useState<HrKpiAssessmentType>('employee');
  const [importance, setImportance] = useState<'low' | 'medium' | 'high'>('medium');
  const [targetValue, setTargetValue] = useState('');
  const [actualValue, setActualValue] = useState('');
  const [employeeSelfRating, setEmployeeSelfRating] = useState('3');
  const [managerRating, setManagerRating] = useState('3');
  const [managerRemarks, setManagerRemarks] = useState('');
  const [employeeComments, setEmployeeComments] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => kpiTitle.trim().length > 2, [kpiTitle]);

  React.useEffect(() => {
    if (!props.open) return;
    const existing = props.existing;
    if (existing) {
      setKpiTitle(existing.kpi_title ?? '');
      setAssessmentType((existing.assessment_type as HrKpiAssessmentType) ?? 'employee');
      setImportance((existing.importance as any) ?? 'medium');
      setTargetValue(existing.target_value_numeric != null ? String(existing.target_value_numeric) : '');
      setActualValue(existing.actual_value_numeric != null ? String(existing.actual_value_numeric) : '');
      setEmployeeSelfRating(existing.employee_self_rating != null ? String(existing.employee_self_rating) : '3');
      setManagerRating(existing.manager_rating != null ? String(existing.manager_rating) : '3');
      setManagerRemarks(existing.manager_remarks ?? '');
      setEmployeeComments(existing.employee_comments ?? '');
      setPeriodStart(existing.period_start ?? '');
      setPeriodEnd(existing.period_end ?? '');
      setError(null);
      return;
    }
    setKpiTitle('');
    setTargetValue('');
    setActualValue('');
    setEmployeeSelfRating('3');
    setManagerRating('3');
    setManagerRemarks('');
    setEmployeeComments('');
    setPeriodStart('');
    setPeriodEnd('');
    setImportance('medium');
    setAssessmentType('employee');
    setError(null);
  }, [props.existing, props.open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      setLoading(true);
      const targetValueNumeric = targetValue ? Number(targetValue) || 0 : null;
      const actualValueNumeric = actualValue ? Number(actualValue) || 0 : null;
      const achieved =
        targetValueNumeric != null && actualValueNumeric != null ? actualValueNumeric >= targetValueNumeric : null;

      if (props.existing?.id) {
        await updateHrKpi(
          props.companyId,
          props.existing.id as UUID,
          {
            kpi_title: kpiTitle.trim(),
            assessment_type: assessmentType,
            importance,
            target_value_numeric: targetValueNumeric,
            actual_value_numeric: actualValueNumeric,
            achieved,
            employee_self_rating: employeeSelfRating ? Number(employeeSelfRating) || null : null,
            manager_rating: managerRating ? Number(managerRating) || null : null,
            manager_remarks: managerRemarks.trim() || null,
            employee_comments: employeeComments.trim() || null,
            period_start: periodStart || null,
            period_end: periodEnd || null
          } as any,
          props.managerUserId
        );
      } else {
        await createHrKpi({
          companyId: props.companyId,
          kpiTitle: kpiTitle.trim(),
          assessmentType,
          managerUserId: props.managerUserId,
          importance,
          targetValueNumeric,
          actualValueNumeric,
          employeeSelfRating: employeeSelfRating ? Number(employeeSelfRating) || null : null,
          managerRating: managerRating ? Number(managerRating) || null : null,
          managerRemarks: managerRemarks.trim() || null,
          employeeComments: employeeComments.trim() || null,
          periodStart: periodStart || null,
          periodEnd: periodEnd || null,
          createdByUserId: props.managerUserId
        });
      }

      props.onSaved?.();
      props.onClose();
    } catch (err: unknown) {
      setError(toUserFacingError(err, 'Could not save KPI. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90dvh] overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <p className="text-sm font-semibold text-charcoal">{props.existing ? 'Edit HR KPI' : 'Add HR KPI'}</p>
          <button
            type="button"
            onClick={props.onClose}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-surface-100 text-charcoal-500 shrink-0"
            aria-label="Close"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
              <p className="text-sm font-semibold text-critical">Could not create</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Assessment type</label>
              <select
                value={assessmentType}
                onChange={(e) => setAssessmentType(e.target.value as HrKpiAssessmentType)}
                className="w-full px-3 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                <option value="employee">Employee</option>
                <option value="project">Project</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Importance</label>
              <select
                value={importance}
                onChange={(e) => setImportance(e.target.value as any)}
                className="w-full px-3 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">KPI *</label>
            <input
              value={kpiTitle}
              onChange={(e) => setKpiTitle(e.target.value)}
              placeholder="e.g. Close audit actions within 30 days"
              className="w-full px-3 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Target (numeric)</label>
              <input
                type="number"
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                className="w-full px-3 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Actual (numeric)</label>
              <input
                type="number"
                value={actualValue}
                onChange={(e) => setActualValue(e.target.value)}
                className="w-full px-3 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Employee rating (1–5)</label>
              <select
                value={employeeSelfRating}
                onChange={(e) => setEmployeeSelfRating(e.target.value)}
                className="w-full px-3 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                <option value="1">1 – Unsatisfactory</option>
                <option value="2">2 – Improvement needed</option>
                <option value="3">3 – Meets expectations</option>
                <option value="4">4 – Exceeds expectations</option>
                <option value="5">5 – Exceptional</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Manager rating (1–5)</label>
              <select
                value={managerRating}
                onChange={(e) => setManagerRating(e.target.value)}
                className="w-full px-3 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                <option value="1">1 – Unsatisfactory</option>
                <option value="2">2 – Improvement needed</option>
                <option value="3">3 – Meets expectations</option>
                <option value="4">4 – Exceeds expectations</option>
                <option value="5">5 – Exceptional</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Period start</label>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="w-full px-3 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Period end</label>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="w-full px-3 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Manager remarks</label>
              <textarea
                value={managerRemarks}
                onChange={(e) => setManagerRemarks(e.target.value)}
                rows={3}
                className="w-full px-3 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Employee comments</label>
              <textarea
                value={employeeComments}
                onChange={(e) => setEmployeeComments(e.target.value)}
                rows={3}
                className="w-full px-3 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={props.onClose}
              className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading && <LoadingSpinner size={16} />}
              Save KPI
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function HrKpisPage() {
  const { activeCompanyId } = useTenant();
  const { user } = useUser();
  const [filterType, setFilterType] = useState<'all' | HrKpiAssessmentType>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HrKpi | null>(null);
  const [deletingId, setDeletingId] = useState<UUID | null>(null);

  const {
    data: kpis,
    loading,
    error,
    refresh
  } = useAsync<HrKpi[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listHrKpis({
        companyId: activeCompanyId,
        assessmentType: filterType === 'all' ? undefined : filterType
      });
    },
    [activeCompanyId, filterType]
  );

  const achievedPct = useMemo(() => {
    const list = kpis ?? [];
    if (!list.length) return 0;
    const achieved = list.filter((k) => k.achieved).length;
    return Math.round((achieved / list.length) * 100);
  }, [kpis]);

  async function onDelete(row: HrKpi) {
    if (!activeCompanyId || !user?.id) return;
    if (!window.confirm(`Delete KPI "${row.kpi_title}"? This cannot be undone.`)) return;
    setDeletingId(row.id as any);
    try {
      await deleteHrKpi({ companyId: activeCompanyId as any, kpiId: row.id as any, actorUserId: user.id as any });
      await refresh();
    } catch (err) {
      alert(toUserFacingError(err, 'Failed to delete KPI. Please try again.'));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Layout title="HR KPIs">
      <div className="max-w-6xl mx-auto px-4 py-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-charcoal">Employee & project KPIs</h1>
            <p className="text-sm text-charcoal-500">
              Track KPI targets, ratings, and close-out for employees and projects.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600"
          >
            Add KPI
          </button>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-charcoal-500">Filter:</span>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="px-3 py-1.5 border border-surface-300 rounded-lg text-sm bg-white"
            >
              <option value="all">All</option>
              <option value="employee">Employee</option>
              <option value="project">Project</option>
            </select>
          </div>
          <div className="text-sm text-charcoal-500">
            {kpis?.length ?? 0} KPIs • {achievedPct}% achieved
          </div>
        </div>

        {error && (
          <div className="bg-critical/5 border border-critical/20 rounded-xl p-3 text-sm text-critical">
            {(error as any)?.message ?? 'Could not load KPIs'}
          </div>
        )}

        {loading && (
          <div className="bg-white rounded-xl border border-surface-300 p-6 shadow-card flex items-center gap-3">
            <LoadingSpinner size={18} />
            <p className="text-sm text-charcoal-500">Loading KPIs…</p>
          </div>
        )}

        {!loading && (kpis ?? []).length === 0 && (
          <div className="bg-white rounded-xl border border-surface-300 p-6 shadow-card">
            <p className="text-sm text-charcoal-500">No KPIs captured yet.</p>
          </div>
        )}

        {!loading && (kpis ?? []).length > 0 && (
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-charcoal-500 border-b border-surface-200">
                  <th className="py-2 pr-4">KPI</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Importance</th>
                  <th className="py-2 pr-4">Target / Actual</th>
                  <th className="py-2 pr-4">Employee</th>
                  <th className="py-2 pr-4">Manager</th>
                  <th className="py-2 pr-4">Achieved</th>
                  <th className="py-2 pr-4">Period</th>
                  <th className="py-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(kpis ?? []).map((kpi) => (
                  <tr key={kpi.id} className="border-b border-surface-100 last:border-0">
                    <td className="py-2 pr-4">
                      <div className="font-medium text-charcoal">{kpi.kpi_title}</div>
                      {kpi.manager_remarks && (
                        <div className="text-xs text-charcoal-500 mt-0.5 line-clamp-2">
                          {kpi.manager_remarks}
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-4 capitalize">{kpi.assessment_type}</td>
                    <td className="py-2 pr-4 capitalize">{kpi.importance}</td>
                    <td className="py-2 pr-4">
                      {kpi.target_value_numeric != null || kpi.actual_value_numeric != null ? (
                        <>
                          {kpi.target_value_numeric ?? '—'} / {kpi.actual_value_numeric ?? '—'}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2 pr-4">{kpi.employee_self_rating ?? '—'}</td>
                    <td className="py-2 pr-4">{kpi.manager_rating ?? '—'}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={
                          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ' +
                          (kpi.achieved
                            ? 'bg-teal-50 text-teal-700'
                            : kpi.achieved === false
                              ? 'bg-critical/5 text-critical'
                              : 'bg-surface-100 text-charcoal-500')
                        }
                      >
                        {kpi.achieved === null ? 'Pending' : kpi.achieved ? 'Achieved' : 'Not achieved'}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      {kpi.period_start || kpi.period_end
                        ? `${kpi.period_start ?? ''} – ${kpi.period_end ?? ''}`
                        : '—'}
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex flex-wrap gap-3 text-xs">
                        <button
                          type="button"
                          className="text-teal underline"
                          onClick={() => {
                            setEditing(kpi);
                            setModalOpen(true);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-critical underline disabled:opacity-50"
                          onClick={() => void onDelete(kpi)}
                          disabled={deletingId === (kpi.id as any)}
                        >
                          {deletingId === (kpi.id as any) ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {activeCompanyId && user?.id && (
        <HrKpiCreateModal
          open={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
          companyId={activeCompanyId as any}
          managerUserId={user.id as any}
          existing={editing}
          onSaved={refresh}
        />
      )}
    </Layout>
  );
}
