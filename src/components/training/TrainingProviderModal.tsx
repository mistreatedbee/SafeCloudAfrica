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
  const [contact, setContact] = useState(props.initial?.contact ?? '');
  const [email, setEmail] = useState(props.initial?.email ?? '');
  const [website, setWebsite] = useState(props.initial?.website ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  type TrainingProviderDraftPayload = {
    name: string;
    providerType: 'INTERNAL' | 'EXTERNAL';
    contact: string;
    email: string;
    website: string;
  };

  const { restoreDraft, clearDraft } = useDraftManager();
  const draftKey = `training-provider:${props.companyId}:${props.initial?.id ?? 'new'}`;

  const [baseline, setBaseline] = useState<TrainingProviderDraftPayload>(() => ({
    name: props.initial?.name ?? '',
    providerType: props.initial?.provider_type ?? 'EXTERNAL',
    contact: props.initial?.contact ?? '',
    email: props.initial?.email ?? '',
    website: props.initial?.website ?? ''
  }));

  const hasDirtyDraft = useMemo(() => {
    return JSON.stringify({ name, providerType, contact, email, website }) !== JSON.stringify(baseline);
  }, [baseline, contact, email, website, name, providerType]);

  useDraftRegistration({
    key: draftKey,
    enabled: props.open,
    isDirty: () => hasDirtyDraft,
    serialize: () =>
      ({
        name,
        providerType,
        contact,
        email,
        website
      }) satisfies TrainingProviderDraftPayload
  });

  useEffect(() => {
    if (!props.open) return;
    const restored = restoreDraft<TrainingProviderDraftPayload>(draftKey);
    if (!restored) return;

    setName(restored.name ?? '');
    setProviderType(restored.providerType ?? 'EXTERNAL');
    setContact(restored.contact ?? '');
    setEmail(restored.email ?? '');
    setWebsite(restored.website ?? '');
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
          contact: contact.trim() || null,
          email: email.trim() || null,
          website: website.trim() || null
        });
      } else {
        await createTrainingProvider({
          companyId: props.companyId,
          name: name.trim(),
          providerType,
          contact: contact.trim() || null,
          email: email.trim() || null,
          website: website.trim() || null
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={closeWithDraftClear} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90dvh] overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <p className="text-sm font-semibold text-charcoal">
            {props.initial ? 'Edit provider' : 'Add training provider'}
          </p>
          <button
            type="button"
            onClick={closeWithDraftClear}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-surface-100 text-charcoal-500 shrink-0"
            aria-label="Close"
          >
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
            <label className="block text-sm font-medium text-charcoal mb-1.5">Contact (optional)</label>
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="e.g. 012 345 6789"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Email (optional)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="info@provider.co.za"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Website (optional)</label>
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="www.provider.co.za"
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
