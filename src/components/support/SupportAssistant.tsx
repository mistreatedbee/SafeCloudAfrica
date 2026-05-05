import { useMemo, useState } from 'react';
import { BotIcon, CheckCircleIcon, MessageSquareIcon, SendIcon } from 'lucide-react';
import {
  createSupportTicketFromAssistant,
  type SupportTicket,
  type SupportTicketCategory,
  type SupportTicketPriority
} from '../../api/services/supportService';
import type { UUID } from '../../api/models/entities';

type AssistantOption = {
  key: string;
  label: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  prompts: string[];
};

const options: AssistantOption[] = [
  {
    key: 'renew_license',
    label: 'Renew license',
    category: 'license_subscription',
    priority: 'high',
    prompts: ['Which organisation?', 'Current license/package?', 'Preferred renewal period?', 'Any invoice/payment notes?']
  },
  {
    key: 'unlock_module',
    label: 'Unlock a module',
    category: 'module_access',
    priority: 'medium',
    prompts: ['Which module do you want to unlock?', 'Reason for request?', 'Number of users/sites affected?']
  },
  {
    key: 'technical_issue',
    label: 'Report a technical issue',
    category: 'technical_issue',
    priority: 'high',
    prompts: ['Which page/module has the issue?', 'What happened?', 'How severe is the impact?']
  },
  {
    key: 'admin_support',
    label: 'Request support from admin',
    category: 'user_organisation_access',
    priority: 'medium',
    prompts: ['What admin action do you need?', 'Who is affected?', 'Any access or permission details?']
  },
  {
    key: 'billing',
    label: 'Ask about billing',
    category: 'license_subscription',
    priority: 'medium',
    prompts: ['What billing question do you have?', 'Which invoice/payment does it relate to?', 'Any deadline or notes?']
  },
  {
    key: 'super_admin',
    label: 'Contact super admin',
    category: 'general_query',
    priority: 'high',
    prompts: ['What should the super admin help with?', 'Which organisation/site is affected?', 'Any additional context?']
  },
  {
    key: 'other',
    label: 'Other',
    category: 'general_query',
    priority: 'medium',
    prompts: ['What do you need help with?', 'Who or what is affected?', 'Any additional details?']
  }
];

type Props = {
  companyId: UUID;
  companyName?: string | null;
  userId: UUID;
  userName?: string | null;
  userEmail?: string | null;
  onCreated?: (ticket: SupportTicket) => void;
};

export function SupportAssistant({ companyId, companyName, userId, userName, userEmail, onCreated }: Props) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [createdTicket, setCreatedTicket] = useState<SupportTicket | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(() => options.find((option) => option.key === selectedKey) ?? null, [selectedKey]);
  const ready = selected ? selected.prompts.every((prompt) => answers[prompt]?.trim()) : false;

  const submit = async () => {
    if (!selected || !ready) return;
    setSubmitting(true);
    setError(null);
    try {
      const detail = selected.prompts
        .map((prompt) => `${prompt}\n${answers[prompt].trim()}`)
        .join('\n\n');
      const ticket = await createSupportTicketFromAssistant({
        companyId,
        companyName,
        createdByUserId: userId,
        createdByName: userName,
        createdByEmail: userEmail,
        category: selected.category,
        subcategory: selected.label,
        subject: selected.label,
        description: detail,
        priority: selected.priority
      });
      setCreatedTicket(ticket);
      onCreated?.(ticket);
    } catch (err) {
      setError((err as Error)?.message ?? 'Failed to create support ticket.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-surface-300 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal">
          <BotIcon className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-charcoal">Guided Support Assistant</h2>
          <p className="mt-1 text-sm text-charcoal-500">How can we help you today?</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => {
              setSelectedKey(option.key);
              setCreatedTicket(null);
              setAnswers({});
            }}
            className={`rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${
              selectedKey === option.key ? 'border-teal bg-teal-50 text-teal' : 'border-surface-300 text-charcoal hover:bg-surface-50'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {selected && !createdTicket && (
        <div className="mt-5 space-y-3">
          {selected.prompts.map((prompt) => (
            <div key={prompt}>
              <label className="block text-sm font-medium text-charcoal mb-1">{prompt}</label>
              <input
                value={answers[prompt] ?? ''}
                onChange={(event) => setAnswers((prev) => ({ ...prev, [prompt]: event.target.value }))}
                className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>
          ))}
          <button
            type="button"
            disabled={!ready || submitting}
            onClick={submit}
            className="inline-flex items-center gap-2 rounded-lg bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            <SendIcon className="w-4 h-4" />
            {submitting ? 'Sending...' : 'Send to administrator'}
          </button>
        </div>
      )}

      {createdTicket && (
        <div className="mt-5 rounded-lg border border-success-200 bg-success-50 p-4">
          <div className="flex items-start gap-2 text-success">
            <CheckCircleIcon className="w-5 h-5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Your request has been sent to the administrator.</p>
              <p className="mt-1 text-sm">Reference: {createdTicket.reference_number}</p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-critical/20 bg-critical/10 p-3 text-sm text-critical">
          <MessageSquareIcon className="w-4 h-4" />
          {error}
        </div>
      )}
    </div>
  );
}
