import { Fragment, useEffect, useMemo, useState } from 'react';
import { useUser } from '@insforge/react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import {
  listLotoRecords,
  createLotoRecord,
  approveLotoRecord,
  rejectLotoRecord,
  suspendLotoRecord,
  cancelLotoRecord,
  requestEmergencyLotoRemoval,
  closeLotoRecord,
  deleteLotoRecord,
  type LotoRecord,
  type LotoStatus
} from '../../api/services/lotoService';
import { listSites } from '../../api/services/sitesService';
import { listUserProfiles } from '../../api/services/profilesService';
import type { UUID } from '../../api/models/core';
import { toUserFacingError } from '../../utils/userFacingMessage';
import { MANAGEMENT_ROLES } from '../../constants/roles';

const STATUS_BADGE: Record<LotoStatus, { label: string; className: string }> = {
  PENDING: { label: 'Awaiting approval', className: 'bg-amber-100 text-amber-800' },
  ACTIVE: { label: 'Active', className: 'bg-critical/10 text-critical' },
  SUSPENDED: { label: 'Suspended', className: 'bg-orange-100 text-orange-800' },
  CANCELLED: { label: 'Cancelled', className: 'bg-surface-200 text-charcoal-600' },
  REJECTED: { label: 'Rejected', className: 'bg-critical/10 text-critical' },
  CLOSED: { label: 'Closed', className: 'bg-emerald-100 text-emerald-800' }
};

const TERMINAL_STATUSES: LotoStatus[] = ['CANCELLED', 'REJECTED', 'CLOSED'];

function StatusBadge({ status }: { status: LotoStatus }) {
  const { label, className } = STATUS_BADGE[status] ?? STATUS_BADGE.PENDING;
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>{label}</span>;
}

function profileLabel(profiles: Map<string, string>, userId: string | null | undefined): string {
  if (!userId) return '—';
  return profiles.get(userId) ?? `${userId.slice(0, 8)}…`;
}

export function LotoPage() {
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const canManage = MANAGEMENT_ROLES.includes(activeRole as (typeof MANAGEMENT_ROLES)[number]);

  const [equipmentName, setEquipmentName] = useState('');
  const [location, setLocation] = useState('');
  const [siteId, setSiteId] = useState('');
  const [reason, setReason] = useState('');
  const [isolationPointsRaw, setIsolationPointsRaw] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [responsiblePersonUserId, setResponsiblePersonUserId] = useState('');
  const [authorisedLotoPersonUserId, setAuthorisedLotoPersonUserId] = useState('');
  const [affectedEmployeesCount, setAffectedEmployeesCount] = useState('');
  const [zeroEnergyVerified, setZeroEnergyVerified] = useState<'yes' | 'no' | ''>('');
  const [shiftHandover, setShiftHandover] = useState<'yes' | 'no' | ''>('');
  const [lotoRiskAssessmentCompleted, setLotoRiskAssessmentCompleted] = useState<'yes' | 'no' | ''>('');
  const [workflowRecordId, setWorkflowRecordId] = useState<UUID | null>(null);
  const [workflowMode, setWorkflowMode] = useState<'review' | 'suspend' | 'cancel' | 'emergency' | 'close'>('review');
  const [workflowComment, setWorkflowComment] = useState('');
  const [emergencyNotifyUserId, setEmergencyNotifyUserId] = useState('');
  const [restorationVerified, setRestorationVerified] = useState<'yes' | 'no' | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [workflowSaving, setWorkflowSaving] = useState(false);

  const { data: records, loading: recordsLoading, refetch } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listLotoRecords(activeCompanyId);
  }, [activeCompanyId]);

  const { data: sites } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listSites(activeCompanyId);
  }, [activeCompanyId]);

  const { data: profiles } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listUserProfiles(activeCompanyId);
  }, [activeCompanyId]);

  const profileMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of profiles ?? []) {
      map.set(p.user_id, [p.full_name, p.email].filter(Boolean).join(' • ') || p.user_id);
    }
    return map;
  }, [profiles]);

  const activeSites = (sites ?? []).filter((s) => s.is_active);

  useEffect(() => {
    if (user?.id && !responsiblePersonUserId) setResponsiblePersonUserId(user.id);
  }, [user?.id, responsiblePersonUserId]);

  function resetForm() {
    setEquipmentName('');
    setLocation('');
    setSiteId('');
    setReason('');
    setIsolationPointsRaw('');
    setStartTime('');
    setEndTime('');
    setResponsiblePersonUserId(user?.id ?? '');
    setAuthorisedLotoPersonUserId('');
    setAffectedEmployeesCount('');
    setZeroEnergyVerified('');
    setShiftHandover('');
    setLotoRiskAssessmentCompleted('');
    setError(null);
  }

  function canAuthorise(record: LotoRecord): boolean {
    if (!user?.id) return false;
    if (canManage) return true;
    return record.authorised_loto_person_user_id === user.id;
  }

  function canManageRecord(record: LotoRecord): boolean {
    if (canManage) return true;
    return record.responsible_person_user_id === user?.id;
  }

  async function onApplyLock() {
    if (!activeCompanyId || !user?.id || !equipmentName.trim()) {
      setError('Equipment name is required.');
      return;
    }
    if (!responsiblePersonUserId || !authorisedLotoPersonUserId) {
      setError('Responsible person and authorised LOTO person are required.');
      return;
    }
    if (!zeroEnergyVerified || !shiftHandover || !lotoRiskAssessmentCompleted) {
      setError('Please complete all safety verification fields.');
      return;
    }

    const isolationPoints = isolationPointsRaw.split(',').map((s) => s.trim()).filter(Boolean);
    if (isolationPoints.length === 0) {
      setError('At least one isolation point is required.');
      return;
    }

    const existing = (records ?? []).find(
      (r) =>
        (r.status === 'ACTIVE' || r.status === 'PENDING' || r.status === 'SUSPENDED') &&
        r.equipment_name.toLowerCase() === equipmentName.trim().toLowerCase()
    );
    if (existing) {
      setError('This equipment already has an open LOTO record. Close or cancel the existing record first.');
      return;
    }

    if (startTime && endTime && startTime > endTime) {
      setError('Start time must be before end time.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await createLotoRecord({
        companyId: activeCompanyId,
        equipmentName: equipmentName.trim(),
        location: location.trim() || null,
        siteId: (siteId || null) as UUID | null,
        lockAppliedByUserId: user.id as UUID,
        reason: reason.trim() || null,
        isolationPoints,
        startTime: startTime ? new Date(startTime).toISOString() : null,
        endTime: endTime ? new Date(endTime).toISOString() : null,
        responsiblePersonUserId: responsiblePersonUserId as UUID,
        authorisedLotoPersonUserId: authorisedLotoPersonUserId as UUID,
        affectedEmployeesCount: affectedEmployeesCount ? Number(affectedEmployeesCount) : null,
        zeroEnergyVerified: zeroEnergyVerified === 'yes',
        shiftHandover: shiftHandover === 'yes',
        lotoRiskAssessmentCompleted: lotoRiskAssessmentCompleted === 'yes',
        actorUserId: user.id as UUID
      });
      setSuccess('LOTO submitted for authorisation.');
      resetForm();
      await refetch();
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to apply lockout. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  async function runWorkflow(record: LotoRecord) {
    if (!activeCompanyId || !user?.id) return;
    setWorkflowSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (workflowMode === 'suspend' || workflowMode === 'cancel' || workflowMode === 'emergency') {
        if (!workflowComment.trim()) throw new Error('A comment is required for this action.');
      }
      if (workflowMode === 'review') {
        await approveLotoRecord({
          companyId: activeCompanyId,
          recordId: record.id as UUID,
          actorUserId: user.id as UUID,
          comment: workflowComment
        });
        setSuccess('LOTO approved and active.');
      } else if (workflowMode === 'suspend') {
        await suspendLotoRecord({
          companyId: activeCompanyId,
          recordId: record.id as UUID,
          actorUserId: user.id as UUID,
          comment: workflowComment
        });
        setSuccess('LOTO suspended.');
      } else if (workflowMode === 'cancel') {
        await cancelLotoRecord({
          companyId: activeCompanyId,
          recordId: record.id as UUID,
          actorUserId: user.id as UUID,
          comment: workflowComment
        });
        setSuccess('LOTO cancelled.');
      } else if (workflowMode === 'emergency') {
        if (!emergencyNotifyUserId) throw new Error('Select the person to notify for emergency removal.');
        await requestEmergencyLotoRemoval({
          companyId: activeCompanyId,
          recordId: record.id as UUID,
          actorUserId: user.id as UUID,
          notifyUserId: emergencyNotifyUserId as UUID,
          comment: workflowComment
        });
        setSuccess('Emergency removal request sent.');
      } else {
        if (restorationVerified !== 'yes') {
          throw new Error('Restoration / de-isolation must be verified as Yes before closing.');
        }
        await closeLotoRecord({
          companyId: activeCompanyId,
          recordId: record.id as UUID,
          actorUserId: user.id as UUID,
          restorationVerified: true,
          comment: workflowComment
        });
        setSuccess('LOTO closed.');
      }
      setWorkflowRecordId(null);
      setWorkflowComment('');
      setEmergencyNotifyUserId('');
      setRestorationVerified('');
      await refetch();
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to update LOTO record.'));
    } finally {
      setWorkflowSaving(false);
    }
  }

  async function onReject(record: LotoRecord) {
    if (!activeCompanyId || !user?.id) return;
    const comment = window.prompt('Rejection comment (required):');
    if (!comment?.trim()) return;
    setError(null);
    try {
      await rejectLotoRecord({
        companyId: activeCompanyId,
        recordId: record.id as UUID,
        actorUserId: user.id as UUID,
        comment
      });
      setSuccess('LOTO rejected.');
      await refetch();
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to reject LOTO.'));
    }
  }

  async function onDelete(r: LotoRecord) {
    if (!activeCompanyId || !user?.id || !canManage) return;
    if (!window.confirm('Delete this LOTO record? This cannot be undone.')) return;
    try {
      await deleteLotoRecord({ companyId: activeCompanyId, recordId: r.id as UUID, actorUserId: user.id as UUID });
      setSuccess('Record deleted.');
      await refetch();
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to delete LOTO record.'));
    }
  }

  const openRecords = (records ?? []).filter((r) => !TERMINAL_STATUSES.includes(r.status));
  const closedRecords = (records ?? []).filter((r) => TERMINAL_STATUSES.includes(r.status));
  const workflowRecord = (records ?? []).find((r) => r.id === workflowRecordId) ?? null;

  return (
    <Layout title="Lockout / Tagout (LOTO)">
      <div className="space-y-4">
        {error && <div className="bg-critical/10 border border-critical/30 rounded-xl p-3 text-sm text-critical">{error}</div>}
        {success && <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700">{success}</div>}

        {user?.id && (
          <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
            <h3 className="font-semibold">Apply lockout</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Equipment / Machine name *</span>
                <input className="w-full border border-surface-300 rounded-lg px-3 py-2" value={equipmentName} onChange={(e) => setEquipmentName(e.target.value)} placeholder="e.g. Conveyor Belt #3" />
              </label>
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Site (optional)</span>
                <select className="w-full border border-surface-300 rounded-lg px-3 py-2" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                  <option value="">— No site —</option>
                  {activeSites.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Responsible person *</span>
                <select className="w-full border border-surface-300 rounded-lg px-3 py-2" value={responsiblePersonUserId} onChange={(e) => setResponsiblePersonUserId(e.target.value)} disabled={!canManage}>
                  {(profiles ?? []).map((p) => <option key={p.user_id} value={p.user_id}>{profileLabel(profileMap, p.user_id)}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Authorised LOTO person *</span>
                <select className="w-full border border-surface-300 rounded-lg px-3 py-2" value={authorisedLotoPersonUserId} onChange={(e) => setAuthorisedLotoPersonUserId(e.target.value)}>
                  <option value="">Select authoriser…</option>
                  {(profiles ?? []).map((p) => <option key={p.user_id} value={p.user_id}>{profileLabel(profileMap, p.user_id)}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Start time</span>
                <input type="datetime-local" className="w-full border border-surface-300 rounded-lg px-3 py-2" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">End time</span>
                <input type="datetime-local" className="w-full border border-surface-300 rounded-lg px-3 py-2" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Location / Area</span>
                <input className="w-full border border-surface-300 rounded-lg px-3 py-2" value={location} onChange={(e) => setLocation(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Number of affected employees</span>
                <input type="number" min={0} className="w-full border border-surface-300 rounded-lg px-3 py-2" value={affectedEmployeesCount} onChange={(e) => setAffectedEmployeesCount(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Reason for lockout</span>
                <input className="w-full border border-surface-300 rounded-lg px-3 py-2" value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Zero-Energy verified *</span>
                <select className="w-full border border-surface-300 rounded-lg px-3 py-2" value={zeroEnergyVerified} onChange={(e) => setZeroEnergyVerified(e.target.value as 'yes' | 'no' | '')}>
                  <option value="">Select…</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Shift handover *</span>
                <select className="w-full border border-surface-300 rounded-lg px-3 py-2" value={shiftHandover} onChange={(e) => setShiftHandover(e.target.value as 'yes' | 'no' | '')}>
                  <option value="">Select…</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">LOTO risk assessment completed *</span>
                <select className="w-full border border-surface-300 rounded-lg px-3 py-2" value={lotoRiskAssessmentCompleted} onChange={(e) => setLotoRiskAssessmentCompleted(e.target.value as 'yes' | 'no' | '')}>
                  <option value="">Select…</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
              <label className="text-sm md:col-span-2">
                <span className="block text-xs text-charcoal-500 mb-1">Isolation points (comma-separated) *</span>
                <input className="w-full border border-surface-300 rounded-lg px-3 py-2" value={isolationPointsRaw} onChange={(e) => setIsolationPointsRaw(e.target.value)} placeholder="Main isolator, Air supply valve, ..." />
              </label>
            </div>
            <button className="px-4 py-2 rounded-lg bg-critical text-white text-sm disabled:opacity-60" onClick={() => void onApplyLock()} disabled={saving || !equipmentName.trim()}>
              {saving ? 'Submitting…' : 'Submit for approval'}
            </button>
          </div>
        )}

        {recordsLoading && (
          <div className="bg-white border border-surface-300 rounded-xl p-6 text-center text-sm text-charcoal-500">Loading LOTO records…</div>
        )}

        {!recordsLoading && (
          <>
            <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
              <div className="px-4 py-3 border-b border-surface-200">
                <h3 className="font-semibold">Open LOTO records ({openRecords.length})</h3>
              </div>
              <table className="w-full text-sm min-w-[1100px]">
                <thead className="bg-surface-100">
                  <tr>
                    <th className="text-left px-4 py-2">Equipment</th>
                    <th className="text-left px-4 py-2">Responsible</th>
                    <th className="text-left px-4 py-2">Authoriser</th>
                    <th className="text-left px-4 py-2">Start</th>
                    <th className="text-left px-4 py-2">End</th>
                    <th className="text-left px-4 py-2">Affected</th>
                    <th className="text-left px-4 py-2">Zero energy</th>
                    <th className="text-left px-4 py-2">Status</th>
                    <th className="text-left px-4 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {openRecords.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-6 text-charcoal-500 text-center">No open LOTO records. The area is clear.</td></tr>
                  )}
                  {openRecords.map((r) => (
                    <Fragment key={r.id}>
                      <tr className="border-t border-surface-100">
                        <td className="px-4 py-2 font-medium">{r.equipment_name}</td>
                        <td className="px-4 py-2 text-charcoal-500">{profileLabel(profileMap, r.responsible_person_user_id)}</td>
                        <td className="px-4 py-2 text-charcoal-500">{profileLabel(profileMap, r.authorised_loto_person_user_id)}</td>
                        <td className="px-4 py-2 text-charcoal-500">{r.start_time ? new Date(r.start_time).toLocaleString('en-ZA') : '—'}</td>
                        <td className="px-4 py-2 text-charcoal-500">{r.end_time ? new Date(r.end_time).toLocaleString('en-ZA') : '—'}</td>
                        <td className="px-4 py-2 text-charcoal-500">{r.affected_employees_count ?? '—'}</td>
                        <td className="px-4 py-2 text-charcoal-500">{r.zero_energy_verified == null ? '—' : r.zero_energy_verified ? 'Yes' : 'No'}</td>
                        <td className="px-4 py-2"><StatusBadge status={r.status} /></td>
                        <td className="px-4 py-2">
                          <div className="flex gap-2 flex-wrap">
                            {canAuthorise(r) && (r.status === 'PENDING' || r.status === 'SUSPENDED') && (
                              <>
                                <button className="text-teal hover:underline" onClick={() => { setWorkflowRecordId(r.id as UUID); setWorkflowMode('review'); setWorkflowComment(''); }}>Approve</button>
                                <button className="text-critical hover:underline" onClick={() => void onReject(r)}>Reject</button>
                              </>
                            )}
                            {canAuthorise(r) && r.status === 'ACTIVE' && (
                              <button className="text-orange-600 hover:underline" onClick={() => { setWorkflowRecordId(r.id as UUID); setWorkflowMode('suspend'); setWorkflowComment(''); }}>Suspend</button>
                            )}
                            {(canManageRecord(r) || canAuthorise(r)) && !TERMINAL_STATUSES.includes(r.status) && (
                              <button className="text-amber-600 hover:underline" onClick={() => { setWorkflowRecordId(r.id as UUID); setWorkflowMode('cancel'); setWorkflowComment(''); }}>Cancel</button>
                            )}
                            {(canManageRecord(r) || canAuthorise(r)) && (r.status === 'ACTIVE' || r.status === 'SUSPENDED') && (
                              <button className="text-navy hover:underline" onClick={() => { setWorkflowRecordId(r.id as UUID); setWorkflowMode('emergency'); setWorkflowComment(''); setEmergencyNotifyUserId(r.authorised_loto_person_user_id ?? ''); }}>Emergency removal</button>
                            )}
                            {(canManageRecord(r) || canAuthorise(r)) && r.status === 'ACTIVE' && (
                              <button className="text-charcoal-600 hover:underline" onClick={() => { setWorkflowRecordId(r.id as UUID); setWorkflowMode('close'); setWorkflowComment(''); setRestorationVerified(''); }}>Close</button>
                            )}
                            {canManage && <button className="text-critical hover:underline" onClick={() => void onDelete(r)}>Delete</button>}
                          </div>
                        </td>
                      </tr>
                      {(r.status_comment || r.emergency_removal_requested) && (
                        <tr className="bg-surface-50/70">
                          <td colSpan={9} className="px-4 py-2 text-xs text-charcoal-600 space-y-1">
                            {r.status_comment && <p><span className="font-semibold">Comment:</span> {r.status_comment}</p>}
                            {r.emergency_removal_requested && (
                              <p className="text-orange-700">
                                Emergency removal requested
                                {r.emergency_removal_notify_user_id ? ` → ${profileLabel(profileMap, r.emergency_removal_notify_user_id)}` : ''}
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {closedRecords.length > 0 && (
              <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
                <div className="px-4 py-3 border-b border-surface-200">
                  <h3 className="font-semibold text-charcoal-500">Closed / cancelled records ({closedRecords.length})</h3>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-surface-100">
                    <tr>
                      <th className="text-left px-4 py-2">Equipment</th>
                      <th className="text-left px-4 py-2">Status</th>
                      <th className="text-left px-4 py-2">Restoration verified</th>
                      <th className="text-left px-4 py-2">Closed at</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closedRecords.map((r) => (
                      <tr key={r.id} className="border-t border-surface-100 opacity-80">
                        <td className="px-4 py-2 font-medium">{r.equipment_name}</td>
                        <td className="px-4 py-2"><StatusBadge status={r.status} /></td>
                        <td className="px-4 py-2 text-charcoal-500">{r.restoration_verified == null ? '—' : r.restoration_verified ? 'Yes' : 'No'}</td>
                        <td className="px-4 py-2 text-charcoal-500">{r.closed_at ? new Date(r.closed_at).toLocaleString('en-ZA') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {workflowRecord && workflowRecordId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
            <div className="bg-white rounded-xl border border-surface-300 shadow-xl w-full max-w-md p-5 space-y-4">
              <h4 className="font-semibold text-charcoal">
                {workflowMode === 'review' && 'Approve LOTO'}
                {workflowMode === 'suspend' && 'Suspend LOTO'}
                {workflowMode === 'cancel' && 'Cancel LOTO'}
                {workflowMode === 'emergency' && 'Emergency lock removal'}
                {workflowMode === 'close' && 'Close LOTO'}
              </h4>
              {workflowMode === 'emergency' && (
                <label className="text-sm block">
                  <span className="block text-xs text-charcoal-500 mb-1">Notify person *</span>
                  <select className="w-full border border-surface-300 rounded-lg px-3 py-2" value={emergencyNotifyUserId} onChange={(e) => setEmergencyNotifyUserId(e.target.value)}>
                    <option value="">Select person…</option>
                    {(profiles ?? []).map((p) => <option key={p.user_id} value={p.user_id}>{profileLabel(profileMap, p.user_id)}</option>)}
                  </select>
                </label>
              )}
              {workflowMode === 'close' && (
                <label className="text-sm block">
                  <span className="block text-xs text-charcoal-500 mb-1">Restoration / de-isolation verified *</span>
                  <select className="w-full border border-surface-300 rounded-lg px-3 py-2" value={restorationVerified} onChange={(e) => setRestorationVerified(e.target.value as 'yes' | 'no' | '')}>
                    <option value="">Select…</option>
                    <option value="yes">Yes — all verified and in good order</option>
                    <option value="no">No</option>
                  </select>
                </label>
              )}
              <textarea
                rows={3}
                className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm"
                value={workflowComment}
                onChange={(e) => setWorkflowComment(e.target.value)}
                placeholder={
                  workflowMode === 'review'
                    ? 'Optional approval comment'
                    : workflowMode === 'close'
                      ? 'Optional closure comment'
                      : 'Comment (required)'
                }
              />
              <div className="flex flex-wrap gap-2 justify-end">
                <button type="button" className="px-3 py-2 rounded-lg border border-surface-300 text-sm" onClick={() => { setWorkflowRecordId(null); setWorkflowComment(''); }}>Cancel</button>
                <button type="button" disabled={workflowSaving} className="px-3 py-2 rounded-lg bg-teal text-white text-sm disabled:opacity-60" onClick={() => void runWorkflow(workflowRecord)}>
                  {workflowSaving ? 'Saving…' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
