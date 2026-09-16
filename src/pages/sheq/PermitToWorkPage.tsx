import { Fragment, useEffect, useMemo, useState } from 'react';
import { useUser } from '@insforge/react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import {
  listPermitsToWork,
  createPermitToWork,
  updatePermitToWork,
  deletePermitToWork,
  approvePermitToWork,
  rejectPermitToWork,
  suspendPermitToWork,
  closePermitToWork,
  type PermitToWork,
  type PermitToWorkStatus
} from '../../api/services/permitToWorkService';
import { listSites } from '../../api/services/sitesService';
import { listUserProfiles } from '../../api/services/profilesService';
import { listHrEmployees } from '../../api/services/hrService';
import type { UUID } from '../../api/models/core';
import { toUserFacingError } from '../../utils/userFacingMessage';
import { MANAGEMENT_ROLES } from '../../constants/roles';
import { PERMIT_TYPE_LABELS, PERMIT_TYPE_OPTIONS, type PermitType } from '../../api/constants/permitToWork';

const STATUS_BADGE: Record<PermitToWorkStatus, { label: string; className: string }> = {
  PENDING: { label: 'Awaiting approval', className: 'bg-amber-100 text-amber-800' },
  APPROVED: { label: 'Approved', className: 'bg-blue-100 text-blue-800' },
  ACTIVE: { label: 'Active', className: 'bg-emerald-100 text-emerald-800' },
  SUSPENDED: { label: 'Suspended', className: 'bg-orange-100 text-orange-800' },
  REJECTED: { label: 'Rejected', className: 'bg-critical/10 text-critical' },
  CLOSED: { label: 'Closed', className: 'bg-surface-200 text-charcoal-600' },
  CANCELLED: { label: 'Cancelled', className: 'bg-surface-200 text-charcoal-500' }
};

const TERMINAL_STATUSES: PermitToWorkStatus[] = ['CLOSED', 'CANCELLED', 'REJECTED'];

function StatusBadge({ status }: { status: PermitToWorkStatus }) {
  const { label, className } = STATUS_BADGE[status] ?? STATUS_BADGE.PENDING;
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>{label}</span>;
}

function profileLabel(profiles: Map<string, string>, userId: string | null | undefined): string {
  if (!userId) return '—';
  return profiles.get(userId) ?? `${userId.slice(0, 8)}…`;
}

export function PermitToWorkPage() {
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const canManage = MANAGEMENT_ROLES.includes(activeRole as (typeof MANAGEMENT_ROLES)[number]);

  const [permitNumber, setPermitNumber] = useState('');
  const [permitType, setPermitType] = useState<PermitType | ''>('');
  const [workDescription, setWorkDescription] = useState('');
  const [mandatoryRequirements, setMandatoryRequirements] = useState('');
  const [location, setLocation] = useState('');
  const [siteId, setSiteId] = useState('');
  const [requestedByUserId, setRequestedByUserId] = useState('');
  const [approvedByUserId, setApprovedByUserId] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [hazardsRaw, setHazardsRaw] = useState('');
  const [precautionsRaw, setPrecautionsRaw] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | PermitToWorkStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | PermitType>('all');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');
  const [responsibleFilter, setResponsibleFilter] = useState<'all' | UUID>('all');
  const [editingId, setEditingId] = useState<UUID | null>(null);
  const [workflowPermitId, setWorkflowPermitId] = useState<UUID | null>(null);
  const [workflowMode, setWorkflowMode] = useState<'review' | 'close'>('review');
  const [workflowComment, setWorkflowComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [workflowSaving, setWorkflowSaving] = useState(false);

  const { data: permits, loading: permitsLoading, refetch } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listPermitsToWork(activeCompanyId);
  }, [activeCompanyId]);

  const { data: sites } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listSites(activeCompanyId);
  }, [activeCompanyId]);

  const { data: profiles } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listUserProfiles(activeCompanyId);
  }, [activeCompanyId]);

  const { data: hrEmployees } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listHrEmployees(activeCompanyId);
  }, [activeCompanyId]);

  const profileMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of profiles ?? []) {
      const label = [p.full_name, p.email].filter(Boolean).join(' • ') || p.user_id;
      map.set(p.user_id, label);
    }
    return map;
  }, [profiles]);

  const hrEmployeeOptions = useMemo(() => {
    return (hrEmployees ?? [])
      .filter((employee) => !!employee.user_id)
      .map((employee) => {
        const name = `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim() || employee.email || employee.employee_no;
        return {
          userId: employee.user_id as UUID,
          label: employee.employee_no ? `${name} (${employee.employee_no})` : name
        };
      });
  }, [hrEmployees]);

  const activeSites = (sites ?? []).filter((s) => s.is_active);

  useEffect(() => {
    if (user?.id && !requestedByUserId) {
      setRequestedByUserId(user.id);
    }
  }, [user?.id, requestedByUserId]);

  function generatePermitNumber(): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const day = now.getUTCDate();
    const sequence = ((permits ?? []).filter((p) => p.permit_number && /^PTW-\d{8}-\d{4}$/.test(p.permit_number)).length % 9000) + 1;
    return `PTW-${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}-${String(sequence).padStart(4, '0')}`;
  }

  function resetForm() {
    setEditingId(null);
    setPermitNumber('');
    setPermitType('');
    setWorkDescription('');
    setMandatoryRequirements('');
    setLocation('');
    setSiteId('');
    setRequestedByUserId(user?.id ?? '');
    setApprovedByUserId('');
    setValidFrom('');
    setValidTo('');
    setHazardsRaw('');
    setPrecautionsRaw('');
    setError(null);
  }

  function beginEdit(p: PermitToWork) {
    setEditingId(p.id as UUID);
    setPermitNumber(p.permit_number ?? '');
    setPermitType((p.permit_type as PermitType) ?? '');
    setWorkDescription(p.work_description);
    setMandatoryRequirements(p.mandatory_requirements ?? '');
    setLocation(p.location ?? '');
    setSiteId(p.site_id ? String(p.site_id) : '');
    setRequestedByUserId(p.requested_by_user_id ? String(p.requested_by_user_id) : '');
    setApprovedByUserId(p.approved_by_user_id ? String(p.approved_by_user_id) : '');
    setValidFrom(p.valid_from ? p.valid_from.slice(0, 10) : '');
    setValidTo(p.valid_to ? p.valid_to.slice(0, 10) : '');
    setHazardsRaw(Array.isArray(p.hazards) ? p.hazards.join(', ') : '');
    setPrecautionsRaw(Array.isArray(p.precautions) ? p.precautions.join(', ') : '');
    setError(null);
    setSuccess(null);
  }

  function canApprovePermit(p: PermitToWork): boolean {
    if (!user?.id) return false;
    if (canManage) return true;
    return p.approved_by_user_id === user.id;
  }

  function canEditPermit(p: PermitToWork): boolean {
    if (TERMINAL_STATUSES.includes(p.status)) return false;
    if (canManage) return true;
    return p.requested_by_user_id === user?.id && p.status === 'PENDING';
  }

  function canClosePermit(p: PermitToWork): boolean {
    if (!user?.id) return false;
    if (p.status !== 'APPROVED' && p.status !== 'ACTIVE') return false;
    return canManage || p.approved_by_user_id === user.id || p.requested_by_user_id === user.id;
  }

  async function onSave() {
    if (!activeCompanyId || !user?.id || !workDescription.trim()) {
      setError('Work description is required.');
      return;
    }
    if (!permitType) {
      setError('Permit type is required.');
      return;
    }
    if (!approvedByUserId) {
      setError('Person to approve permit is required.');
      return;
    }
    const validFromDate = validFrom ? new Date(validFrom) : null;
    const validToDate = validTo ? new Date(validTo) : null;
    if (validFromDate && validToDate && validFromDate.getTime() > validToDate.getTime()) {
      setError('"Valid from" date must not be after "Valid to" date.');
      return;
    }

    if (validFrom && validTo && validFromDate && validToDate && validFromDate.getTime() === validToDate.getTime()) {
      setError('"Valid from" and "Valid to" must be different times when both are provided.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    const hazards = hazardsRaw.split(',').map((s) => s.trim()).filter(Boolean);
    const precautions = precautionsRaw.split(',').map((s) => s.trim()).filter(Boolean);
    const resolvedPermitNumber = permitNumber.trim() || generatePermitNumber();
    const resolvedRequestedBy = (requestedByUserId || user.id) as UUID;
    const validFromValue = validFrom ? new Date(validFrom).toISOString() : null;
    const validToValue = validTo ? new Date(validTo).toISOString() : null;

    try {
      if (editingId) {
        await updatePermitToWork({
          companyId: activeCompanyId,
          permitId: editingId,
          patch: {
            permit_number: resolvedPermitNumber,
            permit_type: permitType,
            work_description: workDescription.trim(),
            mandatory_requirements: mandatoryRequirements.trim() || null,
            location: location.trim() || null,
            site_id: (siteId || null) as UUID | null,
            approved_by_user_id: approvedByUserId as UUID,
            valid_from: validFromValue,
            valid_to: validToValue,
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
          permitType,
          workDescription: workDescription.trim(),
          mandatoryRequirements: mandatoryRequirements.trim() || null,
          location: location.trim() || null,
          siteId: (siteId || null) as UUID | null,
          requestedByUserId: resolvedRequestedBy,
          approvedByUserId: approvedByUserId as UUID,
          validFrom: validFromValue,
          validTo: validToValue,
          hazards,
          precautions,
          actorUserId: user.id as UUID
        });
        setSuccess('Permit submitted for approval.');
      }
      resetForm();
      await refetch();
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to save permit. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  async function runWorkflow(
    action: 'approve' | 'reject' | 'suspend' | 'close',
    permit: PermitToWork
  ) {
    if (!activeCompanyId || !user?.id) return;
    setWorkflowSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (action === 'approve') {
        if (permit.status !== 'PENDING' && permit.status !== 'SUSPENDED') {
          throw new Error('Only permits awaiting approval or suspended can be approved.');
        }
        await approvePermitToWork({
          companyId: activeCompanyId,
          permitId: permit.id as UUID,
          actorUserId: user.id as UUID,
          comment: workflowComment
        });
        setSuccess('Permit approved.');
      } else if (action === 'reject') {
        if (!workflowComment.trim()) throw new Error('Rejection comment is required.');
        await rejectPermitToWork({
          companyId: activeCompanyId,
          permitId: permit.id as UUID,
          actorUserId: user.id as UUID,
          comment: workflowComment
        });
        setSuccess('Permit rejected.');
      } else if (action === 'suspend') {
        if (!workflowComment.trim()) throw new Error('Suspension comment is required.');
        await suspendPermitToWork({
          companyId: activeCompanyId,
          permitId: permit.id as UUID,
          actorUserId: user.id as UUID,
          comment: workflowComment
        });
        setSuccess('Permit suspended.');
      } else {
        await closePermitToWork({
          companyId: activeCompanyId,
          permitId: permit.id as UUID,
          actorUserId: user.id as UUID,
          comment: workflowComment
        });
        setSuccess('Permit closed.');
      }
      setWorkflowPermitId(null);
      setWorkflowComment('');
      await refetch();
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to update permit status.'));
    } finally {
      setWorkflowSaving(false);
    }
  }

  async function onCancel(p: PermitToWork) {
    if (!activeCompanyId || !user?.id) return;
    if (!window.confirm(`Cancel permit "${p.permit_number ?? p.work_description}"?`)) return;
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
    if (!activeCompanyId || !user?.id || !canManage) return;
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

  const filteredPermits = useMemo(() => {
    return (permits ?? []).filter((permit) => {
      if (statusFilter !== 'all' && permit.status !== statusFilter) return false;
      if (typeFilter !== 'all' && permit.permit_type !== typeFilter) return false;
      if (responsibleFilter !== 'all') {
        const matchesResponsible = permit.requested_by_user_id === responsibleFilter || permit.approved_by_user_id === responsibleFilter;
        if (!matchesResponsible) return false;
      }
      if (dateFromFilter && permit.valid_from && new Date(permit.valid_from).getTime() < new Date(dateFromFilter + 'T00:00:00.000Z').getTime()) {
        return false;
      }
      if (dateToFilter && permit.valid_to && new Date(permit.valid_to).getTime() > new Date(dateToFilter + 'T23:59:59.999Z').getTime()) {
        return false;
      }
      if (dateFromFilter && !permit.valid_from) return false;
      if (dateToFilter && !permit.valid_to) return false;
      return true;
    });
  }, [permits, statusFilter, typeFilter, dateFromFilter, dateToFilter, responsibleFilter]);

  const showForm = Boolean(user?.id);

  return (
    <Layout title="Permit to Work">
      <div className="space-y-4">
        {error && <div className="bg-critical/10 border border-critical/30 rounded-xl p-3 text-sm text-critical">{error}</div>}
        {success && <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700">{success}</div>}

        {showForm && (
          <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
            <h3 className="font-semibold">{editingId ? 'Edit permit' : 'New permit to work'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Permit number (auto-generated if blank)</span>
                <input className="w-full border border-surface-300 rounded-lg px-3 py-2" value={permitNumber} onChange={(e) => setPermitNumber(e.target.value)} placeholder="e.g. PTW-20260812-1234" />
              </label>
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Permit type *</span>
                <select className="w-full border border-surface-300 rounded-lg px-3 py-2" value={permitType} onChange={(e) => setPermitType(e.target.value as PermitType)}>
                  <option value="">Select permit type…</option>
                  {PERMIT_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Person requesting permit approval *</span>
                <select
                  className="w-full border border-surface-300 rounded-lg px-3 py-2"
                  value={requestedByUserId || user?.id || ''}
                  onChange={(e) => setRequestedByUserId(e.target.value)}
                  disabled={!canManage && Boolean(user?.id)}
                >
                  {hrEmployeeOptions.map((employee) => (
                    <option key={employee.userId} value={employee.userId}>{employee.label}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Person to approve permit *</span>
                <select className="w-full border border-surface-300 rounded-lg px-3 py-2" value={approvedByUserId} onChange={(e) => setApprovedByUserId(e.target.value)}>
                  <option value="">Select approver…</option>
                  {hrEmployeeOptions.map((employee) => (
                    <option key={employee.userId} value={employee.userId}>{employee.label}</option>
                  ))}
                </select>
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
              <label className="text-sm md:col-span-2">
                <span className="block text-xs text-charcoal-500 mb-1">Mandatory requirements</span>
                <textarea rows={3} className="w-full border border-surface-300 rounded-lg px-3 py-2 resize-none" value={mandatoryRequirements} onChange={(e) => setMandatoryRequirements(e.target.value)} placeholder="List mandatory PPE, isolations, competencies, permits, gas tests, etc." />
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
              <button className="px-4 py-2 rounded-lg bg-teal text-white text-sm disabled:opacity-60" onClick={() => void onSave()} disabled={saving || !workDescription.trim() || !permitType || !approvedByUserId}>
                {saving ? 'Saving...' : editingId ? 'Update' : 'Submit for approval'}
              </button>
              {editingId && <button className="px-4 py-2 rounded-lg border border-surface-300 text-sm" onClick={resetForm}>Cancel</button>}
            </div>
          </div>
        )}

        {permitsLoading && (
          <div className="bg-white border border-surface-300 rounded-xl p-6 text-center text-sm text-charcoal-500">
            Loading permits…
          </div>
        )}

        {!permitsLoading && (
          <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
            <div className="px-4 py-3 border-b border-surface-200">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <h3 className="font-semibold">Permits to work ({filteredPermits.length})</h3>
                <div className="flex flex-wrap gap-2 text-sm">
                  <select value={statusFilter} onChange={(e) => setStatusFilter((e.target.value as 'all' | PermitToWorkStatus) || 'all')} className="px-3 py-2 border border-surface-300 rounded-lg">
                    <option value="all">All statuses</option>
                    {Object.keys(STATUS_BADGE).map((status) => <option key={status} value={status}>{STATUS_BADGE[status as PermitToWorkStatus].label}</option>)}
                  </select>
                  <select value={typeFilter} onChange={(e) => setTypeFilter((e.target.value as 'all' | PermitType) || 'all')} className="px-3 py-2 border border-surface-300 rounded-lg">
                    <option value="all">All types</option>
                    {PERMIT_TYPE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                  <input type="date" value={dateFromFilter} onChange={(e) => setDateFromFilter(e.target.value)} className="px-3 py-2 border border-surface-300 rounded-lg" placeholder="From" />
                  <input type="date" value={dateToFilter} onChange={(e) => setDateToFilter(e.target.value)} className="px-3 py-2 border border-surface-300 rounded-lg" placeholder="To" />
                  <select value={responsibleFilter} onChange={(e) => setResponsibleFilter((e.target.value || 'all') as 'all' | UUID)} className="px-3 py-2 border border-surface-300 rounded-lg min-w-[220px]">
                    <option value="all">All responsible persons</option>
                    {hrEmployeeOptions.map((employee) => <option key={employee.userId} value={employee.userId}>{employee.label}</option>)}
                  </select>
                  <button type="button" className="text-teal underline" onClick={() => { setStatusFilter('all'); setTypeFilter('all'); setDateFromFilter(''); setDateToFilter(''); setResponsibleFilter('all'); }}>Clear filters</button>
                </div>
              </div>
            </div>
            <table className="w-full text-sm min-w-[960px]">
              <thead className="bg-surface-100">
                <tr>
                  <th className="text-left px-4 py-2">Permit #</th>
                  <th className="text-left px-4 py-2">Type</th>
                  <th className="text-left px-4 py-2">Work description</th>
                  <th className="text-left px-4 py-2">Requested by</th>
                  <th className="text-left px-4 py-2">Approver</th>
                  <th className="text-left px-4 py-2">Valid from</th>
                  <th className="text-left px-4 py-2">Valid to</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-left px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPermits.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-6 text-charcoal-500 text-center">No permits match these filters.</td></tr>
                )}
                {filteredPermits.map((p) => (
                  <Fragment key={p.id}>
                    <tr className="border-t border-surface-100">
                      <td className="px-4 py-2 text-charcoal-500">{p.permit_number ?? '—'}</td>
                      <td className="px-4 py-2 text-charcoal-600">{p.permit_type ? PERMIT_TYPE_LABELS[p.permit_type] : '—'}</td>
                      <td className="px-4 py-2 font-medium max-w-xs">{p.work_description}</td>
                      <td className="px-4 py-2 text-charcoal-500">{profileLabel(profileMap, p.requested_by_user_id)}</td>
                      <td className="px-4 py-2 text-charcoal-500">{profileLabel(profileMap, p.approved_by_user_id)}</td>
                      <td className="px-4 py-2 text-charcoal-500">{p.valid_from ? p.valid_from.slice(0, 10) : '—'}</td>
                      <td className="px-4 py-2 text-charcoal-500">{p.valid_to ? p.valid_to.slice(0, 10) : '—'}</td>
                      <td className="px-4 py-2"><StatusBadge status={p.status} /></td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2 flex-wrap">
                          {canEditPermit(p) && <button className="text-teal hover:underline" onClick={() => beginEdit(p)}>Edit</button>}
                          {canApprovePermit(p) && (p.status === 'PENDING' || p.status === 'SUSPENDED') && (
                            <button className="text-blue-600 hover:underline" onClick={() => { setWorkflowPermitId(p.id as UUID); setWorkflowMode('review'); setWorkflowComment(''); }}>Review</button>
                          )}
                          {canClosePermit(p) && (
                            <button className="text-charcoal-600 hover:underline" onClick={() => { setWorkflowPermitId(p.id as UUID); setWorkflowMode('close'); setWorkflowComment(''); }}>Close permit</button>
                          )}
                          {canManage && !TERMINAL_STATUSES.includes(p.status) && (
                            <button className="text-amber-600 hover:underline" onClick={() => void onCancel(p)}>Cancel</button>
                          )}
                          {canManage && <button className="text-critical hover:underline" onClick={() => void onDelete(p)}>Delete</button>}
                        </div>
                      </td>
                    </tr>
                    {(p.mandatory_requirements || p.status_comment) && (
                      <tr key={`${p.id}-meta`} className="border-t border-surface-50 bg-surface-50/60">
                        <td colSpan={9} className="px-4 py-2 text-xs text-charcoal-600 space-y-1">
                          {p.mandatory_requirements && (
                            <p><span className="font-semibold">Mandatory requirements:</span> {p.mandatory_requirements}</p>
                          )}
                          {p.status_comment && (
                            <p>
                              <span className="font-semibold">
                                {p.status === 'SUSPENDED' ? 'Suspension comment' : p.status === 'REJECTED' ? 'Rejection comment' : p.status === 'APPROVED' ? 'Approval comment' : p.status === 'CLOSED' ? 'Closure comment' : 'Comment'}:
                              </span>{' '}
                              {p.status_comment}
                            </p>
                          )}
                          {p.status === 'CLOSED' && p.closed_at && (
                            <p className="text-charcoal-500">Closed {new Date(p.closed_at).toLocaleString('en-ZA')}</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {workflowPermitId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
            <div className="bg-white rounded-xl border border-surface-300 shadow-xl w-full max-w-md p-5 space-y-4">
              <h4 className="font-semibold text-charcoal">{workflowMode === 'close' ? 'Close permit' : 'Review permit'}</h4>
              <p className="text-sm text-charcoal-500">
                {workflowMode === 'close'
                  ? 'Optionally add a closure comment before closing this permit.'
                  : 'Add comments where required. Approvals may include optional comments; rejections and suspensions require a comment.'}
              </p>
              <textarea
                rows={3}
                className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm"
                value={workflowComment}
                onChange={(e) => setWorkflowComment(e.target.value)}
                placeholder="Comment (required for reject / suspend)"
              />
              <div className="flex flex-wrap gap-2 justify-end">
                <button type="button" className="px-3 py-2 rounded-lg border border-surface-300 text-sm" onClick={() => { setWorkflowPermitId(null); setWorkflowComment(''); }}>Cancel</button>
                {(() => {
                  const permit = (permits ?? []).find((row) => row.id === workflowPermitId);
                  if (!permit) return null;
                  if (workflowMode === 'close') {
                    return (
                      <button type="button" disabled={workflowSaving} className="px-3 py-2 rounded-lg bg-charcoal text-white text-sm disabled:opacity-60" onClick={() => void runWorkflow('close', permit)}>
                        {workflowSaving ? 'Closing…' : 'Close permit'}
                      </button>
                    );
                  }
                  return (
                    <>
                      <button type="button" disabled={workflowSaving} className="px-3 py-2 rounded-lg bg-orange-500 text-white text-sm disabled:opacity-60" onClick={() => void runWorkflow('suspend', permit)}>
                        Suspend
                      </button>
                      <button type="button" disabled={workflowSaving} className="px-3 py-2 rounded-lg bg-critical text-white text-sm disabled:opacity-60" onClick={() => void runWorkflow('reject', permit)}>
                        Reject
                      </button>
                      <button type="button" disabled={workflowSaving} className="px-3 py-2 rounded-lg bg-teal text-white text-sm disabled:opacity-60" onClick={() => void runWorkflow('approve', permit)}>
                        Approve
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
