import React, { useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { UUID } from '../../api/models/core';
import { createLegalRequirement } from '../../api/services/legalRequirementsService';
import type { LegalRequirement } from '../../api/models/entities';

export function LegalRequirementCreateModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  createdByUserId: UUID;
  onCreated?: () => void;
}) {
  const [requirement, setRequirement] = useState('');
  const [reference, setReference] = useState('');
  const [status, setStatus] = useState<LegalRequirement['status']>('in-progress');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => requirement.trim().length > 4, [requirement]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      setLoading(true);
      await createLegalRequirement({
        companyId: props.companyId,
        requirement: requirement.trim(),
        reference: reference.trim() || undefined,
        status,
        createdByUserId: props.createdByUserId
      });
      props.onCreated?.();
      props.onClose();
      setRequirement('');
      setReference('');
      setStatus('in-progress');
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-xl mx-4 bg-white rounded-2xl shadow-xl border border-surface-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <div>
            <p className="text-sm font-semibold text-charcoal">Add legal requirement</p>
            <p className="text-xs text-charcoal-500 mt-0.5">Saved instantly to the legal register.</p>
          </div>
          <button type="button" onClick={props.onClose} className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-500">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
              <p className="text-sm font-semibold text-critical">Could not save requirement</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Requirement *</label>
            <textarea
              value={requirement}
              onChange={(e) => setRequirement(e.target.value)}
              rows={3}
              placeholder="e.g. Occupational Health and Safety Act – maintain incident register and investigate incidents"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-700 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Reference (optional)</label>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. Act 85 of 1993"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-700 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as LegalRequirement['status'])}
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-700 focus:border-transparent"
            >
              <option value="in-progress">In progress</option>
              <option value="compliant">Compliant</option>
              <option value="non-compliant">Non-compliant</option>
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
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-700 text-white text-sm font-semibold hover:bg-purple-800 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading && <LoadingSpinner size={16} />}
              Add requirement
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

