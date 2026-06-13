import { useState } from 'react';
import { useUser } from '@insforge/react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import {
  listPermitsToWork,
  createPermitToWork,
  updatePermitToWork,
  deletePermitToWork,
  type PermitToWork
} from '../../api/services/permitToWorkService';
import { listSites } from '../../api/services/sitesService';
import type { UUID } from '../../api/models/core';
import { toUserFacingError } from '../../utils/userFacingMessage';
import { MANAGEMENT_ROLES } from '../../constants/roles';

const STATUS_BADGE: Record<PermitToWork['status'], { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'bg-amber-100 text-amber-700' },
  APPROVED: { label: 'Approved', className: 'bg-blue-100 text-blue-700' },
  ACTIVE: { label: 'Active', className: 'bg-emerald-100 text-emerald-700' },
  CLOSED: { label: 'Closed', className: 'bg-surface-200 text-charcoal-500' },
  CANCELLED: { label: 'Cancelled', className: 'bg-critical/10 text-critical' }
};

function StatusBadge({ status }: { status: PermitToWork['status'] }) {
  const { label, className } = STATUS_BADGE[status] ?? STATUS_BADGE.PENDING;
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>{label}</span>;
}

export function PermitToWorkPage() {
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const canManage = MANAGEMENT_ROLES.includes(activeRole as typeof MANAGEMENT_ROLES[number]);

  const [permitNumber, setPermitNumber] = useState('');
  const [workDescription, setWorkDescription] = useState('');
  const [location, setLocation] = useState('');
  const [siteId, setSiteId] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [hazardsRaw, setHazardsRaw] = useState('');
  const [precautionsRaw, setPrecautionsRaw] = useState('');
  const [editingId, setEditingId] = useState<UUID | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: permits, loading: permitsLoading, refetch } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listPermitsToWork(activeCompanyId);
  }, [activeCompanyId]);

  const { data: sites } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listSites(activeCompanyId);
  }, [activeCompanyId]);

  const activeSites = (sites ?? []).filter((s) => s.is_active);
  const siteLabel = new Map((sites ?? []).map((s) => [String(s.id), s.name]));

  function generatePermitNumber(): string {
    return `PTW-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
  }

  function beginEdit(p: PermitToWork) {
    setEditingId(p.id as UUID);
    setPermitNumber(p.permit_number ?? '');
    setWorkDescription(p.work_description);
    setLocation(p.location ?? '');
    setSiteId(p.site_id ? String(p.site_id) : '');
    setValidFrom(p.valid_from ? p.valid_from.slice(0, 10) : '');
    setValidTo(p.valid_to ? p.valid_to.slice(0, 10) : '');
    setHazardsRaw(Array.isArray(p.hazards) ? p.hazards.join(', ') : '');
    setPrecautionsRaw(Array.isArray(p.precautions) ? p.precautions.join(', ') : '');
    setError(null);
    setSuccess(null);
  }

  function resetForm() {
    setEditingId(null);
    setPermitNumber('');
    setWorkDescription('');
    setLocation('');
    setSiteId('');
    setValidFrom('');
    setValidTo('');
    setHazardsRaw('');
    setPrecautionsRaw('');
    setError(null);
  }

  async function onSave() {
    if (!activeCompanyId || !user?.id || !workDescription.trim()) {
      setError('Work description is required.');
      return;
    }

    // Date validation: validFrom must be <= validTo when both are set
    if (validFrom && validTo && validFrom > validTo) {
      setError('"Valid from" date must not be after "Valid to" date.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    const hazards = hazardsRaw.split(',').map((s) => s.trim()).filter(Boolean);
    const precautions = precautionsRaw.split(',').map((s) => s.trim()).filter(Boolean);
    // Auto-generate permit number if blank
    const resolvedPermitNumber = permitNumber.trim() || generatePermitNumber();
    try {
      if (editingId) {
        await updatePermitToWork({
          companyId: activeCompanyId,
          permitId: editingId,
          patch: {
            permit_number: resolvedPermitNumber,
            work_description: workDescription.trim(),
            location: location.trim() || null,
            site_id: (siteId || null) as UUID | null,
            valid_from: validFrom || null,
            valid_to: validTo || null,
            hazards,
            precautions
          },
          actorUserId: user.id as UUID
        });
        setSuccess('Permit updated.');
      } else {
        await createPermitToWork({
          companyId: activeCompanyId,
          permitNumber: resolvedPermitNumber,
          workDescription: workDescription.trim(),
          location: location.trim() || null,
          siteId: (siteId || null) as UUID | null,
          requestedByUserId: user.id as UUID,
          validFrom: validFrom || null,
          validTo: validTo || null,
          hazards,
          precautions,
          actorUserId: user.id as UUID
        });
        setSuccess('Permit created.');
      }
      resetForm();
      await refetch();
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to save permit. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  async function onApprove(p: PermitToWork) {
    if (!activeCompanyId || !user?.id) return;
    // State machine guard: must be PENDING to approve
    if (p.status !== 'PENDING') {
      setError(`Cannot approve a permit with status "${p.status}". Only PENDING permits can be approved.`);
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await updatePermitToWork({
        companyId: activeCompanyId,
        permitId: p.id as UUID,
        patch: { status: 'APPROVED', approved_by_user_id: user.id as UUID },
        actorUserId: user.id as UUID
      });
      setSuccess('Permit approved.');
      await refetch();
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to approve permit.'));
    }
  }

  async function onClose(p: PermitToWork) {
    if (!activeCompanyId || !user?.id) return;
    // State machine guard: must be APPROVED or ACTIVE to close
    if (p.status !== 'APPROVED' && p.status !== 'ACTIVE') {
      setError(`Cannot close a permit with status "${p.status}". Only APPROVED or ACTIVE permits can be closed.`);
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await updatePermitToWork({
        companyId: activeCompanyId,
        permitId: p.id as UUID,
        patch: { status: 'CLOSED' },
        actorUserId: user.id as UUID
      });
      setSuccess('Permit closed.');
      await refetch();
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to close permit.'));
    }
  }

  async function onCancel(p: PermitToWork) {
    if (!activeCompanyId || !user?.id) return;
    if (!window.confirm(`Cancel permit "${p.permit_number ?? p.work_description}"? This cannot be undone.`)) return;
    setError(null);
    setSuccess(null);
    try {
      await updatePermitToWork({
        companyId: activeCompanyId,
        permitId: p.id as UUID,
        patch: { status: 'CANCELLED' },
        actorUserId: user.id as UUID
      });
      setSuccess('Permit cancelled.');
      await refetch();
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to cancel permit.'));
    }
  }

  async function onDelete(p: PermitToWork) {
    if (!activeCompanyId || !user?.id) return;
    if (!window.confirm(`Delete permit "${p.work_description}"? This cannot be undone.`)) return;
    setError(null);
    setSuccess(null);
    try {
      await deletePermitToWork({ companyId: activeCompanyId, permitId: p.id as UUID, actorUserId: user.id as UUID });
      setSuccess('Permit deleted.');
      if (editingId === (p.id as UUID)) resetForm();
      await refetch();
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to delete permit.'));
    }
  }

  const TERMINAL_STATUSES: Array<PermitToWork['status']> = ['CLOSED', 'CANCELLED'];

  return (
    <Layout title="Permit to Work">
      <div className="space-y-4">
        {error && <div className="bg-critical/10 border border-critical/30 rounded-xl p-3 text-sm text-critical">{error}</div>}
        {success && <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700">{success}</div>}

        {canManage && (
          <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
            <h3 className="font-semibold">{editingId ? 'Edit permit' : 'New permit to work'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Permit number (auto-generated if blank)</span>
                <input className="w-full border border-surface-300 rounded-lg px-3 py-2" value={permitNumber} onChange={(e) => setPermitNumber(e.target.value)} placeholder="e.g. PTW-20260614-1234" />
              </label>
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Site (optional)</span>
                <select className="w-full border border-surface-300 rounded-lg px-3 py-2" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                  <option value="">— No site —</option>
                  {activeSites.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                </select>
              </label>
              <label className="text-sm md:col-span-2">
                <span className="block text-xs text-charcoal-500 mb-1">Work description *</span>
                <textarea rows={2} className="w-full border border-surface-300 rounded-lg px-3 py-2 resize-none" value={workDescription} onChange={(e) => setWorkDescription(e.target.value)} placeholder="Describe the work to be performed..." />
              </label>
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Location</span>
                <input className="w-full border border-surface-300 rounded-lg px-3 py-2" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Workshop floor, Zone A" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm">
                  <span className="block text-xs text-charcoal-500 mb-1">Valid from</span>
                  <input type="date" className="w-full border border-surface-300 rounded-lg px-3 py-2" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
                </label>
                <label className="text-sm">
                  <span className="block text-xs text-charcoal-500 mb-1">Valid to</span>
                  <input type="date" className="w-full border border-surface-300 rounded-lg px-3 py-2" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
                </label>
              </div>
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Hazards (comma-separated)</span>
                <input className="w-full border border-surface-300 rounded-lg px-3 py-2" value={hazardsRaw} onChange={(e) => setHazardsRaw(e.target.value)} placeholder="Electrical, Chemical, Height, ..." />
              </label>
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Precautions (comma-separated)</span>
                <input className="w-full border border-surface-300 rounded-lg px-3 py-2" value={precautionsRaw} onChange={(e) => setPrecautionsRaw(e.target.value)} placeholder="PPE required, Isolate power, ..." />
              </label>
            </div>
            <div className="flex gap-2">
              <button className="px-4 py-2 rounded-lg bg-teal text-white text-sm disabled:opacity-60" onClick={() => void onSave()} disabled={saving || !workDescription.trim()}>
                {saving ? 'Saving...' : editingId ? 'Update' : 'Create permit'}
              </button>
              {editingId && <button className="px-4 py-2 rounded-lg border border-surface-300 text-sm" onClick={resetForm}>Cancel</button>}
            </div>
          </div>
        )}

        {/* Loading indicator while permits fetch */}
        {permitsLoading && (
          <div className="bg-white border border-surface-300 rounded-xl p-6 text-center text-sm text-charcoal-500">
            Loading permits…
          </div>
        )}

        {!permitsLoading && (
          <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
            <div className="px-4 py-3 border-b border-surface-200">
              <h3 className="font-semibold">Permits to work ({(permits ?? []).length})</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-surface-100">
                <tr>
                  <th className="text-left px-4 py-2">Permit #</th>
                  <th className="text-left px-4 py-2">Work description</th>
                  <th className="text-left px-4 py-2">Location</th>
                  <th className="text-left px-4 py-2">Valid from</th>
                  <th className="text-left px-4 py-2">Valid to</th>
                  <th className="text-left px-4 py-2">Status</th>
                  {canManage && <th className="text-left px-4 py-2">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {(permits ?? []).length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-6 text-charcoal-500 text-center">No permits to work. Create your first permit.</td></tr>
                )}
                {(permits ?? []).map((p) => (
                  <tr key={p.id} className="border-t border-surface-100">
                    <td className="px-4 py-2 text-charcoal-500">{p.permit_number ?? '-'}</td>
                    <td className="px-4 py-2 font-medium max-w-xs truncate">{p.work_description}</td>
                    <td className="px-4 py-2 text-charcoal-500">{p.location ?? (p.site_id ? (siteLabel.get(String(p.site_id)) ?? '-') : '-')}</td>
                    <td className="px-4 py-2 text-charcoal-500">{p.valid_from ? p.valid_from.slice(0, 10) : '-'}</td>
                    <td className="px-4 py-2 text-charcoal-500">{p.valid_to ? p.valid_to.slice(0, 10) : '-'}</td>
                    <td className="px-4 py-2"><StatusBadge status={p.status} /></td>
                    {canManage && (
                      <td className="px-4 py-2">
                        <div className="flex gap-3 flex-wrap">
                          {!TERMINAL_STATUSES.includes(p.status) && (
                            <button className="text-teal hover:underline" onClick={() => beginEdit(p)}>Edit</button>
                          )}
                          {p.status === 'PENDING' && (
                            <button className="text-blue-600 hover:underline" onClick={() => void onApprove(p)}>Approve</button>
                          )}
                          {(p.status === 'APPROVED' || p.status === 'ACTIVE') && (
                            <button className="text-charcoal-600 hover:underline" onClick={() => void onClose(p)}>Close</button>
                          )}
                          {!TERMINAL_STATUSES.includes(p.status) && (
                            <button className="text-amber-600 hover:underline" onClick={() => void onCancel(p)}>Cancel</button>
                          )}
                          <button className="text-critical hover:underline" onClick={() => void onDelete(p)}>Delete</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
