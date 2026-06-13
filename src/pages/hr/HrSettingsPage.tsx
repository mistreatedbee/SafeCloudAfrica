import { useEffect, useState } from 'react';
import { Layout } from '../../components/layout/Layout';
import { HrSectionNav } from './HrSectionNav';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { getHrSettings, upsertHrSettings } from '../../api/services/hrService';
import { toUserFacingError } from '../../utils/userFacingMessage';

const WEEK_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;
const DAY_LABEL: Record<(typeof WEEK_DAYS)[number], string> = {
  MONDAY: 'Monday',
  TUESDAY: 'Tuesday',
  WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday',
  FRIDAY: 'Friday',
  SATURDAY: 'Saturday',
  SUNDAY: 'Sunday'
};

export function HrSettingsPage() {
  const { activeCompanyId, activeRole } = useTenant();
  const canEdit = activeRole === 'admin' || activeRole === 'owner';
  const [ownerCanViewRestricted, setOwnerCanViewRestricted] = useState(false);
  const [leaveRequiresHrFinalApproval, setLeaveRequiresHrFinalApproval] = useState(true);
  const [leaveEscalationDays, setLeaveEscalationDays] = useState(3);
  const [repeatOffenceWindowMonths, setRepeatOffenceWindowMonths] = useState(6);
  const [workingDays, setWorkingDays] = useState<string[]>(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, refetch } = useAsync(async () => {
    if (!activeCompanyId) return null;
    return getHrSettings(activeCompanyId);
  }, [activeCompanyId]);

  useEffect(() => {
    if (!data) return;
    setOwnerCanViewRestricted(Boolean(data.owner_can_view_restricted));
    setLeaveRequiresHrFinalApproval(Boolean(data.leave_requires_hr_final_approval));
    setLeaveEscalationDays(Number(data.leave_escalation_days ?? 3));
    setRepeatOffenceWindowMonths(Number(data.repeat_offence_window_months ?? 6));
    const savedWorkingDays = Array.isArray(data.working_days) ? data.working_days.map((d) => String(d).toUpperCase()) : [];
    setWorkingDays(savedWorkingDays.length > 0 ? savedWorkingDays : ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']);
  }, [data]);

  const onSave = async () => {
    if (!activeCompanyId || !canEdit) return;
    setError(null);
    setSuccess(null);
    if (workingDays.length === 0) {
      setError('Select at least one working day before saving.');
      return;
    }
    setSaving(true);
    try {
      await upsertHrSettings({
        company_id: activeCompanyId,
        owner_can_view_restricted: ownerCanViewRestricted,
        leave_requires_hr_final_approval: leaveRequiresHrFinalApproval,
        leave_escalation_days: leaveEscalationDays,
        repeat_offence_window_months: repeatOffenceWindowMonths,
        working_days: workingDays
      });
      await refetch();
      setSuccess('Saved successfully');
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to save HR settings right now. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  function toggleWorkingDay(day: (typeof WEEK_DAYS)[number]) {
    setWorkingDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  return (
    <Layout title="HR Settings">
      <div className="space-y-4">
        <HrSectionNav />
        <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-4">
          <h3 className="font-semibold">Role rules / confidentiality toggles</h3>
          {error && <div className="bg-critical/10 border border-critical/30 rounded-xl p-3 text-sm text-critical">{error}</div>}
          {success && <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700">{success}</div>}

          <div className="space-y-1">
            <label className="flex items-center justify-between text-sm">
              <span>Allow owner to view restricted personal data</span>
              <input type="checkbox" checked={ownerCanViewRestricted} onChange={(e) => setOwnerCanViewRestricted(e.target.checked)} disabled={!canEdit} />
            </label>
            <p className="text-xs text-charcoal-500">
              When enabled, the workspace owner can view employees' South African ID numbers, passport numbers, and other POPIA-sensitive fields. All access is audit-logged. Only the workspace owner can change this setting.
            </p>
          </div>

          <label className="flex items-center justify-between text-sm">
            <span>Leave requires HR final approval</span>
            <input type="checkbox" checked={leaveRequiresHrFinalApproval} onChange={(e) => setLeaveRequiresHrFinalApproval(e.target.checked)} disabled={!canEdit} />
          </label>

          <label className="flex items-center justify-between text-sm">
            <span>Leave escalation days</span>
            <input type="number" min={1} max={30} className="border border-surface-300 rounded px-2 py-1 w-24" value={leaveEscalationDays} onChange={(e) => setLeaveEscalationDays(Number(e.target.value || 3))} disabled={!canEdit} />
          </label>

          <label className="flex items-center justify-between text-sm">
            <span>Repeat offence window (months)</span>
            <input type="number" min={1} max={36} className="border border-surface-300 rounded px-2 py-1 w-24" value={repeatOffenceWindowMonths} onChange={(e) => setRepeatOffenceWindowMonths(Number(e.target.value || 6))} disabled={!canEdit} />
          </label>

          <div className="space-y-2">
            <p className="text-sm font-medium text-charcoal">Working Days</p>
            <p className="text-xs text-charcoal-500">Choose the days your company operates. This will be used for scheduling and daily task allocation.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {WEEK_DAYS.map((day) => (
                <label key={day} className="flex items-center gap-2 text-sm border border-surface-200 rounded-lg px-3 py-2">
                  <input type="checkbox" checked={workingDays.includes(day)} onChange={() => toggleWorkingDay(day)} disabled={!canEdit} />
                  <span>{DAY_LABEL[day]}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            className="px-4 py-2 rounded-lg bg-teal text-white text-sm disabled:opacity-50"
            disabled={!canEdit || saving || workingDays.length === 0}
            onClick={onSave}
          >
            {saving ? 'Saving...' : 'Save settings'}
          </button>
          {workingDays.length === 0 && (
            <p className="text-xs text-critical mt-1">At least one working day must be selected.</p>
          )}
        </div>
      </div>
    </Layout>
  );
}

