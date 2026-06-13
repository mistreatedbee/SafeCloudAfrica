import { useState } from 'react';
import { useUser } from '@insforge/react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import {
  listLotoRecords,
  createLotoRecord,
  updateLotoRecord,
  deleteLotoRecord,
  type LotoRecord
} from '../../api/services/lotoService';
import { listSites } from '../../api/services/sitesService';
import type { UUID } from '../../api/models/core';
import { toUserFacingError } from '../../utils/userFacingMessage';
import { MANAGEMENT_ROLES } from '../../constants/roles';

function StatusBadge({ status }: { status: string }) {
  return status === 'LOCKED' ? (
    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-critical/10 text-critical">Locked</span>
  ) : (
    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Released</span>
  );
}

export function LotoPage() {
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const canManage = MANAGEMENT_ROLES.includes(activeRole as typeof MANAGEMENT_ROLES[number]);

  const [equipmentName, setEquipmentName] = useState('');
  const [location, setLocation] = useState('');
  const [siteId, setSiteId] = useState('');
  const [reason, setReason] = useState('');
  const [isolationPointsRaw, setIsolationPointsRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: records, loading: recordsLoading, refetch } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listLotoRecords(activeCompanyId);
  }, [activeCompanyId]);

  const { data: sites } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listSites(activeCompanyId);
  }, [activeCompanyId]);

  const activeSites = (sites ?? []).filter((s) => s.is_active);
  const siteLabel = new Map((sites ?? []).map((s) => [String(s.id), s.name]));

  function resetForm() {
    setEquipmentName('');
    setLocation('');
    setSiteId('');
    setReason('');
    setIsolationPointsRaw('');
    setError(null);
  }

  async function onApplyLock() {
    if (!activeCompanyId || !user?.id || !equipmentName.trim()) {
      setError('Equipment name is required.');
      return;
    }

    // Task 3: isolation points required
    const isolationPoints = isolationPointsRaw.split(',').map((s) => s.trim()).filter(Boolean);
    if (isolationPoints.length === 0) {
      setError('At least one isolation point is required.');
      return;
    }

    // Task 2: concurrent lock check (CRITICAL)
    const existing = (records ?? []).find(
      r => r.status === 'LOCKED' && r.equipment_name.toLowerCase() === equipmentName.trim().toLowerCase()
    );
    if (existing) {
      setError('This equipment already has an active lock. Release the existing lock first.');
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
        actorUserId: user.id as UUID
      });
      setSuccess('LOTO lock applied.');
      resetForm();
      await refetch();
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to apply lock. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  async function onRelease(r: LotoRecord) {
    if (!activeCompanyId || !user?.id) return;
    if (!window.confirm(`Release lock on "${r.equipment_name}"? Ensure the area is safe before proceeding.`)) return;
    setError(null);
    setSuccess(null);
    try {
      await updateLotoRecord({
        companyId: activeCompanyId,
        recordId: r.id as UUID,
        patch: {
          status: 'RELEASED',
          lock_removed_by_user_id: user.id as UUID,
          lock_removed_at: new Date().toISOString()
        },
        actorUserId: user.id as UUID
      });
      setSuccess('Lock released.');
      await refetch();
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to release lock.'));
    }
  }

  async function onDelete(r: LotoRecord) {
    if (!activeCompanyId || !user?.id) return;
    // Task 4: released locks delete confirmation
    if (!window.confirm('Delete this LOTO record? This cannot be undone.')) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteLotoRecord({ companyId: activeCompanyId, recordId: r.id as UUID, actorUserId: user.id as UUID });
      setSuccess('Record deleted.');
      await refetch();
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to delete LOTO record.'));
    }
  }

  const locked = (records ?? []).filter((r) => r.status === 'LOCKED');
  const released = (records ?? []).filter((r) => r.status === 'RELEASED');

  return (
    <Layout title="Lockout / Tagout (LOTO)">
      <div className="space-y-4">
        {error && <div className="bg-critical/10 border border-critical/30 rounded-xl p-3 text-sm text-critical">{error}</div>}
        {success && <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700">{success}</div>}

        {canManage && (
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
                <span className="block text-xs text-charcoal-500 mb-1">Location / Area</span>
                <input className="w-full border border-surface-300 rounded-lg px-3 py-2" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Production floor, Bay 2" />
              </label>
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Reason for lockout</span>
                <input className="w-full border border-surface-300 rounded-lg px-3 py-2" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Scheduled maintenance, fault repair" />
              </label>
              <label className="text-sm md:col-span-2">
                <span className="block text-xs text-charcoal-500 mb-1">Isolation points (comma-separated) *</span>
                <input className="w-full border border-surface-300 rounded-lg px-3 py-2" value={isolationPointsRaw} onChange={(e) => setIsolationPointsRaw(e.target.value)} placeholder="Main isolator, Air supply valve, Hydraulic release, ..." />
              </label>
            </div>
            <button className="px-4 py-2 rounded-lg bg-critical text-white text-sm disabled:opacity-60" onClick={() => void onApplyLock()} disabled={saving || !equipmentName.trim()}>
              {saving ? 'Applying...' : 'Apply lockout'}
            </button>
          </div>
        )}

        {/* Task 5: loading indicator while records fetch */}
        {recordsLoading && (
          <div className="bg-white border border-surface-300 rounded-xl p-6 text-center text-sm text-charcoal-500">
            Loading LOTO records…
          </div>
        )}

        {!recordsLoading && (
          <>
            <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
              <div className="px-4 py-3 border-b border-surface-200">
                <h3 className="font-semibold">Active locks ({locked.length})</h3>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-surface-100">
                  <tr>
                    <th className="text-left px-4 py-2">Equipment</th>
                    <th className="text-left px-4 py-2">Location</th>
                    <th className="text-left px-4 py-2">Site</th>
                    <th className="text-left px-4 py-2">Reason</th>
                    <th className="text-left px-4 py-2">Applied at</th>
                    <th className="text-left px-4 py-2">Status</th>
                    {canManage && <th className="text-left px-4 py-2">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {/* Task 5: empty state — "No active locks. The area is clear." */}
                  {locked.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-6 text-charcoal-500 text-center">No active locks. The area is clear.</td></tr>
                  )}
                  {locked.map((r) => (
                    <tr key={r.id} className="border-t border-surface-100">
                      <td className="px-4 py-2 font-medium">{r.equipment_name}</td>
                      <td className="px-4 py-2 text-charcoal-500">{r.location ?? '-'}</td>
                      <td className="px-4 py-2 text-charcoal-500">{r.site_id ? (siteLabel.get(String(r.site_id)) ?? '-') : '-'}</td>
                      <td className="px-4 py-2 text-charcoal-500">{r.reason ?? '-'}</td>
                      <td className="px-4 py-2 text-charcoal-500">{r.lock_applied_at ? new Date(r.lock_applied_at).toLocaleString() : '-'}</td>
                      <td className="px-4 py-2"><StatusBadge status={r.status} /></td>
                      {canManage && (
                        <td className="px-4 py-2">
                          <div className="flex gap-3">
                            <button className="text-emerald-600 hover:underline" onClick={() => void onRelease(r)}>Release</button>
                            <button className="text-critical hover:underline" onClick={() => void onDelete(r)}>Delete</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {released.length > 0 && (
              <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
                <div className="px-4 py-3 border-b border-surface-200">
                  <h3 className="font-semibold text-charcoal-500">Released locks ({released.length})</h3>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-surface-100">
                    <tr>
                      <th className="text-left px-4 py-2">Equipment</th>
                      <th className="text-left px-4 py-2">Location</th>
                      <th className="text-left px-4 py-2">Applied at</th>
                      <th className="text-left px-4 py-2">Released at</th>
                      <th className="text-left px-4 py-2">Status</th>
                      {canManage && <th className="text-left px-4 py-2">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {released.map((r) => (
                      <tr key={r.id} className="border-t border-surface-100 opacity-70">
                        <td className="px-4 py-2 font-medium">{r.equipment_name}</td>
                        <td className="px-4 py-2 text-charcoal-500">{r.location ?? '-'}</td>
                        <td className="px-4 py-2 text-charcoal-500">{r.lock_applied_at ? new Date(r.lock_applied_at).toLocaleString() : '-'}</td>
                        <td className="px-4 py-2 text-charcoal-500">{r.lock_removed_at ? new Date(r.lock_removed_at).toLocaleString() : '-'}</td>
                        <td className="px-4 py-2"><StatusBadge status={r.status} /></td>
                        {canManage && (
                          <td className="px-4 py-2">
                            <button className="text-critical hover:underline" onClick={() => void onDelete(r)}>Delete</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
