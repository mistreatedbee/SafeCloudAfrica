import React, { useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { ModuleKey, UUID } from '../../api/models/core';
import { createModuleTarget } from '../../api/services/moduleTargetsService';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';

export function ModuleTargetCreateModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  createdByUserId: UUID;
  module: ModuleKey;
  onCreated?: () => void;
}) {
  const { restoreDraft, clearDraft } = useDraftManager();
  const draftKey = `module-target-create:${props.companyId}:${props.module}:${props.createdByUserId}`;
  const [name, setName] = useState('');
  const [currentValue, setCurrentValue] = useState('0');
  const [targetValue, setTargetValue] = useState('0');
  const [unit, setUnit] = useState('%');
  const [achieved, setAchieved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => name.trim().length > 2, [name]);
  const hasDirtyDraft = useMemo(
    () =>
      props.open &&
      (name.trim().length > 0 || currentValue !== '0' || targetValue !== '0' || unit !== '%' || achieved),
    [achieved, currentValue, name, props.open, targetValue, unit]
  );

  function resetForm() {
    setName('');
    setCurrentValue('0');
    setTargetValue('0');
    setUnit('%');
    setAchieved(false);
  }

  useDraftRegistration({
    key: draftKey,
    label: 'Module Target Form',
    enabled: props.open,
    metadata: {
      organizationId: props.companyId,
      moduleName: props.module,
      formType: 'module-target-create'
    },
    isDirty: () => hasDirtyDraft,
    serialize: () => ({
      name,
      currentValue,
      targetValue,
      unit,
      achieved
    })
  });

  React.useEffect(() => {
    if (!props.open) return;
    const restored = restoreDraft<{
      name?: string;
      currentValue?: string;
      targetValue?: string;
      unit?: string;
      achieved?: boolean;
    }>(draftKey);

    if (!restored) return;
    setName(restored.name ?? '');
    setCurrentValue(restored.currentValue ?? '0');
    setTargetValue(restored.targetValue ?? '0');
    setUnit(restored.unit ?? '%');
    setAchieved(restored.achieved ?? false);
  }, [draftKey, props.open, restoreDraft]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      setLoading(true);
      await createModuleTarget({
        companyId: props.companyId,
        module: props.module,
        name: name.trim(),
        currentValue: Number(currentValue) || 0,
        targetValue: Number(targetValue) || 0,
        unit: unit.trim() || null,
        achieved,
        createdByUserId: props.createdByUserId
      });
      clearDraft(draftKey);
      props.onCreated?.();
      props.onClose();
      resetForm();
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90dvh] overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <p className="text-sm font-semibold text-charcoal">Add programme KPI / target</p>
          <button
            type="button"
            onClick={props.onClose}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-surface-100 text-charcoal-500 shrink-0"
            aria-label="Close"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
              <p className="text-sm font-semibold text-critical">Could not create</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Monthly toolbox talk completion"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Current</label>
              <input
                type="number"
                value={currentValue}
                onChange={(e) => setCurrentValue(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Target</label>
              <input
                type="number"
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Unit</label>
              <input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={achieved}
              onChange={(e) => setAchieved(e.target.checked)}
              className="w-4 h-4 rounded border-surface-300 text-teal focus:ring-teal"
            />
            <span className="text-sm text-charcoal-600">Mark achieved</span>
          </label>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={props.onClose}
              className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading && <LoadingSpinner size={16} />}
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
