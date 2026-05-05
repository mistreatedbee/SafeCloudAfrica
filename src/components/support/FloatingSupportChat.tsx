import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircleIcon,
  CheckCircleIcon,
  ClockIcon,
  HeadphonesIcon,
  MessageCircleIcon,
  SendIcon,
  XIcon,
} from 'lucide-react';
import { useUser } from '@insforge/react';

import { useTenant } from '../../tenant/TenantContext';
import {
  createSupportTicket,
  formatSupportStatus,
  listMySupportTickets,
  type SupportTicket,
  type SupportTicketCategory,
  type SupportTicketPriority,
} from '../../api/services/supportService';

type SupportOption = {
  label: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
};

const SUPPORT_OPTIONS: SupportOption[] = [
  { label: 'Report an Issue', category: 'technical_issue', priority: 'medium' },
  { label: 'Contact Admin', category: 'user_organisation_access', priority: 'medium' },
  { label: 'Renew License', category: 'license_subscription', priority: 'high' },
  { label: 'Request Module Access', category: 'module_access', priority: 'medium' },
  { label: 'Other', category: 'general_query', priority: 'medium' },
];

export function FloatingSupportChat() {
  const { activeCompanyId, activeCompany } = useTenant();
  const { user } = useUser();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedOption, setSelectedOption] = useState<SupportOption | null>(null);
  const [message, setMessage] = useState('');
  const [recentTickets, setRecentTickets] = useState<SupportTicket[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successReference, setSuccessReference] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = Boolean(activeCompanyId && user?.id);

  const userName = useMemo(() => {
    const metadata = user?.user_metadata as Record<string, unknown> | undefined;
    const name = metadata?.full_name || metadata?.name;
    return typeof name === 'string' && name.trim() ? name.trim() : user?.email ?? null;
  }, [user]);

  const loadRecentTickets = useCallback(async () => {
    if (!activeCompanyId || !user?.id) {
      setRecentTickets([]);
      return;
    }

    setIsLoadingRecent(true);
    try {
      const tickets = await listMySupportTickets(activeCompanyId, user.id, 2);
      setRecentTickets(tickets);
    } catch (loadError) {
      console.warn('Unable to load recent support tickets', loadError);
    } finally {
      setIsLoadingRecent(false);
    }
  }, [activeCompanyId, user?.id]);

  useEffect(() => {
    if (isOpen) {
      void loadRecentTickets();
    }
  }, [isOpen, loadRecentTickets]);

  const handleOpenChange = (nextOpen: boolean) => {
    setIsOpen(nextOpen);
    if (!nextOpen) {
      setError(null);
    }
  };

  const handleOptionSelect = (option: SupportOption) => {
    setSelectedOption(option);
    setSuccessReference(null);
    setError(null);
  };

  const handleSubmit = async () => {
    const trimmedMessage = message.trim();

    if (!selectedOption) {
      setError('Choose the type of support you need.');
      return;
    }

    if (!trimmedMessage) {
      setError('Please describe your request before sending.');
      return;
    }

    if (!activeCompanyId || !user?.id) {
      setError('Select a workspace before sending a support request.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const ticket = await createSupportTicket({
        companyId: activeCompanyId,
        companyName: activeCompany?.name ?? undefined,
        createdByUserId: user.id,
        createdByName: userName ?? undefined,
        createdByEmail: user.email ?? undefined,
        category: selectedOption.category,
        subcategory: selectedOption.label,
        subject: selectedOption.label,
        description: trimmedMessage,
        priority: selectedOption.priority,
        source: 'assistant',
      });

      setSuccessReference(ticket.reference_number);
      setSelectedOption(null);
      setMessage('');
      await loadRecentTickets();
    } catch (submitError) {
      console.error('Unable to create support request', submitError);
      setError('We could not send your request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user?.id) {
    return null;
  }

  return (
    <>
      {isOpen && (
        <section
          className="fixed bottom-24 right-5 z-[60] flex max-h-[70vh] w-[calc(100vw-2.5rem)] max-w-[380px] flex-col overflow-hidden rounded-xl border border-surface-300 bg-white shadow-elevated"
          aria-label="Support chat panel"
        >
          <div className="flex items-center justify-between border-b border-surface-200 bg-surface-50 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-100 text-teal-700">
                <HeadphonesIcon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-surface-900">Support / Chat</h2>
                <p className="text-xs text-surface-500">Send a request to the admin team</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              className="rounded-full p-2 text-surface-500 transition hover:bg-surface-200 hover:text-surface-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
              aria-label="Close support chat"
            >
              <XIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="space-y-4 overflow-y-auto p-4">
            {!canSubmit && (
              <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <span>Select a workspace before creating a support request.</span>
              </div>
            )}

            {successReference && (
              <div className="flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                <CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <span>Your request has been sent. Reference: {successReference}</span>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm font-medium text-surface-800">How can we help?</p>
              <div className="grid gap-2">
                {SUPPORT_OPTIONS.map((option) => {
                  const isSelected = selectedOption?.label === option.label;
                  return (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => handleOptionSelect(option)}
                      className={`rounded-lg border px-3 py-2 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                        isSelected
                          ? 'border-teal-500 bg-teal-50 text-teal-800'
                          : 'border-surface-300 bg-white text-surface-700 hover:border-teal-300 hover:bg-teal-50/60'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedOption && (
              <div className="space-y-3 rounded-lg border border-surface-200 bg-surface-50 p-3">
                <label htmlFor="floating-support-message" className="text-sm font-medium text-surface-800">
                  Please describe your request
                </label>
                <textarea
                  id="floating-support-message"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={4}
                  className="w-full resize-none rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                  placeholder="Add the page, module, invoice note, or access details we should know about."
                />
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting || !canSubmit}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <SendIcon className="h-4 w-4" aria-hidden="true" />
                  {isSubmitting ? 'Sending...' : 'Send Request'}
                </button>
              </div>
            )}

            <div className="space-y-2 border-t border-surface-200 pt-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-surface-800">Recent requests</p>
                {isLoadingRecent && <span className="text-xs text-surface-500">Loading</span>}
              </div>
              {recentTickets.length > 0 ? (
                <div className="space-y-2">
                  {recentTickets.map((ticket) => (
                    <div key={ticket.id} className="rounded-lg border border-surface-200 bg-white p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-surface-900">{ticket.subject}</p>
                          <p className="text-xs text-surface-500">{ticket.reference_number}</p>
                        </div>
                        <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-surface-100 px-2 py-1 text-xs font-medium text-surface-600">
                          <ClockIcon className="h-3 w-3" aria-hidden="true" />
                          {formatSupportStatus(ticket.status)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-surface-500">
                  {canSubmit ? 'Your latest support requests will appear here.' : 'No workspace selected.'}
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={() => handleOpenChange(!isOpen)}
        className="fixed bottom-5 right-5 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-teal-700 text-white shadow-elevated transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
        aria-label={isOpen ? 'Close support chat' : 'Open support chat'}
        aria-expanded={isOpen}
      >
        {isOpen ? (
          <XIcon className="h-6 w-6" aria-hidden="true" />
        ) : (
          <MessageCircleIcon className="h-6 w-6" aria-hidden="true" />
        )}
      </button>
    </>
  );
}
