import React, { useMemo, useState } from 'react';
import { PlusIcon, TrashIcon } from 'lucide-react';
import { useAsync } from '../../api/hooks/useAsync';
import type { Department, Site, UUID } from '../../api/models/entities';
import { createSite, deleteSite, listSites } from '../../api/services/sitesService';
import { createDepartment, deleteDepartment, listDepartments } from '../../api/services/departmentsService';

export function OrgStructureManager(props: {
  companyId: UUID;
  actorUserId: UUID;
  canManage: boolean;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [siteName, setSiteName] = useState('');
  const [siteAddress, setSiteAddress] = useState('');
  const [deptName, setDeptName] = useState('');
  const [deptSiteId, setDeptSiteId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: sites } = useAsync<Site[]>(async () => listSites(props.companyId), [props.companyId, refreshKey]);
  const { data: departments } = useAsync<Department[]>(async () => listDepartments(props.companyId), [props.companyId, refreshKey]);

  const activeSites = useMemo(() => (sites ?? []).filter((s) => s.is_active), [sites]);
  const activeDepartments = useMemo(() => (departments ?? []).filter((d) => d.is_active), [departments]);

  async function addSite() {
    if (!props.canManage) return;
    if (!siteName.trim()) return;
    setError(null);
    try {
      setBusy(true);
      await createSite({
        companyId: props.companyId,
        actorUserId: props.actorUserId,
        name: siteName.trim(),
        address: siteAddress.trim() || null
      });
      setSiteName('');
      setSiteAddress('');
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create site.');
    } finally {
      setBusy(false);
    }
  }

  async function addDepartment() {
    if (!props.canManage) return;
    if (!deptName.trim()) return;
    setError(null);
    try {
      setBusy(true);
      await createDepartment({
        companyId: props.companyId,
        actorUserId: props.actorUserId,
        name: deptName.trim(),
        siteId: deptSiteId ? (deptSiteId as any) : null
      });
      setDeptName('');
      setDeptSiteId('');
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create department.');
    } finally {
      setBusy(false);
    }
  }

  async function removeSite(siteId: UUID) {
    if (!props.canManage) return;
    if (!confirm('Delete this site? Departments linked to it will keep working (site link cleared).')) return;
    setError(null);
    try {
      setBusy(true);
      await deleteSite({ companyId: props.companyId, siteId, actorUserId: props.actorUserId });
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to delete site.');
    } finally {
      setBusy(false);
    }
  }

  async function removeDepartment(departmentId: UUID) {
    if (!props.canManage) return;
    if (!confirm('Delete this department?')) return;
    setError(null);
    try {
      setBusy(true);
      await deleteDepartment({ companyId: props.companyId, departmentId, actorUserId: props.actorUserId });
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to delete department.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
          <p className="text-sm font-semibold text-critical">Could not save</p>
          <p className="text-sm text-charcoal-600 mt-1">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-surface-200 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-charcoal">Sites</p>
            <span className="text-xs text-charcoal-500">{activeSites.length} active</span>
          </div>

          <div className="mt-3 flex flex-col gap-2">
            <input
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder="New site name (e.g. Head Office)"
              disabled={!props.canManage || busy}
              className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60"
            />
            <input
              value={siteAddress}
              onChange={(e) => setSiteAddress(e.target.value)}
              placeholder="Address (optional)"
              disabled={!props.canManage || busy}
              className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => void addSite()}
              disabled={!props.canManage || busy || !siteName.trim()}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60"
            >
              <PlusIcon className="w-4 h-4" />
              Add site
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {activeSites.length === 0 && <p className="text-sm text-charcoal-500">No sites yet.</p>}
            {activeSites.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-surface-200">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-charcoal truncate">{s.name}</p>
                  {s.address && <p className="text-xs text-charcoal-500 truncate">{s.address}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => void removeSite(s.id)}
                  disabled={!props.canManage || busy}
                  className="p-2 rounded-lg hover:bg-surface-100 text-critical disabled:opacity-60"
                  aria-label="Delete site"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-surface-200 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-charcoal">Departments</p>
            <span className="text-xs text-charcoal-500">{activeDepartments.length} active</span>
          </div>

          <div className="mt-3 flex flex-col gap-2">
            <input
              value={deptName}
              onChange={(e) => setDeptName(e.target.value)}
              placeholder="New department name (e.g. Operations)"
              disabled={!props.canManage || busy}
              className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60"
            />
            <select
              value={deptSiteId}
              onChange={(e) => setDeptSiteId(e.target.value)}
              disabled={!props.canManage || busy}
              className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60"
            >
              <option value="">Link to site (optional)</option>
              {activeSites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void addDepartment()}
              disabled={!props.canManage || busy || !deptName.trim()}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60"
            >
              <PlusIcon className="w-4 h-4" />
              Add department
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {activeDepartments.length === 0 && <p className="text-sm text-charcoal-500">No departments yet.</p>}
            {activeDepartments.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-surface-200">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-charcoal truncate">{d.name}</p>
                  <p className="text-xs text-charcoal-500 truncate">
                    Site: {d.site_id ? activeSites.find((s) => s.id === d.site_id)?.name ?? '—' : '—'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void removeDepartment(d.id)}
                  disabled={!props.canManage || busy}
                  className="p-2 rounded-lg hover:bg-surface-100 text-critical disabled:opacity-60"
                  aria-label="Delete department"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

