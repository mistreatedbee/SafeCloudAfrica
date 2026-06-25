import { useState } from 'react';
import { useUser } from '@insforge/react';
import { Layout } from '../../components/layout/Layout';
import { HrSectionNav } from './HrSectionNav';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { listDepartments, createDepartment, updateDepartment, deleteDepartment } from '../../api/services/departmentsService';
import { listSites } from '../../api/services/sitesService';
import { listHrEmployees } from '../../api/services/hrService';
import type { UUID } from '../../api/models/core';
import { toUserFacingError } from '../../utils/userFacingMessage';
import type { Department } from '../../api/models/entities';
import { HrExportMenu } from '../../components/hr/HrExportMenu';

export function HrDepartmentsPage() {
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const canManage = ['owner', 'admin', 'manager'].includes(activeRole ?? '');

  const [name, setName] = useState('');
  const [siteId, setSiteId] = useState('');
  const [editingId, setEditingId] = useState<UUID | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: departments, loading: departmentsLoading, refetch } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listDepartments(activeCompanyId);
  }, [activeCompanyId]);

  const { data: sites } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listSites(activeCompanyId);
  }, [activeCompanyId]);

  const { data: employees } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listHrEmployees(activeCompanyId);
  }, [activeCompanyId]);

  const siteLabel = new Map((sites ?? []).map((s) => [String(s.id), s.name]));

  function beginEdit(dept: Department) {
    setEditingId(dept.id as UUID);
    setName(dept.name);
    setSiteId(dept.site_id ? String(dept.site_id) : '');
    setError(null);
    setSuccess(null);
  }

  function resetForm() {
    setEditingId(null);
    setName('');
    setSiteId('');
    setError(null);
  }

  async function onSave() {
    if (!activeCompanyId || !user?.id || !name.trim()) {
      setError('Department name is required.');
      return;
    }
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      if (editingId) {
        await updateDepartment({
          companyId: activeCompanyId,
          departmentId: editingId,
          patch: { name: name.trim(), site_id: (siteId || null) as UUID | null },
          actorUserId: user.id as UUID
        });
        setSuccess('Department updated.');
      } else {
        await createDepartment({
          companyId: activeCompanyId,
          name: name.trim(),
          siteId: (siteId || null) as UUID | null,
          actorUserId: user.id as UUID
        });
        setSuccess('Department created.');
      }
      await refetch();
      resetForm();
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to save department right now. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  async function onArchive(dept: Department) {
    if (!activeCompanyId || !user?.id) return;
    setError(null);
    setSuccess(null);
    try {
      await updateDepartment({
        companyId: activeCompanyId,
        departmentId: dept.id as UUID,
        patch: { is_active: !dept.is_active },
        actorUserId: user.id as UUID
      });
      setSuccess(dept.is_active ? 'Department archived.' : 'Department restored.');
      await refetch();
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to update department status right now.'));
    }
  }

  async function onDelete(dept: Department) {
    if (!activeCompanyId || !user?.id) return;
    const assigned = (employees ?? []).filter(
      (e) => String(e.department_id) === String(dept.id) &&
        e.employment_status !== 'TERMINATED' && e.employment_status !== 'ARCHIVED'
    );
    if (assigned.length > 0) {
      setError(`Cannot delete "${dept.name}" — it has ${assigned.length} active employee${assigned.length === 1 ? '' : 's'} assigned to it.`);
      return;
    }
    if (!window.confirm(`Delete department "${dept.name}"? This cannot be undone.`)) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteDepartment({ companyId: activeCompanyId, departmentId: dept.id as UUID, actorUserId: user.id as UUID });
      setSuccess('Department deleted.');
      if (editingId === (dept.id as UUID)) resetForm();
      await refetch();
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to delete department right now. It may be in use.'));
    }
  }

  const [searchQuery, setSearchQuery] = useState('');
  const [filterSiteId, setFilterSiteId] = useState('');
  const filtersActiveCount = [searchQuery, filterSiteId].filter(Boolean).length;
  const matchesFilters = (dept: Department) => {
    const q = searchQuery.trim().toLowerCase();
    if (q && !dept.name.toLowerCase().includes(q)) return false;
    if (filterSiteId && String(dept.site_id ?? '') !== filterSiteId) return false;
    return true;
  };
  const active = (departments ?? []).filter((d) => d.is_active && matchesFilters(d));
  const archived = (departments ?? []).filter((d) => !d.is_active && matchesFilters(d));

  return (
    <Layout title="Department Management">
      <div className="space-y-4">
        <HrSectionNav />
        {error && <div className="bg-critical/10 border border-critical/30 rounded-xl p-3 text-sm text-critical">{error}</div>}
        {success && <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700">{success}</div>}

        {canManage && (
          <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
            <h3 className="font-semibold">{editingId ? 'Edit department' : 'Add new department'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Department name *</span>
                <input className="w-full border border-surface-300 rounded-lg px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Engineering, Finance" />
              </label>
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Site (optional)</span>
                <select className="w-full border border-surface-300 rounded-lg px-3 py-2" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                  <option value="">— No site —</option>
                  {(sites ?? []).filter((s) => s.is_active).map((s) => (
                    <option key={s.id} value={String(s.id)}>{s.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex gap-2">
              <button className="px-4 py-2 rounded-lg bg-teal text-white text-sm disabled:opacity-60" onClick={() => void onSave()} disabled={saving || !name.trim()}>
                {saving ? 'Saving...' : editingId ? 'Update department' : 'Add department'}
              </button>
              {editingId && (
                <button className="px-4 py-2 rounded-lg border border-surface-300 text-sm" onClick={resetForm}>
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}

        <div className="bg-white border border-surface-300 rounded-xl p-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block text-xs text-charcoal-500 mb-1">Search</span>
            <input
              className="w-56 border border-surface-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Department name"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </label>
          {(sites ?? []).length > 0 && (
            <label className="text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Site</span>
              <select className="border border-surface-300 rounded-lg px-3 py-2 text-sm" value={filterSiteId} onChange={(e) => setFilterSiteId(e.target.value)}>
                <option value="">All</option>
                {(sites ?? []).map((s) => <option key={String(s.id)} value={String(s.id)}>{s.name}</option>)}
              </select>
            </label>
          )}
          {filtersActiveCount > 0 && (
            <div className="flex items-center gap-2 text-xs text-charcoal-500">
              <span>{filtersActiveCount} filter{filtersActiveCount === 1 ? '' : 's'} active</span>
              <button type="button" className="text-teal underline" onClick={() => { setSearchQuery(''); setFilterSiteId(''); }}>Clear filters</button>
            </div>
          )}
          <HrExportMenu
            moduleName="Departments"
            columns={[
              { key: 'name', label: 'Department Name' },
              { key: 'site', label: 'Site' },
              { key: 'is_active', label: 'Active' }
            ]}
            rows={[...active, ...archived].map((dept) => ({
              name: dept.name,
              site: dept.site_id ? (siteLabel.get(String(dept.site_id)) ?? '') : '',
              is_active: dept.is_active ? 'Yes' : 'No'
            }))}
          />
        </div>

        <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
          <div className="px-4 py-3 border-b border-surface-200">
            <h3 className="font-semibold">Active departments ({active.length})</h3>
          </div>
          {departmentsLoading ? (
            <div className="flex justify-center py-10"><LoadingSpinner /></div>
          ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-100">
              <tr>
                <th className="text-left px-4 py-2">Department name</th>
                <th className="text-left px-4 py-2">Site</th>
                {canManage && <th className="text-left px-4 py-2">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {active.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-4 text-charcoal-500 text-center">No departments yet. Create your first department.</td></tr>
              )}
              {active.map((dept) => (
                <tr key={dept.id} className="border-t border-surface-100">
                  <td className="px-4 py-2 font-medium">{dept.name}</td>
                  <td className="px-4 py-2 text-charcoal-500">{dept.site_id ? (siteLabel.get(String(dept.site_id)) ?? '-') : '-'}</td>
                  {canManage && (
                    <td className="px-4 py-2">
                      <div className="flex gap-3">
                        <button className="text-teal hover:underline" onClick={() => beginEdit(dept)}>Edit</button>
                        <button className="text-charcoal-600 hover:underline" onClick={() => void onArchive(dept)}>Archive</button>
                        <button className="text-critical hover:underline" onClick={() => void onDelete(dept)}>Delete</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>

        {archived.length > 0 && (
          <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
            <div className="px-4 py-3 border-b border-surface-200">
              <h3 className="font-semibold text-charcoal-500">Archived departments ({archived.length})</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-surface-100">
                <tr>
                  <th className="text-left px-4 py-2">Department name</th>
                  <th className="text-left px-4 py-2">Site</th>
                  {canManage && <th className="text-left px-4 py-2">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {archived.map((dept) => (
                  <tr key={dept.id} className="border-t border-surface-100 opacity-60">
                    <td className="px-4 py-2">{dept.name}</td>
                    <td className="px-4 py-2">{dept.site_id ? (siteLabel.get(String(dept.site_id)) ?? '-') : '-'}</td>
                    {canManage && (
                      <td className="px-4 py-2">
                        <div className="flex gap-3">
                          <button className="text-teal hover:underline" onClick={() => void onArchive(dept)}>Restore</button>
                          <button className="text-critical hover:underline" onClick={() => void onDelete(dept)}>Delete</button>
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
