import { useState, type FormEvent } from 'react';
import { AlertCircleIcon, CheckCircleIcon, SendIcon } from 'lucide-react';
import {
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_PRIORITIES,
  createSupportTicket,
  type SupportTicket,
  type SupportTicketCategory,
  type SupportTicketPriority
} from '../../api/services/supportService';
import type { UUID } from '../../api/models/entities';
import { paaq } from '../../lib/paaq';
import { SupportAttachmentUploader } from './SupportAttachmentUploader';

type Props = {
  companyId: UUID;
  companyName?: string | null;
  userId: UUID;
  userName?: string | null;
  userEmail?: string | null;
  initialCategory?: SupportTicketCategory;
  initialSubject?: string;
  onCreated?: (ticket: SupportTicket) => void;
};

export function SupportTicketForm({
  companyId,
  companyName,
  userId,
  userName,
  userEmail,
  initialCategory = 'technical_issue',
  initialSubject = '',
  onCreated
}: Props) {
  const [category, setCategory] = useState<SupportTicketCategory>(initialCategory);
  const [priority, setPriority] = useState<SupportTicketPriority>('medium');
  const [subject, setSubject] = useState(initialSubject);
  const [description, setDescription] = useState('');
  const [createdTicket, setCreatedTicket] = useState<SupportTicket | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!subject.trim() || !description.trim()) {
      setError('Please add a subject and message.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const ticket = await createSupportTicket({
        companyId,
        companyName,
        createdByUserId: userId,
        createdByName: userName,
        createdByEmail: userEmail,
        category,
        subject,
        description,
        priority,
        source: 'manual'
      });
      setCreatedTicket(ticket);
      setSubject('');
      setDescription('');
      setPriority('medium');
      setCategory('technical_issue');
      onCreated?.(ticket);
    } catch (err) {
      // Caught and shown inline only, never thrown or console.error'd —
      // invisible to automatic error capture. Report it explicitly so a
      // real submission failure shows up with session replay.
      paaq.trackError(err, { screen: '/support', context: { category, companyId } });
      setError((err as Error)?.message ?? 'Failed to create support ticket.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-white rounded-lg border border-surface-300 p-5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-charcoal">Create Support Request</h2>
        <p className="mt-1 text-sm text-charcoal-500">Send a request to the Safe Cloud Africa support team.</p>
      </div>

      {createdTicket && (
        <div className="rounded-lg border border-success-200 bg-success-50 p-3 text-sm text-success flex items-start gap-2">
          <CheckCircleIcon className="w-5 h-5 flex-shrink-0" />
          <span>Your request was sent. Reference: <strong>{createdTicket.reference_number}</strong></span>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-critical/20 bg-critical/10 p-3 text-sm text-critical flex items-start gap-2">
          <AlertCircleIcon className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-charcoal mb-2">Category</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {SUPPORT_TICKET_CATEGORIES.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setCategory(item.value)}
              className={`rounded-lg border p-3 text-left transition-colors ${
                category === item.value ? 'border-teal bg-teal-50' : 'border-surface-300 hover:bg-surface-50'
              }`}
            >
              <span className="block text-sm font-semibold text-charcoal">{item.label}</span>
              <span className="mt-1 block text-xs text-charcoal-500">{item.description}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-charcoal mb-1">Subject</label>
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            placeholder="Briefly describe the request"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-charcoal mb-1">Priority</label>
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value as SupportTicketPriority)}
            className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
          >
            {SUPPORT_TICKET_PRIORITIES.map((item) => (
              <option key={item} value={item}>{item.charAt(0).toUpperCase() + item.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-charcoal mb-1">Message</label>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={6}
          className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
          placeholder="Add details, affected page/module, expected result, and any notes for support."
        />
      </div>

      {createdTicket && (
        <SupportAttachmentUploader
          ticketId={createdTicket.id}
          companyId={createdTicket.company_id}
          userId={userId}
        />
      )}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex items-center gap-2 rounded-lg bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
      >
        <SendIcon className="w-4 h-4" />
        {submitting ? 'Creating...' : 'Create Support Request'}
      </button>
    </form>
  );
}
