import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ClockIcon, PlusIcon, DownloadIcon, PencilIcon, TrashIcon } from 'lucide-react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import {
  listWorkHoursMonthly,
  upsertWorkHoursMonthly,
  deleteWorkHoursMonthly,
  type UpsertWorkHoursMonthlyInput
} from '../../api/services/workHoursMonthlyService';
import { getOrCreateKPISettings } from '../../api/services/kpiSettingsService';
import type { WorkHoursMonthly } from '../../api/models/entities';
import { toCsv, downloadTextFile } from '../../utils/csv';

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function WorkHoursFormModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  userId: string;
  existing: WorkHoursMonthly | null;
  onSaved: () => void;
  defaultDaysWorked: number;
  defaultStandardHours: number;
}) {
  const [year, setYear] = useState(() => props.existing?.year ?? new Date().getFullYear());
  const [month, setMonth] = useState(() => props.existing?.month ?? new Date().getMonth() + 1);
  const [totalEmployees, setTotalEmployees] = useState(props.existing?.total_employees ?? 0);
  const [salariedEmployees, setSalariedEmployees] = useState(props.existing?.salaried_employees ?? 0);
  const [wageEmployees, setWageEmployees] = useState(props.existing?.wage_employees ?? 0);
  const [daysWorked, setDaysWorked] = useState(props.existing?.days_worked ?? props.defaultDaysWorked);
  const [standardHoursPerDay, setStandardHoursPerDay] = useState(props.existing?.standard_hours_per_day ?? props.defaultStandardHours);
  const [overtimeWeekSat, setOvertimeWeekSat] = useState(props.existing?.overtime_hours_week_or_sat ?? 0);
  const [overtimeSunday, setOvertimeSunday] = useState(props.existing?.overtime_hours_sunday ?? 0);
  const [absentDays, setAbsentDays] = useState(props.existing?.employee_absent_days ?? 0);
  const [transportHours, setTransportHours] = useState(props.existing?.employee_transport_hours ?? 0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!props.open) return;
    setYear(props.existing?.year ?? new Date().getFullYear());
    setMonth(props.existing?.month ?? new Date().getMonth() + 1);
    setTotalEmployees(props.existing?.total_employees ?? 0);
    setSalariedEmployees(props.existing?.salaried_employees ?? 0);
    setWageEmployees(props.existing?.wage_employees ?? 0);
    setDaysWorked(props.existing?.days_worked ?? props.defaultDaysWorked);
    setStandardHoursPerDay(props.existing?.standard_hours_per_day ?? props.defaultStandardHours);
    setOvertimeWeekSat(props.existing?.overtime_hours_week_or_sat ?? 0);
    setOvertimeSunday(props.existing?.overtime_hours_sunday ?? 0);
    setAbsentDays(props.existing?.employee_absent_days ?? 0);
    setTransportHours(props.existing?.employee_transport_hours ?? 0);
    setError('');
    setSaving(false);
  }, [props.defaultDaysWorked, props.defaultStandardHours, props.existing, props.open]);

  const totalCalc = useMemo(() => {
    const salaried = salariedEmployees * standardHoursPerDay * daysWorked;
    const wage = wageEmployees * standardHoursPerDay * daysWorked;
    const ot = overtimeWeekSat * 1.5 + overtimeSunday * 2;
    const absent = absentDays * standardHoursPerDay;
    const total = salaried + wage + ot - absent + transportHours;
    return { salaried, wage, ot, absent, total: Math.max(0, total) };
  }, [salariedEmployees, wageEmployees, standardHoursPerDay, daysWorked, overtimeWeekSat, overtimeSunday, absentDays, transportHours]);

  const validationError = useMemo(() => {
    if (totalEmployees < salariedEmployees + wageEmployees) return 'Total employees must be ≥ salaried + wage';
    if (totalCalc.total < 0) return 'Total hours cannot be negative';
    return null;
  }, [totalEmployees, salariedEmployees, wageEmployees, totalCalc.total]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    try {
      await upsertWorkHoursMonthly({
        companyId: props.companyId,
        id: props.existing?.id ?? null,
        year,
        month,
        totalEmployees,
        salariedEmployees,
        wageEmployees,
        standardHoursPerDay,
        daysWorked,
        overtimeHoursWeekOrSat: overtimeWeekSat,
        overtimeHoursSunday: overtimeSunday,
        employeeAbsentDays: absentDays,
        employeeTransportHours: transportHours || undefined,
        createdByUserId: props.userId
      });
      props.onSaved();
      props.onClose();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!props.open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90dvh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-surface-200 px-5 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-charcoal">{props.existing ? 'Edit' : 'Add'} Hours Worked</h2>
          <button
            type="button"
            onClick={props.onClose}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-surface-100 text-charcoal-500 text-xl leading-none shrink-0"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-critical/10 border border-critical/30 rounded-lg p-3 text-sm text-critical">{error}</div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">Year</label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
              >
                {[year - 2, year - 1, year, year + 1].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">Month</label>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
              >
                {MONTHS.map((m) => (
                  <option key={m} value={m}>{MONTH_NAMES[m - 1]}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">Total employees</label>
              <input
                type="number"
                min={0}
                value={totalEmployees}
                onChange={(e) => setTotalEmployees(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">Salaried</label>
              <input
                type="number"
                min={0}
                value={salariedEmployees}
                onChange={(e) => setSalariedEmployees(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">Wage</label>
              <input
                type="number"
                min={0}
                value={wageEmployees}
                onChange={(e) => setWageEmployees(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">Days worked</label>
              <input
                type="number"
                min={0}
                step={0.25}
                value={daysWorked}
                onChange={(e) => setDaysWorked(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">Standard hours/day</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={standardHoursPerDay}
                onChange={(e) => setStandardHoursPerDay(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">Overtime (week/sat) hrs @ 1.5</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={overtimeWeekSat}
                onChange={(e) => setOvertimeWeekSat(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">Overtime (Sunday) hrs @ 2.0</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={overtimeSunday}
                onChange={(e) => setOvertimeSunday(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">Absent days</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={absentDays}
                onChange={(e) => setAbsentDays(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">Transport hours (optional)</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={transportHours}
                onChange={(e) => setTransportHours(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
              />
            </div>
          </div>
          <div className="bg-surface-50 rounded-lg p-3 text-sm">
            <strong>Total hours (calculated):</strong> {totalCalc.total.toLocaleString()}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={props.onClose} className="px-4 py-2 rounded-lg border border-surface-300 text-charcoal">Cancel</button>
            <button type="submit" disabled={saving || !!validationError} className="px-4 py-2 rounded-lg bg-teal text-white disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function HoursWorkedPage() {
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WorkHoursMonthly | null>(null);
  const canManage = activeRole === 'admin' || activeRole === 'owner' || activeRole === 'manager' || activeRole === 'supervisor';

  const { data: rows, loading, refetch } = useAsync<WorkHoursMonthly[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listWorkHoursMonthly({ companyId: activeCompanyId, limit: 120 });
    },
    [activeCompanyId]
  );

  const { data: kpiSettings } = useAsync(
    async () => {
      if (!activeCompanyId) return null;
      return await getOrCreateKPISettings(activeCompanyId);
    },
    [activeCompanyId]
  );

  const handleExportCsv = () => {
    const list = rows ?? [];
    const rowsForCsv = list.map((r) => ({
      Year: r.year,
      Month: r.month,
      'Total employees': r.total_employees,
      Salaried: r.salaried_employees,
      Wage: r.wage_employees,
      'Days worked': r.days_worked,
      'Std hrs/day': r.standard_hours_per_day,
      'Total hours worked': r.total_hours_worked_final
    }));
    const csv = toCsv(rowsForCsv);
    downloadTextFile(`hours-worked-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const list = useMemo(() => {
    const r = rows ?? [];
    return [...r].sort((a, b) => (a.year !== b.year ? b.year - a.year : b.month - a.month));
  }, [rows]);

  return (
    <Layout title="Hours Worked">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <p className="text-sm text-charcoal-500">
            Monthly hours worked for KPI formulas (TRIR, LTIFR, etc.). One entry per month per organisation.
          </p>
          <div className="flex gap-2">
            {canManage && (
              <button
                type="button"
                onClick={() => { setEditing(null); setModalOpen(true); }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white"
              >
                <PlusIcon className="w-4 h-4" /> Add entry
              </button>
            )}
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-300 text-charcoal"
            >
              <DownloadIcon className="w-4 h-4" /> Export CSV
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-charcoal-500">Loading…</p>
        ) : list.length === 0 ? (
          <div className="bg-surface-50 rounded-xl p-6 text-center text-charcoal-500">
            No hours worked entries yet. Add a month to get started.
          </div>
        ) : (
          <div className="border border-surface-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-100 border-b border-surface-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-charcoal">Year</th>
                  <th className="text-left px-4 py-3 font-medium text-charcoal">Month</th>
                  <th className="text-right px-4 py-3 font-medium text-charcoal">Employees</th>
                  <th className="text-right px-4 py-3 font-medium text-charcoal">Total hours</th>
                  {canManage && <th className="w-24" />}
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className="border-b border-surface-100 hover:bg-surface-50">
                    <td className="px-4 py-3">{r.year}</td>
                    <td className="px-4 py-3">{MONTH_NAMES[r.month - 1]}</td>
                    <td className="px-4 py-3 text-right">{r.total_employees}</td>
                    <td className="px-4 py-3 text-right">{r.total_hours_worked_final.toLocaleString()}</td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => { setEditing(r); setModalOpen(true); }}
                            className="p-1.5 rounded hover:bg-surface-200 text-charcoal-500"
                            title="Edit"
                          >
                            <PencilIcon className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!activeCompanyId || !confirm('Delete this entry?')) return;
                              await deleteWorkHoursMonthly(activeCompanyId, r.id);
                              await refetch();
                            }}
                            className="p-1.5 rounded hover:bg-critical/10 text-critical"
                            title="Delete"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <WorkHoursFormModal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          companyId={activeCompanyId ?? ''}
          userId={user?.id ?? ''}
          existing={editing}
          onSaved={() => refetch()}
          defaultDaysWorked={kpiSettings?.default_days_worked ?? 21}
          defaultStandardHours={kpiSettings?.default_standard_hours_per_day ?? 8}
        />
      </motion.div>
    </Layout>
  );
}
