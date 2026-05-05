import { useState } from 'react';
import { ToggleLeftIcon } from 'lucide-react';
import { processModuleAccessFromTicket, type SupportTicket } from '../../api/services/supportService';
import { ALL_MODULE_KEYS } from '../../api/services/orgModulesService';
import { SELLABLE_FEATURE_LABELS, SELLABLE_FEATURES_ORDER } from '../../api/services/sellableFeaturesService';
import type { UUID } from '../../api/models/entities';

type Props = {
  ticket: SupportTicket;
  actorUserId: UUID;
  actorName?: string | null;
  onProcessed: () => void;
};

export function ModuleAccessPanel({ ticket, actorUserId, actorName, onProcessed }: Props) {
  const [mode, setMode] = useState<'core' | 'sellable'>('core');
  const [moduleKey, setModuleKey] = useState<string>(ALL_MODULE_KEYS[0]);
  const [featureKey, setFeatureKey] = useState<string>(SELLABLE_FEATURES_ORDER[0]);
  const [enabled, setEnabled] = useState(true);
  const [approved, setApproved] = useState(true);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await processModuleAccessFromTicket({
        ticketId: ticket.id,
        companyId: ticket.company_id,
        actorUserId,
        actorName,
        moduleKey: mode === 'core' ? moduleKey : null,
        sellableFeatureKey: mode === 'sellable' ? featureKey : null,
        enabled,
        approved,
        note
      });
      onProcessed();
    } catch (err) {
      setError((err as Error)?.message ?? 'Failed to process module request.');
    } finally {
      setSaving(false);
    }
  };

  if (ticket.category !== 'module_access') return null;

  return (
    <div className="bg-white border border-surface-300 rounded-lg p-4">
      <h3 className="flex items-center gap-2 font-semibold text-charcoal">
        <ToggleLeftIcon className="w-4 h-4 text-teal" />
        Module Access Action
      </h3>
      <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-semibold text-charcoal-500 mb-1">Type</label>
          <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)} className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm">
            <option value="core">Core module</option>
            <option value="sellable">Paid program</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-charcoal-500 mb-1">Module</label>
          {mode === 'core' ? (
            <select value={moduleKey} onChange={(event) => setModuleKey(event.target.value)} className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm">
              {ALL_MODULE_KEYS.map((key) => <option key={key} value={key}>{key}</option>)}
            </select>
          ) : (
            <select value={featureKey} onChange={(event) => setFeatureKey(event.target.value)} className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm">
              {SELLABLE_FEATURES_ORDER.map((key) => <option key={key} value={key}>{SELLABLE_FEATURE_LABELS[key]}</option>)}
            </select>
          )}
        </div>
        <div>
          <label className="block text-xs font-semibold text-charcoal-500 mb-1">Decision</label>
          <select value={approved ? 'approve' : 'reject'} onChange={(event) => setApproved(event.target.value === 'approve')} className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm">
            <option value="approve">Approve</option>
            <option value="reject">Reject</option>
          </select>
        </div>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-charcoal">
        <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
        Enable selected module/program
      </label>
      <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Decision notes" rows={2} className="mt-3 w-full rounded-lg border border-surface-300 px-3 py-2 text-sm" />
      <button type="button" disabled={saving} onClick={submit} className="mt-3 rounded-lg bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50">
        {saving ? 'Processing...' : 'Process Module Request'}
      </button>
      {error && <p className="mt-2 text-sm text-critical">{error}</p>}
    </div>
  );
}
