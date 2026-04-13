import React, { useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { Approval, UUID } from '../../api/models/entities';
import { decideApproval } from '../../api/services/approvalsService';

export function ApprovalDecisionModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  actorUserId: UUID;
  approval: Approval | null;
  decision: 'approved' | 'rejected';
  onDecided?: () => void;
}) {
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => !!props.approval, [props.approval]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!props.approval || !canSubmit) return;
    setError(null);
    try {
      setLoading(true);
      await decideApproval({
        companyId: props.companyId,
        approvalId: props.approval.id,
        actorUserId: props.actorUserId,
        decision: props.decision,
        signatureNote: note.trim() || undefined
      });
      props.onDecided?.();
      props.onClose();
      setNote('');
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  if (!props.open || !props.approval) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90dvh] overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <div>
            <p className="text-sm font-semibold text-charcoal">
              {props.decision === 'approved' ? 'Approve request' : 'Reject request'}
            </p>
            <p className="text-xs text-charcoal-500 mt-0.5">
              {props.approval.entity_type} • {String(props.approval.entity_id).slice(0, 8)}
            </p>
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
              <p className="text-sm font-semibold text-critical">Could not submit decision</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Signature note (optional)</label>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Approved after review, evidence attached."
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent resize-none"
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
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed ${
                props.decision === 'approved' ? 'bg-success hover:bg-success-600' : 'bg-critical hover:bg-critical-600'
              }`}
            >
              {loading && <LoadingSpinner size={16} />}
              {props.decision === 'approved' ? 'Approve' : 'Reject'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
