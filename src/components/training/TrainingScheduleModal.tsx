import React, { useState } from 'react';
import { XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { TrainingRecord, TrainingProvider, UUID } from '../../api/models/entities';
import { updateTrainingRecord } from '../../api/services/trainingService';

export function TrainingScheduleModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  record: TrainingRecord;
  providers: TrainingProvider[];
  onSaved?: () => void;
}) {
  const [arrangedAt, setArrangedAt] = useState(
    props.record.arranged_at ? props.record.arranged_at.slice(0, 16) : ''
  );
  const [providerId, setProviderId] = useState<string>(props.record.provider_id ?? '');
  const [cost, setCost] = useState<string>(props.record.cost != null ? String(props.record.cost) : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!arrangedAt) return;
    setError(null);
    try {
      setLoading(true);
      await updateTrainingRecord({
        companyId: props.companyId,
        recordId: props.record.id,
        status: 'SCHEDULED',
        arrangedAt: new Date(arrangedAt).toISOString(),
        providerId: providerId ? (providerId as UUID) : null,
        providerType: providerId ? (props.providers.find((p) => p.id === providerId)?.provider_type ?? null) : null,
        cost: cost ? parseFloat(cost) || null : null
      });
      props.onSaved?.();
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
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-md mx-4 bg-white rounded-2xl shadow-xl border border-surface-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <p className="text-sm font-semibold text-charcoal">Schedule training</p>
          <button type="button" onClick={props.onClose} className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-500">
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
            <label className="block text-sm font-medium text-charcoal mb-1.5">Training arranged for (date) *</label>
            <input
              type="datetime-local"
              value={arrangedAt}
              onChange={(e) => setArrangedAt(e.target.value)}
              required
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Provider (optional)</label>
            <select
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            >
              <option value="">None</option>
              {props.providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.provider_type})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Cost (ZAR, optional)</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="0"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={props.onClose} className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!arrangedAt || loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60"
            >
              {loading && <LoadingSpinner size={16} />}
              Schedule
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
