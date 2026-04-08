import React, { useState } from 'react';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import { listKpiItems, createKpiItem, updateKpiItem, deleteKpiItem } from '../../api/services/kpiItemService';
import type { KPIItem, KpiImportance } from '../../api/models/entities';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { XIcon, BookMarkedIcon } from 'lucide-react';
import { ListEmptyState } from '../../components/ui/ListEmptyState';
import type { UUID } from '../../api/models/core';

export function KPILibraryPage() {
  const { activeCompanyId } = useTenant();
  const { user } = useUser();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<UUID | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [defaultImportance, setDefaultImportance] = useState<KpiImportance>('medium');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<UUID | null>(null);
  const [togglingId, setTogglingId] = useState<UUID | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: items, loading } = useAsync<KPIItem[]>(
    async () => {
      if (!activeCompanyId) return [];
      return listKpiItems({ organizationId: activeCompanyId, activeOnly: false });
    },
    [activeCompanyId, refreshKey]
  );

  function openCreate() {
    setEditingId(null);
    setTitle('');
    setDescription('');
    setDefaultImportance('medium');
    setModalOpen(true);
  }

  function openEdit(item: KPIItem) {
    setEditingId(item.kpi_item_id as unknown as UUID);
    setTitle(item.title ?? '');
    setDescription(item.description ?? '');
    setDefaultImportance((item.default_importance ?? 'medium') as KpiImportance);
    setModalOpen(true);
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCompanyId || !user?.id || !title.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await updateKpiItem(
          editingId,
          {
            title: title.trim(),
            description: description.trim() || null,
            default_importance: defaultImportance
          },
          activeCompanyId as unknown as UUID,
          user.id as unknown as UUID
        );
      } else {
        await createKpiItem(
          {
            organizationId: activeCompanyId,
            title: title.trim(),
            description: description.trim() || undefined,
            defaultImportance,
            createdBy: user.id
          },
          user.id
        );
      }
      setModalOpen(false);
      setEditingId(null);
      setRefreshKey((k) => k + 1);
    } finally {
      setSaving(false);
    }
  };

  async function onToggleActive(item: KPIItem) {
    if (!activeCompanyId || !user?.id) return;
    setTogglingId(item.kpi_item_id as any);
    try {
      await updateKpiItem(
        item.kpi_item_id as any,
        { active: !item.active },
        activeCompanyId as any,
        user.id as any
      );
      setRefreshKey((k) => k + 1);
    } finally {
      setTogglingId(null);
    }
  }

  async function onDelete(item: KPIItem) {
    if (!activeCompanyId || !user?.id) return;
    if (!window.confirm(`Delete KPI template "${item.title}"? This cannot be undone.`)) return;
    setDeletingId(item.kpi_item_id as any);
    try {
      await deleteKpiItem({
        itemId: item.kpi_item_id as any,
        organizationId: activeCompanyId as any,
        actorUserId: user.id as any
      });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete KPI template.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-charcoal">KPI library</h2>
        <button
          type="button"
          onClick={openCreate}
          className="px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600"
        >
          Add KPI template
        </button>
      </div>
      <p className="text-sm text-charcoal-500">
        Reusable KPI Questionnaire templates for KPI Assessment. You can also add custom questionnaires when creating an assessment.
      </p>

      {loading && (
        <div className="flex items-center gap-3 p-6">
          <LoadingSpinner size={20} />
          <span className="text-charcoal-500">Loading…</span>
        </div>
      )}

      {!loading && (items ?? []).length === 0 && (
        <ListEmptyState
          icon={BookMarkedIcon}
          title="No KPI questionnaire templates yet"
          description="Create reusable questionnaires for assessments, or add custom questions when you start a new assessment."
          primaryAction={{ kind: 'button', label: 'Add KPI template', onClick: openCreate }}
        />
      )}

      {!loading && (items ?? []).length > 0 && (
        <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-charcoal-500 border-b border-surface-200 bg-surface-50">
                <th className="py-3 px-4">KPI Questionnaire</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4">Default importance</th>
                <th className="py-3 px-4">Active</th>
                <th className="py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(items ?? []).map((item) => (
                <tr key={item.kpi_item_id} className="border-b border-surface-100 last:border-0">
                  <td className="py-3 px-4 font-medium text-charcoal">{item.title}</td>
                  <td className="py-3 px-4 text-charcoal-600">{item.description || '—'}</td>
                  <td className="py-3 px-4 capitalize">{item.default_importance}</td>
                  <td className="py-3 px-4">{item.active ? 'Yes' : 'No'}</td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-3 text-xs">
                      <button type="button" className="text-teal underline" onClick={() => openEdit(item)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-charcoal-700 underline disabled:opacity-50"
                        onClick={() => void onToggleActive(item)}
                        disabled={togglingId === (item.kpi_item_id as any)}
                      >
                        {togglingId === (item.kpi_item_id as any) ? 'Saving…' : item.active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        className="text-critical underline disabled:opacity-50"
                        onClick={() => void onDelete(item)}
                        disabled={deletingId === (item.kpi_item_id as any)}
                      >
                        {deletingId === (item.kpi_item_id as any) ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setModalOpen(false)} />
          <div className="relative w-full max-w-md mx-4 bg-white rounded-2xl shadow-xl border border-surface-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-charcoal">{editingId ? 'Edit KPI template' : 'Add KPI template'}</h3>
              <button type="button" onClick={() => setModalOpen(false)} className="p-2 rounded-lg hover:bg-surface-100">
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">KPI Questionnaire *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
                  placeholder="e.g. Close audit actions within 30 days"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm min-h-[60px]"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">Default importance</label>
                <select
                  value={defaultImportance}
                  onChange={(e) => setDefaultImportance(e.target.value as KpiImportance)}
                  className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving || !title.trim()}
                  className="px-4 py-2 rounded-lg bg-teal text-white font-medium hover:bg-teal-600 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : editingId ? 'Save' : 'Add'}
                </button>
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg border border-surface-300">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
