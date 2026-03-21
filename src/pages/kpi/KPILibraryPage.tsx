import React, { useState } from 'react';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import { listKpiItems, createKpiItem } from '../../api/services/kpiItemService';
import type { KPIItem, KpiImportance } from '../../api/models/entities';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { XIcon, BookMarkedIcon } from 'lucide-react';
import { ListEmptyState } from '../../components/ui/ListEmptyState';

export function KPILibraryPage() {
  const { activeCompanyId } = useTenant();
  const { user } = useUser();
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [defaultImportance, setDefaultImportance] = useState<KpiImportance>('medium');
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: items, loading } = useAsync<KPIItem[]>(
    async () => {
      if (!activeCompanyId) return [];
      return listKpiItems({ organizationId: activeCompanyId, activeOnly: false });
    },
    [activeCompanyId, refreshKey]
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCompanyId || !user?.id || !title.trim()) return;
    setSaving(true);
    try {
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
      setTitle('');
      setDescription('');
      setDefaultImportance('medium');
      setModalOpen(false);
      setRefreshKey((k) => k + 1);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-charcoal">KPI library</h2>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
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
          primaryAction={{ kind: 'button', label: 'Add KPI template', onClick: () => setModalOpen(true) }}
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
              </tr>
            </thead>
            <tbody>
              {(items ?? []).map((item) => (
                <tr key={item.kpi_item_id} className="border-b border-surface-100 last:border-0">
                  <td className="py-3 px-4 font-medium text-charcoal">{item.title}</td>
                  <td className="py-3 px-4 text-charcoal-600">{item.description || '—'}</td>
                  <td className="py-3 px-4 capitalize">{item.default_importance}</td>
                  <td className="py-3 px-4">{item.active ? 'Yes' : 'No'}</td>
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
              <h3 className="font-semibold text-charcoal">Add KPI template</h3>
              <button type="button" onClick={() => setModalOpen(false)} className="p-2 rounded-lg hover:bg-surface-100">
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
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
                  {saving ? 'Adding…' : 'Add'}
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
