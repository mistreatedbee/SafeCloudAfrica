import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import { listKpiItems, createKpiItem, updateKpiItem, deleteKpiItem } from '../../api/services/kpiItemService';
import type { KPIItem, KpiImportance, KpiPeriodType, KpiTemplateQuestionnaireLine } from '../../api/models/entities';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { XIcon, BookMarkedIcon } from 'lucide-react';
import { ListEmptyState } from '../../components/ui/ListEmptyState';
import type { UUID } from '../../api/models/core';
import { toUserFacingError } from '../../utils/userFacingMessage';

const EMPTY_LINE: KpiTemplateQuestionnaireLine = { kpiItemId: null, kpiQuestionnaire: '', importanceRating: 'medium' };

const PERIOD_LABELS: Record<KpiPeriodType, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  bi_annual: 'Bi-annual',
  annual: 'Annual'
};

export function KPILibraryPage() {
  const navigate = useNavigate();
  const { activeCompanyId } = useTenant();
  const { user } = useUser();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<UUID | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [defaultImportance, setDefaultImportance] = useState<KpiImportance>('medium');
  const [periodType, setPeriodType] = useState<KpiPeriodType | ''>('');
  const [lines, setLines] = useState<KpiTemplateQuestionnaireLine[]>([{ ...EMPTY_LINE }]);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<UUID | null>(null);
  const [togglingId, setTogglingId] = useState<UUID | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);

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
    setPeriodType('');
    setLines([{ ...EMPTY_LINE }]);
    setSaveError(null);
    setModalOpen(true);
  }

  function openEdit(item: KPIItem) {
    setEditingId(item.kpi_item_id as unknown as UUID);
    setTitle(item.title ?? '');
    setDescription(item.description ?? '');
    setDefaultImportance((item.default_importance ?? 'medium') as KpiImportance);
    setPeriodType(item.period_type ?? '');
    setLines(item.questionnaire_lines && item.questionnaire_lines.length > 0 ? item.questionnaire_lines : [{ ...EMPTY_LINE }]);
    setSaveError(null);
    setModalOpen(true);
  }

  function addLine() {
    setLines((prev) => [...prev, { ...EMPTY_LINE }]);
  }
  function removeLine(i: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : [{ ...EMPTY_LINE }]));
  }
  function updateLine(i: number, patch: Partial<KpiTemplateQuestionnaireLine>) {
    setLines((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], ...patch };
      return next;
    });
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCompanyId || !user?.id || !title.trim()) return;
    setSaveError(null);
    setSaving(true);
    const cleanLines = lines.filter((l) => l.kpiQuestionnaire.trim()).map((l) => ({ ...l, kpiQuestionnaire: l.kpiQuestionnaire.trim() }));
    try {
      if (editingId) {
        await updateKpiItem(
          editingId,
          {
            title: title.trim(),
            description: description.trim() || null,
            default_importance: defaultImportance,
            questionnaire_lines: cleanLines.length > 0 ? cleanLines : null,
            period_type: periodType || null
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
            questionnaireLines: cleanLines.length > 0 ? cleanLines : null,
            periodType: periodType || null,
            createdBy: user.id
          },
          user.id
        );
      }
      setModalOpen(false);
      setEditingId(null);
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      setSaveError(toUserFacingError(err, 'Failed to save KPI template.'));
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

  function useTemplate(item: KPIItem) {
    navigate(`/modules/hr/kpis/assessments/new?template=${item.kpi_item_id}`);
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
        Reusable KPI Questionnaire templates for KPI Assessment. Build a full multi-line template here, or add a single
        custom questionnaire when creating an assessment.
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
                <th className="py-3 px-4">Template name</th>
                <th className="py-3 px-4">KPI lines</th>
                <th className="py-3 px-4">Period type</th>
                <th className="py-3 px-4">Default importance</th>
                <th className="py-3 px-4">Active</th>
                <th className="py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(items ?? []).map((item) => {
                const lineCount = item.questionnaire_lines?.length ?? 0;
                return (
                <tr key={item.kpi_item_id} className="border-b border-surface-100 last:border-0">
                  <td className="py-3 px-4">
                    <p className="font-medium text-charcoal">{item.title}</p>
                    {item.description && <p className="text-xs text-charcoal-500">{item.description}</p>}
                  </td>
                  <td className="py-3 px-4 text-charcoal-600">{lineCount > 0 ? `${lineCount} indicator${lineCount === 1 ? '' : 's'}` : '—'}</td>
                  <td className="py-3 px-4 text-charcoal-600">{item.period_type ? PERIOD_LABELS[item.period_type] : '—'}</td>
                  <td className="py-3 px-4 capitalize">{item.default_importance}</td>
                  <td className="py-3 px-4">{item.active ? 'Yes' : 'No'}</td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-3 text-xs">
                      {lineCount > 0 && (
                        <button type="button" className="text-teal underline font-medium" onClick={() => useTemplate(item)}>
                          Use template
                        </button>
                      )}
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => setModalOpen(false)} />
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90dvh] overflow-y-auto">
            <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-4 border-b border-surface-200">
              <h3 className="font-semibold text-charcoal">{editingId ? 'Edit KPI template' : 'Add KPI template'}</h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-surface-100 shrink-0"
                aria-label="Close"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              {saveError && (
                <div className="bg-critical/5 border border-critical/20 rounded-lg p-3 text-sm text-critical">
                  {saveError}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1">Template name *</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
                    placeholder="e.g. Standard Operations KPI Template"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1">Period type</label>
                  <select
                    value={periodType}
                    onChange={(e) => setPeriodType(e.target.value as KpiPeriodType | '')}
                    className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
                  >
                    <option value="">Not set — use assessment default</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="bi_annual">Bi-annual</option>
                    <option value="annual">Annual</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">Description / Notes</label>
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
                  className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm sm:w-56"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
                <p className="mt-1 text-xs text-charcoal-500">Used for a single custom questionnaire item; each questionnaire line below has its own importance.</p>
              </div>

              <div className="border-t border-surface-200 pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-charcoal text-sm">Questionnaire lines</h4>
                  <span className="text-xs text-charcoal-500">{lines.length} line{lines.length === 1 ? '' : 's'}</span>
                </div>
                <p className="text-xs text-charcoal-500">
                  These lines pre-fill the questionnaire section of a new KPI assessment when this template is used.
                </p>

                {lines.map((line, i) => (
                  <div key={i} className="flex flex-wrap gap-2 items-start p-3 border border-surface-200 rounded-lg">
                    <input
                      type="text"
                      value={line.kpiQuestionnaire}
                      onChange={(e) => updateLine(i, { kpiQuestionnaire: e.target.value })}
                      placeholder="KPI Questionnaire"
                      className="flex-1 min-w-[220px] px-3 py-2 border border-surface-300 rounded-lg text-sm"
                    />
                    <select
                      value={line.importanceRating}
                      onChange={(e) => updateLine(i, { importanceRating: e.target.value as KpiImportance })}
                      className="px-3 py-2 border border-surface-300 rounded-lg text-sm"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                    <button type="button" onClick={() => removeLine(i)} className="text-critical hover:underline text-sm">
                      Remove
                    </button>
                  </div>
                ))}

                <button type="button" onClick={addLine} className="text-sm text-teal hover:underline font-medium">
                  + Add line
                </button>
              </div>

              <div className="flex gap-2 pt-2">
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
