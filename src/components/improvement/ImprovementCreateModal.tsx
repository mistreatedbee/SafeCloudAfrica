import React, { useEffect, useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { ImprovementAction, ModuleKey, UUID } from '../../api/models/entities';
import { createImprovementAction } from '../../api/services/improvementActionsService';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';

function asUuidOrNull(value: string): UUID | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(trimmed) ? (trimmed as UUID) : null;
}

export function ImprovementCreateModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  createdByUserId: UUID;
  onCreated?: () => void;
}) {
  const [module, setModule] = useState<ModuleKey>('general');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ownerUserId, setOwnerUserId] = useState('');
  const [status, setStatus] = useState<ImprovementAction['status']>('planned');
  const [targetDate, setTargetDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  type ImprovementCreateDraftPayload = {
    module: ModuleKey;
    title: string;
    description: string;
    ownerUserId: string;
    status: ImprovementAction['status'];
    targetDate: string;
  };

  const { restoreDraft, clearDraft } = useDraftManager();
  const draftKey = `improvement-create:${props.companyId}:${props.createdByUserId}`;

  const payload = useMemo<ImprovementCreateDraftPayload>(
    () => ({
      module,
      title,
      description,
      ownerUserId,
      status,
      targetDate
    }),
    [description, module, ownerUserId, status, targetDate, title]
  );

  const payloadJson = useMemo(() => JSON.stringify(payload), [payload]);
  const [draftBaselineJson, setDraftBaselineJson] = useState<string | null>(null);

  const hasDirtyDraft = useMemo(() => {
    if (draftBaselineJson == null) return false;
    return payloadJson !== draftBaselineJson;
  }, [draftBaselineJson, payloadJson]);

  useDraftRegistration({
    key: draftKey,
    enabled: props.open,
    isDirty: () => hasDirtyDraft,
    serialize: () => payload
  });

  const canSubmit = useMemo(() => title.trim().length > 2, [title]);

  useEffect(() => {
    if (!props.open) return;

    // Baseline matches current state first, then we restore if a draft exists.
    setDraftBaselineJson(payloadJson);

    const restored = restoreDraft<ImprovementCreateDraftPayload>(draftKey);
    if (!restored) return;

    setModule(restored.module ?? 'general');
    setTitle(restored.title ?? '');
    setDescription(restored.description ?? '');
    setOwnerUserId(restored.ownerUserId ?? '');
    setStatus(restored.status ?? 'planned');
    setTargetDate(restored.targetDate ?? '');

    setDraftBaselineJson(JSON.stringify(restored));
  }, [draftKey, props.open, restoreDraft]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      const ownerId = asUuidOrNull(ownerUserId);
      if (ownerUserId.trim() && !ownerId) {
        setError('Owner user ID must be a valid user UUID or left blank.');
        return;
      }

      setLoading(true);
      await createImprovementAction({
        companyId: props.companyId,
        module,
        title: title.trim(),
        description: description.trim() || null,
        ownerUserId: ownerId,
        status,
        targetDate: targetDate ? new Date(targetDate).toISOString() : null,
        createdByUserId: props.createdByUserId
      });
      props.onCreated?.();
      clearDraft(draftKey);
      props.onClose();
      setModule('general');
      setTitle('');
      setDescription('');
      setOwnerUserId('');
      setStatus('planned');
      setTargetDate('');
      setDraftBaselineJson(null);
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => {
          clearDraft(draftKey);
          props.onClose();
        }}
      />
      <div className="relative w-full max-w-2xl mx-4 bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <p className="text-sm font-semibold text-charcoal">Create improvement action</p>
          <button
            type="button"
            onClick={() => {
              clearDraft(draftKey);
              props.onClose();
            }}
            className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-500"
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Module</label>
              <select
                value={module}
                onChange={(e) => setModule(e.target.value as ModuleKey)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                <option value="general">general</option>
                <option value="safety">safety</option>
                <option value="quality">quality</option>
                <option value="environment">environment</option>
                <option value="health">health</option>
                <option value="legal">legal</option>
                <option value="hr">hr</option>
                <option value="security">security</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ImprovementAction['status'])}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                <option value="planned">planned</option>
                <option value="active">active</option>
                <option value="complete">complete</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Description (optional)</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Owner user ID (optional)</label>
              <input
                value={ownerUserId}
                onChange={(e) => setOwnerUserId(e.target.value)}
                placeholder="Paste UUID"
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Target date (optional)</label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                clearDraft(draftKey);
                props.onClose();
              }}
              className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-success text-white text-sm font-semibold hover:bg-success-600 disabled:opacity-60 disabled:cursor-not-allowed"
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

