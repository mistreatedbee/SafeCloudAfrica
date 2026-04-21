import React, { useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { Contractor, UUID } from '../../api/models/entities';
import { createContractor } from '../../api/services/contractorsService';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';

export function ContractorCreateModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  createdByUserId: UUID;
  onCreated?: () => void;
}) {
  const { restoreDraft, clearDraft } = useDraftManager();
  const draftKey = `contractor-create:${props.companyId}:${props.createdByUserId}`;
  const [name, setName] = useState('');
  const [status, setStatus] = useState<Contractor['status']>('pending');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => name.trim().length > 2, [name]);
  const hasDirtyDraft = useMemo(
    () => props.open && (name.trim().length > 0 || status !== 'pending'),
    [name, props.open, status]
  );

  function resetForm() {
    setName('');
    setStatus('pending');
  }

  useDraftRegistration({
    key: draftKey,
    label: 'Contractor Form',
    enabled: props.open,
    metadata: {
      organizationId: props.companyId,
      moduleName: 'general',
      formType: 'contractor-create'
    },
    isDirty: () => hasDirtyDraft,
    serialize: () => ({
      name,
      status
    })
  });

  React.useEffect(() => {
    if (!props.open) return;
    const restored = restoreDraft<{
      name?: string;
      status?: Contractor['status'];
    }>(draftKey);

    if (!restored) return;
    setName(restored.name ?? '');
    setStatus(restored.status ?? 'pending');
  }, [draftKey, props.open, restoreDraft]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      setLoading(true);
      await createContractor({
        companyId: props.companyId,
        name: name.trim(),
        status,
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
          <p className="text-sm font-semibold text-charcoal">Add contractor</p>
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
            <label className="block text-sm font-medium text-charcoal mb-1.5">Contractor name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mokoena Electrical"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Contractor['status'])}
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="suspended">Suspended</option>
            </select>
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
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading && <LoadingSpinner size={16} />}
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
