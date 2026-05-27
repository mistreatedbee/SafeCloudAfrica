import { useState } from 'react';
import { useUser } from '@insforge/react';
import { Layout } from '../../components/layout/Layout';
import { HrSectionNav } from './HrSectionNav';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { listSites, createSite, updateSite, deleteSite } from '../../api/services/sitesService';
import type { UUID } from '../../api/models/core';
import { toUserFacingError } from '../../utils/userFacingMessage';
import type { Site } from '../../api/models/entities';

export function HrSitesPage() {
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const canManage = ['owner', 'admin', 'manager'].includes(activeRole ?? '');

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [editingId, setEditingId] = useState<UUID | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: sites, refetch } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listSites(activeCompanyId);
  }, [activeCompanyId]);

  function beginEdit(site: Site) {
    setEditingId(site.id as UUID);
    setName(site.name);
    setAddress(site.address ?? '');
    setError(null);
    setSuccess(null);
  }

  function resetForm() {
    setEditingId(null);
    setName('');
    setAddress('');
    setError(null);
  }

  async function onSave() {
    if (!activeCompanyId || !user?.id || !name.trim()) {
      setError('Site name is required.');
      return;
    }
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      if (editingId) {
        await updateSite({ companyId: activeCompanyId, siteId: editingId, patch: { name: name.trim(), address: address.trim() || null }, actorUserId: user.id as UUID });
        setSuccess('Site updated.');
      } else {
        await createSite({ companyId: activeCompanyId, name: name.trim(), address: address.trim() || null, actorUserId: user.id as UUID });
        setSuccess('Site created.');
      }
      resetForm();
      await refetch();
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to save site right now. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  async function onArchive(site: Site) {
    if (!activeCompanyId || !user?.id) return;
    setError(null);
    setSuccess(null);
    try {
      await updateSite({ companyId: activeCompanyId, siteId: site.id as UUID, patch: { is_active: !site.is_active }, actorUserId: user.id as UUID });
      setSuccess(site.is_active ? 'Site archived.' : 'Site restored.');
      await refetch();
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to update site status right now.'));
    }
  }

  async function onDelete(site: Site) {
    if (!activeCompanyId || !user?.id) return;
    if (!window.confirm(`Delete site "${site.name}"? This cannot be undone.`)) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteSite({ companyId: activeCompanyId, siteId: site.id as UUID, actorUserId: user.id as UUID });
      setSuccess('Site deleted.');
      if (editingId === (site.id as UUID)) resetForm();
      await refetch();
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to delete site right now. It may be in use.'));
    }
  }

  const active = (sites ?? []).filter((s) => s.is_active);
  const archived = (sites ?? []).filter((s) => !s.is_active);

  return (
    <Layout title="Site Management">
      <div className="space-y-4">
        <HrSectionNav />
        {error && <div className="bg-critical/10 border border-critical/30 rounded-xl p-3 text-sm text-critical">{error}</div>}
        {success && <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700">{success}</div>}

        {canManage && (
          <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
            <h3 className="font-semibold">{editingId ? 'Edit site' : 'Add new site'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Site name *</span>
                <input className="w-full border border-surface-300 rounded-lg px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Head Office, Warehouse A" />
              </label>
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Address</span>
                <input className="w-full border border-surface-300 rounded-lg px-3 py-2" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Physical address (optional)" />
              </label>
            </div>
            <div className="flex gap-2">
              <button className="px-4 py-2 rounded-lg bg-teal text-white text-sm disabled:opacity-60" onClick={() => void onSave()} disabled={saving || !name.trim()}>
                {saving ? 'Saving...' : editingId ? 'Update site' : 'Add site'}
              </button>
              {editingId && (
                <button className="px-4 py-2 rounded-lg border border-surface-300 text-sm" onClick={resetForm}>
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}

        <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
          <div className="px-4 py-3 border-b border-surface-200">
            <h3 className="font-semibold">Active sites ({active.length})</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-surface-100">
              <tr>
                <th className="text-left px-4 py-2">Site name</th>
                <th className="text-left px-4 py-2">Address</th>
                {canManage && <th className="text-left px-4 py-2">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {active.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-4 text-charcoal-500 text-center">No active sites. Add one above.</td></tr>
              )}
              {active.map((site) => (
                <tr key={site.id} className="border-t border-surface-100">
                  <td className="px-4 py-2 font-medium">{site.name}</td>
                  <td className="px-4 py-2 text-charcoal-500">{site.address ?? '-'}</td>
                  {canManage && (
                    <td className="px-4 py-2">
                      <div className="flex gap-3">
                        <button className="text-teal hover:underline" onClick={() => beginEdit(site)}>Edit</button>
                        <button className="text-charcoal-600 hover:underline" onClick={() => void onArchive(site)}>Archive</button>
                        <button className="text-critical hover:underline" onClick={() => void onDelete(site)}>Delete</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {archived.length > 0 && (
          <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
            <div className="px-4 py-3 border-b border-surface-200">
              <h3 className="font-semibold text-charcoal-500">Archived sites ({archived.length})</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-surface-100">
                <tr>
                  <th className="text-left px-4 py-2">Site name</th>
                  <th className="text-left px-4 py-2">Address</th>
                  {canManage && <th className="text-left px-4 py-2">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {archived.map((site) => (
                  <tr key={site.id} className="border-t border-surface-100 opacity-60">
                    <td className="px-4 py-2">{site.name}</td>
                    <td className="px-4 py-2">{site.address ?? '-'}</td>
                    {canManage && (
                      <td className="px-4 py-2">
                        <div className="flex gap-3">
                          <button className="text-teal hover:underline" onClick={() => void onArchive(site)}>Restore</button>
                          <button className="text-critical hover:underline" onClick={() => void onDelete(site)}>Delete</button>
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
