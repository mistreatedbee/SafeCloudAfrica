import React, { useEffect, useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { TrainingProvider, UUID } from '../../api/models/entities';
import { createTrainingProvider, updateTrainingProvider } from '../../api/services/trainingService';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';

export function TrainingProviderModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  initial?: TrainingProvider | null;
  onSaved?: () => void;
}) {
  const [name, setName] = useState(props.initial?.name ?? '');
  const [providerType, setProviderType] = useState<'INTERNAL' | 'EXTERNAL'>(props.initial?.provider_type ?? 'EXTERNAL');
  const [contactInfo, setContactInfo] = useState(props.initial?.contact_info ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  type TrainingProviderDraftPayload = {
    name: string;
    providerType: 'INTERNAL' | 'EXTERNAL';
    contactInfo: string;
  };

  const { restoreDraft, clearDraft } = useDraftManager();
  const draftKey = `training-provider:${props.companyId}:${props.initial?.id ?? 'new'}`;

  const [baseline, setBaseline] = useState<TrainingProviderDraftPayload>(() => ({
    name: props.initial?.name ?? '',
    providerType: props.initial?.provider_type ?? 'EXTERNAL',
    contactInfo: props.initial?.contact_info ?? ''
  }));

  const hasDirtyDraft = useMemo(() => {
    return JSON.stringify({ name, providerType, contactInfo }) !== JSON.stringify(baseline);
  }, [baseline, contactInfo, name, providerType]);

  useDraftRegistration({
    key: draftKey,
    enabled: props.open,
    isDirty: () => hasDirtyDraft,
    serialize: () =>
      ({
        name,
        providerType,
        contactInfo
      }) satisfies TrainingProviderDraftPayload
  });

  useEffect(() => {
    if (!props.open) return;
    const restored = restoreDraft<TrainingProviderDraftPayload>(draftKey);
    if (!restored) return;

    setName(restored.name ?? '');
    setProviderType(restored.providerType ?? 'EXTERNAL');
    setContactInfo(restored.contactInfo ?? '');
    setBaseline(restored);
  }, [draftKey, props.open, restoreDraft]);

  const closeWithDraftClear = () => {
    clearDraft(draftKey);
    props.onClose();
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    try {
      setLoading(true);
      if (props.initial) {
        await updateTrainingProvider({
          companyId: props.companyId,
          providerId: props.initial.id,
          name: name.trim(),
          providerType,
          contactInfo: contactInfo.trim() || null
        });
      } else {
        await createTrainingProvider({
          companyId: props.companyId,
          name: name.trim(),
          providerType,
          contactInfo: contactInfo.trim() || null
        });
      }
      props.onSaved?.();
      clearDraft(draftKey);
      props.onClose();
    } catch (err: unknown) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={closeWithDraftClear} />
      <div className="relative w-full max-w-lg mx-4 bg-white rounded-2xl shadow-xl border border-surface-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <p className="text-sm font-semibold text-charcoal">
            {props.initial ? 'Edit provider' : 'Add training provider'}
          </p>
          <button type="button" onClick={closeWithDraftClear} className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-500">
            <XIcon className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
              <p className="text-sm text-critical">{error}</p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Provider name"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Type</label>
            <select
              value={providerType}
              onChange={(e) => setProviderType(e.target.value as 'INTERNAL' | 'EXTERNAL')}
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            >
              <option value="INTERNAL">Internal</option>
              <option value="EXTERNAL">External</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Contact info (optional)</label>
            <input
              value={contactInfo}
              onChange={(e) => setContactInfo(e.target.value)}
              placeholder="Email, phone, etc."
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={closeWithDraftClear} className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60"
            >
              {loading && <LoadingSpinner size={16} />}
              {props.initial ? 'Save' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
