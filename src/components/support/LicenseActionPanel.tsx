import { useState } from 'react';
import { CreditCardIcon } from 'lucide-react';
import { processLicenseRenewalFromTicket, type SupportTicket } from '../../api/services/supportService';
import type { UUID } from '../../api/models/entities';

type Props = {
  ticket: SupportTicket;
  actorUserId: UUID;
  actorName?: string | null;
  onProcessed: () => void;
};

export function LicenseActionPanel({ ticket, actorUserId, actorName, onProcessed }: Props) {
  const [planName, setPlanName] = useState<'base' | 'growth' | 'professional' | 'hr_only'>('growth');
  const [seatLimit, setSeatLimit] = useState(10);
  const [durationMonths, setDurationMonths] = useState(12);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await processLicenseRenewalFromTicket({
        ticketId: ticket.id,
        actorUserId,
        actorName,
        license: {
          company_id: ticket.company_id,
          plan_name: planName,
          seat_limit: seatLimit,
          duration_months: durationMonths,
          start_date: startDate
        },
        note
      });
      onProcessed();
    } catch (err) {
      setError((err as Error)?.message ?? 'Failed to process license.');
    } finally {
      setSaving(false);
    }
  };

  if (ticket.category !== 'license_subscription') return null;

  return (
    <div className="bg-white border border-surface-300 rounded-lg p-4">
      <h3 className="flex items-center gap-2 font-semibold text-charcoal">
        <CreditCardIcon className="w-4 h-4 text-teal" />
        License Action
      </h3>
      <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-semibold text-charcoal-500 mb-1">Plan</label>
          <select value={planName} onChange={(event) => setPlanName(event.target.value as typeof planName)} className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm">
            <option value="base">Base</option>
            <option value="growth">Growth</option>
            <option value="professional">Professional</option>
            <option value="hr_only">HR only</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-charcoal-500 mb-1">Seats</label>
          <input type="number" min={1} max={50} value={seatLimit} onChange={(event) => setSeatLimit(Number(event.target.value) || 1)} className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-charcoal-500 mb-1">Months</label>
          <input type="number" min={1} value={durationMonths} onChange={(event) => setDurationMonths(Number(event.target.value) || 1)} className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-charcoal-500 mb-1">Start date</label>
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm" />
        </div>
      </div>
      <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Renewal or invoice note" rows={2} className="mt-3 w-full rounded-lg border border-surface-300 px-3 py-2 text-sm" />
      <button type="button" disabled={saving} onClick={submit} className="mt-3 rounded-lg bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50">
        {saving ? 'Processing...' : 'Renew / Extend License'}
      </button>
      {error && <p className="mt-2 text-sm text-critical">{error}</p>}
    </div>
  );
}
