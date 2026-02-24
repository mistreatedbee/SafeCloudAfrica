import React, { useEffect, useState } from 'react';
import { Layout } from '../../components/layout/Layout';
import { HrSectionNav } from './HrSectionNav';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { getHrSettings, upsertHrSettings } from '../../api/services/hrService';

export function HrSettingsPage() {
  const { activeCompanyId, activeRole } = useTenant();
  const canEdit = activeRole === 'admin' || activeRole === 'owner';
  const [ownerCanViewRestricted, setOwnerCanViewRestricted] = useState(false);
  const [leaveRequiresHrFinalApproval, setLeaveRequiresHrFinalApproval] = useState(true);
  const [leaveEscalationDays, setLeaveEscalationDays] = useState(3);
  const [repeatOffenceWindowMonths, setRepeatOffenceWindowMonths] = useState(6);

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
  }, [data]);

  const onSave = async () => {
    if (!activeCompanyId || !canEdit) return;
    await upsertHrSettings({
      company_id: activeCompanyId,
      owner_can_view_restricted: ownerCanViewRestricted,
      leave_requires_hr_final_approval: leaveRequiresHrFinalApproval,
      leave_escalation_days: leaveEscalationDays,
      repeat_offence_window_months: repeatOffenceWindowMonths
    });
    await refetch();
  };

  return (
    <Layout title="HR Settings">
      <div className="space-y-4">
        <HrSectionNav />
        <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-4">
          <h3 className="font-semibold">Role rules / confidentiality toggles</h3>

          <label className="flex items-center justify-between text-sm">
            <span>Allow owner to view restricted personal data</span>
            <input type="checkbox" checked={ownerCanViewRestricted} onChange={(e) => setOwnerCanViewRestricted(e.target.checked)} disabled={!canEdit} />
          </label>

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

          <button className="px-4 py-2 rounded-lg bg-teal text-white text-sm disabled:opacity-50" disabled={!canEdit} onClick={onSave}>Save settings</button>
        </div>
      </div>
    </Layout>
  );
}
