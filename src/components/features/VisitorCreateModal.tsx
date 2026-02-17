import React, { useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { Visitor, UUID } from '../../api/models/entities';
import { createVisitor } from '../../api/services/visitorsService';

export function VisitorCreateModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  createdByUserId: UUID;
  onCreated?: () => void;
}) {
  const [name, setName] = useState('');
  const [status, setStatus] = useState<Visitor['status']>('scheduled');
  const [briefing, setBriefing] = useState<Visitor['briefing']>('pending');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => name.trim().length > 2, [name]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      setLoading(true);
      await createVisitor({
        companyId: props.companyId,
        name: name.trim(),
        status,
        briefing,
        createdByUserId: props.createdByUserId
      });
      props.onCreated?.();
      props.onClose();
      setName('');
      setStatus('scheduled');
      setBriefing('pending');
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
      <div className="relative w-full max-w-xl mx-4 bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <p className="text-sm font-semibold text-charcoal">Add visitor</p>
          <button type="button" onClick={props.onClose} className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-500">
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
            <label className="block text-sm font-medium text-charcoal mb-1.5">Visitor name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sipho Mokoena (Client)"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Visitor['status'])}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                <option value="scheduled">Scheduled</option>
                <option value="checked_in">Checked-in</option>
                <option value="checked_out">Checked-out</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Briefing</label>
              <select
                value={briefing}
                onChange={(e) => setBriefing(e.target.value as Visitor['briefing'])}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
              </select>
            </div>
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

