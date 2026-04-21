import React, { useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { ModuleKey, UUID } from '../../api/models/core';
import { createRisk } from '../../api/services/risksService';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';

export function RiskCreateModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  createdByUserId: UUID;
  defaultModule?: ModuleKey;
  onCreated?: () => void;
}) {
  const { restoreDraft, clearDraft } = useDraftManager();
  const draftKey = `risk-create:${props.companyId}:${props.createdByUserId}:${props.defaultModule ?? 'all'}`;
  const [module, setModule] = useState<ModuleKey>(props.defaultModule ?? 'safety');
  const [title, setTitle] = useState('');
  const [hazard, setHazard] = useState('');
  const [controls, setControls] = useState('');
  const [likelihood, setLikelihood] = useState(3);
  const [consequence, setConsequence] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => title.trim().length > 2, [title]);
  const hasDirtyDraft = useMemo(
    () =>
      props.open &&
      (
        module !== (props.defaultModule ?? 'safety') ||
        title.trim().length > 0 ||
        hazard.trim().length > 0 ||
        controls.trim().length > 0 ||
        likelihood !== 3 ||
        consequence !== 3
      ),
    [consequence, controls, hazard, likelihood, module, props.defaultModule, props.open, title]
  );

  function resetForm() {
    setModule(props.defaultModule ?? 'safety');
    setTitle('');
    setHazard('');
    setControls('');
    setLikelihood(3);
    setConsequence(3);
  }

  useDraftRegistration({
    key: draftKey,
    label: 'Risk Form',
    enabled: props.open,
    metadata: {
      organizationId: props.companyId,
      moduleName: module,
      formType: 'risk-create'
    },
    isDirty: () => hasDirtyDraft,
    serialize: () => ({
      module,
      title,
      hazard,
      controls,
      likelihood,
      consequence
    })
  });

  React.useEffect(() => {
    if (!props.open) return;
    const restored = restoreDraft<{
      module?: ModuleKey;
      title?: string;
      hazard?: string;
      controls?: string;
      likelihood?: number;
      consequence?: number;
    }>(draftKey);

    if (!restored) return;
    setModule(restored.module ?? (props.defaultModule ?? 'safety'));
    setTitle(restored.title ?? '');
    setHazard(restored.hazard ?? '');
    setControls(restored.controls ?? '');
    setLikelihood(restored.likelihood ?? 3);
    setConsequence(restored.consequence ?? 3);
  }, [draftKey, props.defaultModule, props.open, restoreDraft]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      setLoading(true);
      await createRisk({
        companyId: props.companyId,
        module,
        title: title.trim(),
        hazard: hazard.trim() || undefined,
        controls: controls.trim() || undefined,
        likelihood,
        consequence,
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
          <div>
            <p className="text-sm font-semibold text-charcoal">New risk assessment</p>
            <p className="text-xs text-charcoal-500 mt-0.5">Saved instantly to your company risk register.</p>
          </div>
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
              <p className="text-sm font-semibold text-critical">Could not create risk</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Module</label>
            <select
              value={module}
              onChange={(e) => setModule(e.target.value as ModuleKey)}
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
            >
              <option value="safety">Safety</option>
              <option value="quality">Quality</option>
              <option value="environment">Environment</option>
              <option value="health">Health</option>
              <option value="legal">Legal</option>
              <option value="hr">HR</option>
              <option value="general">General</option>
              <option value="security">Security</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Working at height – scaffold access"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Likelihood (1–5)</label>
              <input
                type="number"
                min={1}
                max={5}
                value={likelihood}
                onChange={(e) => setLikelihood(Number(e.target.value))}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Consequence (1–5)</label>
              <input
                type="number"
                min={1}
                max={5}
                value={consequence}
                onChange={(e) => setConsequence(Number(e.target.value))}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Hazard (optional)</label>
            <input
              value={hazard}
              onChange={(e) => setHazard(e.target.value)}
              placeholder="What is the hazard?"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Controls (optional)</label>
            <textarea
              value={controls}
              onChange={(e) => setControls(e.target.value)}
              rows={3}
              placeholder="Existing controls and improvements…"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
            />
          </div>

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
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-navy text-white text-sm font-semibold hover:bg-navy-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading && <LoadingSpinner size={16} />}
              Save risk
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
