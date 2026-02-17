import React, { useEffect, useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { PPEItem, QualityNcr, UUID } from '../../api/models/entities';
import { createPpeIssue, setPpeIssueLinks } from '../../api/services/ppeService';
import { listQualityNcrs } from '../../api/services/qualityNcrsService';
import { listCorrectiveActions } from '../../api/services/correctiveActionsService';

export function PpeIssueModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  issuedByUserId: UUID;
  items: PPEItem[];
  onIssued?: () => void;
}) {
  const [ppeItemId, setPpeItemId] = useState('');
  const [issuedToUserId, setIssuedToUserId] = useState('');
  const [nextIssueAt, setNextIssueAt] = useState('');
  const [returnDueAt, setReturnDueAt] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedNcrIds, setSelectedNcrIds] = useState<string[]>([]);
  const [selectedCapaIds, setSelectedCapaIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ncrOptions, setNcrOptions] = useState<QualityNcr[]>([]);
  const [capaOptions, setCapaOptions] = useState<import('../../api/services/correctiveActionsService').CorrectiveAction[]>([]);

  useEffect(() => {
    async function loadLinkedOptions() {
      if (!props.open) return;
      try {
        const [ncrs, capas] = await Promise.all([
          listQualityNcrs({ companyId: props.companyId, limit: 100 }),
          listCorrectiveActions({ companyId: props.companyId, limit: 100 })
        ]);
        setNcrOptions(ncrs);
        setCapaOptions(capas);
      } catch {
        // Soft-fail; linking is optional.
      }
    }
    loadLinkedOptions();
  }, [props.companyId, props.open]);

  const canSubmit = useMemo(() => !!ppeItemId, [ppeItemId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      setLoading(true);
      const issue = await createPpeIssue({
        companyId: props.companyId,
        ppeItemId: ppeItemId as any,
        issuedToUserId: issuedToUserId ? (issuedToUserId as any) : null,
        issuedByUserId: props.issuedByUserId,
        nextIssueAt: nextIssueAt ? new Date(nextIssueAt).toISOString() : null,
        returnDueAt: returnDueAt ? new Date(returnDueAt).toISOString() : null,
        notes: notes.trim() || null
      });
      if (issue && (selectedNcrIds.length > 0 || selectedCapaIds.length > 0)) {
        await setPpeIssueLinks({
          companyId: props.companyId,
          issueId: issue.id,
          ncrIds: selectedNcrIds as any,
          correctiveActionIds: selectedCapaIds as any,
          actorUserId: props.issuedByUserId
        });
      }
      props.onIssued?.();
      props.onClose();
      setPpeItemId('');
      setIssuedToUserId('');
      setNextIssueAt('');
      setReturnDueAt('');
      setNotes('');
      setSelectedNcrIds([]);
      setSelectedCapaIds([]);
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
      <div className="relative w-full max-w-2xl mx-4 bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <p className="text-sm font-semibold text-charcoal">Issue PPE</p>
          <button type="button" onClick={props.onClose} className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-500">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
              <p className="text-sm font-semibold text-critical">Could not issue PPE</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Item *</label>
            <select
              value={ppeItemId}
              onChange={(e) => setPpeItemId(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            >
              <option value="">Select PPE item</option>
              {props.items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Issued to (user UUID)</label>
              <input
                value={issuedToUserId}
                onChange={(e) => setIssuedToUserId(e.target.value)}
                placeholder="Optional"
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Return due (optional)</label>
              <input
                type="date"
                value={returnDueAt}
                onChange={(e) => setReturnDueAt(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Next issue (optional)</label>
              <input
                type="date"
                value={nextIssueAt}
                onChange={(e) => setNextIssueAt(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Notes (optional)</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
          </div>

          <div className="border-t border-surface-200 pt-4 mt-2 space-y-4">
            <p className="text-sm font-semibold text-charcoal">Link to NCR / CAPA (optional)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">
                  Linked NCRs
                </label>
                <select
                  multiple
                  value={selectedNcrIds}
                  onChange={(e) =>
                    setSelectedNcrIds(Array.from(e.target.selectedOptions).map((o) => o.value))
                  }
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent h-28"
                >
                  {ncrOptions.map((ncr) => (
                    <option key={ncr.id} value={ncr.id}>
                      {ncr.nc_number ?? String(ncr.id).slice(0, 8)} — {ncr.title}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-charcoal-400 mt-1">
                  Hold Ctrl/Cmd to select multiple NCRs.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">
                  Linked CAPA / Corrective Actions
                </label>
                <select
                  multiple
                  value={selectedCapaIds}
                  onChange={(e) =>
                    setSelectedCapaIds(Array.from(e.target.selectedOptions).map((o) => o.value))
                  }
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent h-28"
                >
                  {capaOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {(c as any).action_number ?? String(c.id).slice(0, 8)} — {c.title}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-charcoal-400 mt-1">
                  Link this PPE issue to one or more corrective actions.
                </p>
              </div>
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
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-navy text-white text-sm font-semibold hover:bg-navy-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading && <LoadingSpinner size={16} />}
              Issue
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

