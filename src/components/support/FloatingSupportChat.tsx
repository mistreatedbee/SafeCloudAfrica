import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircleIcon,
  BotIcon,
  CheckCircleIcon,
  ClockIcon,
  FileIcon,
  HeadphonesIcon,
  Loader2Icon,
  MessageCircleIcon,
  PaperclipIcon,
  SendIcon,
  UserIcon,
  XIcon,
} from 'lucide-react';
import { useUser } from '@insforge/react';

import { useTenant } from '../../tenant/TenantContext';
import {
  createSupportTicket,
  formatSupportStatus,
  listMySupportTickets,
  uploadSupportAttachment,
  type SupportTicket,
  type SupportTicketCategory,
  type SupportTicketPriority,
} from '../../api/services/supportService';
import {
  askSupportAssistant,
  getRuleBasedSupportAssistantResponse,
  type SupportAssistantMessage,
  type SupportAssistantAiResponse,
} from '../../api/services/supportAssistantAiService';

type ChatRole = 'bot' | 'user';

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

type SupportOption = {
  key: string;
  label: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  prompts: string[];
  openingReply: string;
};

type PendingFile = {
  id: string;
  file: File;
  error?: string;
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const ACCEPTED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.pdf', '.doc', '.docx', '.xls', '.xlsx'];

const SUPPORT_OPTIONS: SupportOption[] = [
  {
    key: 'technical_issue',
    label: 'Report a system issue',
    category: 'technical_issue',
    priority: 'high',
    prompts: ['Which module or page has the issue?', 'Please describe what happened.', 'Can you upload a screenshot?'],
    openingReply: 'I can help capture the technical details before this goes to support.'
  },
  {
    key: 'renew_license',
    label: 'Renew license',
    category: 'license_subscription',
    priority: 'high',
    prompts: ['Which organisation is this for?', 'Do you want to renew the current plan or request an upgrade?', 'Would you like admin to contact you?'],
    openingReply: 'License renewals need admin review. I’ll collect the details for a faster response.'
  },
  {
    key: 'module_access',
    label: 'Request module access',
    category: 'module_access',
    priority: 'medium',
    prompts: ['Which module would you like to unlock?', 'What is the reason for the request?'],
    openingReply: 'Module access must be approved by an administrator. Let’s capture what you need.'
  },
  {
    key: 'contact_admin',
    label: 'Contact admin',
    category: 'user_organisation_access',
    priority: 'medium',
    prompts: ['What should the administrator help with?', 'Who or what is affected?'],
    openingReply: 'Sure. Tell me what the administrator should review.'
  },
  {
    key: 'document_help',
    label: 'Upload/document help',
    category: 'document_compliance_help',
    priority: 'medium',
    prompts: ['Are you having trouble uploading, editing, or finding a document?', 'Which document or module is affected?'],
    openingReply: 'I can guide you through common document issues or send the details to support.'
  },
  {
    key: 'login_help',
    label: 'Account/login help',
    category: 'user_organisation_access',
    priority: 'high',
    prompts: ['Are you unable to log in, getting an invalid token, or need a password reset?', 'Which email or user is affected?'],
    openingReply: 'Login and account issues can block work, so I’ll help capture this clearly.'
  },
  {
    key: 'other',
    label: 'Other',
    category: 'general_query',
    priority: 'medium',
    prompts: ['What do you need help with?', 'Any extra context the administrator should know?'],
    openingReply: 'No problem. Share the details and I’ll help route it.'
  },
];

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'bot',
  content: 'Hi, how can I help you today?'
};

function createMessage(role: ChatRole, content: string): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content
  };
}

function fileIsAllowed(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  return ACCEPTED_TYPES.includes(file.type) || ACCEPTED_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

function formatFileSize(size: number): string {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function mapChatMessages(messages: ChatMessage[]): SupportAssistantMessage[] {
  return messages
    .filter((message) => message.id !== 'welcome')
    .map((message) => ({
      role: message.role === 'user' ? 'user' : 'assistant',
      content: message.content
    }));
}

function latestUserText(messages: ChatMessage[]): string {
  return [...messages].reverse().find((message) => message.role === 'user')?.content ?? '';
}

export function FloatingSupportChat() {
  const { activeCompanyId, activeCompany, activeRole } = useTenant();
  const { user } = useUser();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [inputValue, setInputValue] = useState('');
  const [selectedOption, setSelectedOption] = useState<SupportOption | null>(null);
  const [guidedAnswers, setGuidedAnswers] = useState<string[]>([]);
  const [promptIndex, setPromptIndex] = useState(0);
  const [lastAssistantResponse, setLastAssistantResponse] = useState<SupportAssistantAiResponse | null>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [recentTickets, setRecentTickets] = useState<SupportTicket[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successReference, setSuccessReference] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const canUseSupport = Boolean(activeCompanyId && user?.id);

  const userName = useMemo(() => {
    const metadata = user?.user_metadata as Record<string, unknown> | undefined;
    const name = metadata?.full_name || metadata?.name;
    return typeof name === 'string' && name.trim() ? name.trim() : user?.email ?? null;
  }, [user]);

  const validFiles = useMemo(() => pendingFiles.filter((item) => !item.error), [pendingFiles]);

  const addBotMessage = useCallback((content: string) => {
    setMessages((current) => [...current, createMessage('bot', content)]);
  }, []);

  const addUserMessage = useCallback((content: string) => {
    setMessages((current) => [...current, createMessage('user', content)]);
  }, []);

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isTyping]);

  const runAssistant = useCallback(async (nextMessages: ChatMessage[], option: SupportOption | null) => {
    setIsTyping(true);
    try {
      const response = canUseSupport
        ? await askSupportAssistant({
          messages: mapChatMessages(nextMessages),
          selectedOption: option?.label ?? null,
          companyName: activeCompany?.name ?? null,
          role: activeRole ?? null,
          recentTickets
        })
        : getRuleBasedSupportAssistantResponse(latestUserText(nextMessages));
      setLastAssistantResponse(response);
      setMessages((current) => [...current, createMessage('bot', response.reply)]);
    } finally {
      setIsTyping(false);
    }
  }, [activeCompany?.name, activeRole, canUseSupport, recentTickets]);

  const handleOpenChange = (nextOpen: boolean) => {
    setIsOpen(nextOpen);
    if (!nextOpen) {
      setError(null);
    }
  };

  const handleOptionSelect = (option: SupportOption) => {
    setSelectedOption(option);
    setGuidedAnswers([]);
    setPromptIndex(0);
    setLastAssistantResponse({
      reply: option.openingReply,
      suggestedCategory: option.category,
      suggestedPriority: option.priority,
      shouldEscalate: true,
      quickActions: ['Send to administrator', 'Add more details']
    });
    setSuccessReference(null);
    setError(null);
    const nextMessages = [
      ...messages,
      createMessage('user', option.label),
      createMessage('bot', `${option.openingReply}\n\n${option.prompts[0]}`)
    ];
    setMessages(nextMessages);
  };

  const handleFileChange = (files: FileList | null) => {
    if (!files) return;
    const items = Array.from(files).map((file) => {
      let error: string | undefined;
      if (!fileIsAllowed(file)) error = 'Unsupported file type.';
      if (file.size > MAX_FILE_SIZE) error = 'File is larger than 10 MB.';
      return {
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        error
      };
    });
    setPendingFiles((current) => [...current, ...items].slice(-5));
  };

  const removePendingFile = (id: string) => {
    setPendingFiles((current) => current.filter((item) => item.id !== id));
  };

  const handleSubmitMessage = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isTyping || isSubmitting) return;

    setInputValue('');
    setSuccessReference(null);
    setError(null);

    const userMessage = createMessage('user', trimmed);
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);

    if (selectedOption && promptIndex < selectedOption.prompts.length) {
      const nextAnswers = [...guidedAnswers, trimmed];
      setGuidedAnswers(nextAnswers);
      const nextPromptIndex = promptIndex + 1;
      setPromptIndex(nextPromptIndex);

      if (nextPromptIndex < selectedOption.prompts.length) {
        setTimeout(() => {
          addBotMessage(selectedOption.prompts[nextPromptIndex]);
        }, 250);
        return;
      }

      const readyMessage = createMessage(
        'bot',
        'Thanks, I have enough detail to send this to the administrator. You can add more information, attach files, or send it now.'
      );
      setMessages((current) => [...current, readyMessage]);
      setLastAssistantResponse({
        reply: readyMessage.content,
        suggestedCategory: selectedOption.category,
        suggestedPriority: selectedOption.priority,
        shouldEscalate: true,
        quickActions: ['Send to administrator', 'Add more details']
      });
      return;
    }

    await runAssistant(nextMessages, selectedOption);
  };

  const buildTicketDescription = () => {
    const transcript = messages
      .filter((message) => message.id !== 'welcome')
      .map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}`)
      .join('\n\n');
    const guided = selectedOption?.prompts
      .map((prompt, index) => {
        const answer = guidedAnswers[index];
        return answer ? `${prompt}\n${answer}` : null;
      })
      .filter(Boolean)
      .join('\n\n');
    const attachments = validFiles.map((item) => item.file.name).join(', ');
    const latestText = latestUserText(messages);

    return [
      `Support type: ${selectedOption?.label ?? 'AI assisted support request'}`,
      guided ? `Guided answers:\n${guided}` : null,
      latestText ? `Latest user message:\n${latestText}` : null,
      transcript ? `Conversation summary:\n${transcript}` : null,
      attachments ? `Pending attachments:\n${attachments}` : null
    ].filter(Boolean).join('\n\n');
  };

  const handleEscalate = async () => {
    if (!activeCompanyId || !user?.id) {
      addBotMessage('Please sign in and select a workspace before I send this to the administrator.');
      return;
    }

    const category = selectedOption?.category ?? lastAssistantResponse?.suggestedCategory ?? 'general_query';
    const priority = selectedOption?.priority ?? lastAssistantResponse?.suggestedPriority ?? 'medium';
    const subject = selectedOption?.label ?? 'Support chat request';
    const description = buildTicketDescription();

    setIsSubmitting(true);
    setError(null);

    try {
      const ticket = await createSupportTicket({
        companyId: activeCompanyId,
        companyName: activeCompany?.name ?? undefined,
        createdByUserId: user.id,
        createdByName: userName ?? undefined,
        createdByEmail: user.email ?? undefined,
        category,
        subcategory: selectedOption?.label ?? 'AI assisted chat',
        subject,
        description,
        priority,
        source: 'assistant',
      });

      let failedAttachmentCount = 0;
      for (const pending of validFiles) {
        try {
          await uploadSupportAttachment({
            ticketId: ticket.id,
            companyId: ticket.company_id,
            file: pending.file,
            uploadedByUserId: user.id
          });
        } catch (uploadError) {
          failedAttachmentCount += 1;
          console.warn('Support attachment upload failed', uploadError);
        }
      }

      setSuccessReference(ticket.reference_number);
      addBotMessage(
        failedAttachmentCount > 0
          ? `I've sent this to the administrator for review. Reference: ${ticket.reference_number}. ${failedAttachmentCount} attachment${failedAttachmentCount === 1 ? '' : 's'} could not be uploaded.`
          : `I've sent this to the administrator for review. Reference: ${ticket.reference_number}`
      );
      setPendingFiles((current) => failedAttachmentCount > 0 ? current : []);
      setSelectedOption(null);
      setGuidedAnswers([]);
      setPromptIndex(0);
      await loadRecentTickets();
    } catch (submitError) {
      console.error('Unable to create support request', submitError);
      setError('We could not send your request. Please try again.');
      addBotMessage('I could not send this request yet. Please try again in a moment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickAction = async (action: string) => {
    const normalized = action.toLowerCase();
    if (normalized.includes('send') || normalized.includes('contact admin') || normalized.includes('administrator')) {
      await handleEscalate();
      return;
    }
    if (normalized.includes('try again')) {
      setSelectedOption(null);
      setGuidedAnswers([]);
      setPromptIndex(0);
      setLastAssistantResponse(null);
      addBotMessage('No problem. Tell me what you need help with, or choose one of the quick options.');
      return;
    }
    addUserMessage(action);
    await runAssistant([...messages, createMessage('user', action)], selectedOption);
  };

  const showQuickOptions = !selectedOption && !isTyping && !isSubmitting;
  const activeQuickActions = lastAssistantResponse?.quickActions ?? [];

  return (
    <>
      {isOpen && (
        <section
          className="fixed bottom-24 right-5 z-[60] flex max-h-[76vh] w-[calc(100vw-2.5rem)] max-w-[410px] flex-col overflow-hidden rounded-2xl border border-surface-300 bg-white shadow-elevated"
          aria-label="Support chat panel"
        >
          <div className="flex items-center justify-between border-b border-surface-200 bg-gradient-to-r from-teal-700 to-charcoal px-4 py-3 text-white">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white">
                <HeadphonesIcon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-sm font-semibold">Support / Chat</h2>
                <p className="text-xs text-white/75">AI guidance with admin handoff</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              className="rounded-full p-2 text-white/75 transition hover:bg-white/15 hover:text-white focus:outline-none focus:ring-2 focus:ring-white"
              aria-label="Close support chat"
            >
              <XIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-surface-50 p-4">
              {!canUseSupport && (
                <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <AlertCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                  <span>
                    {user?.id
                      ? 'Select a workspace before creating a support request.'
                      : 'Sign in and select a workspace to use AI support and submit requests.'}
                  </span>
                </div>
              )}

              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex items-end gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {message.role === 'bot' && (
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700">
                      <BotIcon className="h-4 w-4" aria-hidden="true" />
                    </span>
                  )}
                  <div
                    className={`max-w-[82%] whitespace-pre-line rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm ${
                      message.role === 'user'
                        ? 'rounded-br-sm bg-teal-700 text-white'
                        : 'rounded-bl-sm border border-surface-200 bg-white text-charcoal'
                    }`}
                  >
                    {message.content}
                  </div>
                  {message.role === 'user' && (
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-charcoal text-white">
                      <UserIcon className="h-4 w-4" aria-hidden="true" />
                    </span>
                  )}
                </div>
              ))}

              {isTyping && (
                <div className="flex items-center gap-2 text-sm text-charcoal-500">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-100 text-teal-700">
                    <BotIcon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-2 shadow-sm">
                    <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Thinking
                  </span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="space-y-3 border-t border-surface-200 bg-white p-4">
              {successReference && (
                <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  <CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                  <span>Request sent. Reference: {successReference}</span>
                </div>
              )}

              {showQuickOptions && (
                <div className="flex flex-wrap gap-2">
                  {SUPPORT_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => handleOptionSelect(option)}
                      className="rounded-full border border-surface-300 bg-white px-3 py-1.5 text-xs font-medium text-charcoal transition hover:border-teal-400 hover:bg-teal-50 hover:text-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}

              {activeQuickActions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {activeQuickActions.map((action) => (
                    <button
                      key={action}
                      type="button"
                      onClick={() => void handleQuickAction(action)}
                      disabled={isSubmitting || isTyping}
                      className="rounded-full bg-surface-100 px-3 py-1.5 text-xs font-medium text-charcoal transition hover:bg-surface-200 disabled:opacity-50"
                    >
                      {action}
                    </button>
                  ))}
                </div>
              )}

              {pendingFiles.length > 0 && (
                <div className="space-y-2">
                  {pendingFiles.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${
                        item.error ? 'border-critical/30 bg-critical/10 text-critical' : 'border-surface-200 bg-surface-50 text-charcoal-600'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <FileIcon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                        <span className="truncate">{item.file.name}</span>
                        <span className="flex-shrink-0 text-charcoal-400">{formatFileSize(item.file.size)}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => removePendingFile(item.id)}
                        className="rounded-full p-1 hover:bg-white"
                        aria-label={`Remove ${item.file.name}`}
                      >
                        <XIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      {item.error && <span className="basis-full">{item.error}</span>}
                    </div>
                  ))}
                </div>
              )}

              {error && <p className="text-sm text-critical">{error}</p>}

              <div className="flex items-end gap-2">
                <label className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-surface-300 text-charcoal-500 transition hover:bg-surface-50 hover:text-teal-700">
                  <PaperclipIcon className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">Attach files</span>
                  <input
                    type="file"
                    multiple
                    accept={ACCEPTED_EXTENSIONS.join(',')}
                    onChange={(event) => {
                      handleFileChange(event.target.files);
                      event.target.value = '';
                    }}
                    className="hidden"
                  />
                </label>
                <textarea
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void handleSubmitMessage();
                    }
                  }}
                  rows={1}
                  className="max-h-24 min-h-10 flex-1 resize-none rounded-xl border border-surface-300 bg-white px-3 py-2 text-sm text-charcoal placeholder:text-charcoal-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                  placeholder={canUseSupport ? 'Type your question or details...' : 'Sign in to submit a support request'}
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => void handleSubmitMessage()}
                  disabled={!inputValue.trim() || isSubmitting || isTyping}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-700 text-white transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Send message"
                >
                  <SendIcon className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <div className="border-t border-surface-100 pt-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-charcoal-600">Recent requests</p>
                  {isLoadingRecent && <span className="text-xs text-charcoal-400">Loading</span>}
                </div>
                {recentTickets.length > 0 ? (
                  <div className="mt-2 grid gap-2">
                    {recentTickets.map((ticket) => (
                      <div key={ticket.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-50 px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-charcoal">{ticket.subject}</p>
                          <p className="text-xs text-charcoal-400">{ticket.reference_number}</p>
                        </div>
                        <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-white px-2 py-1 text-xs font-medium text-charcoal-500">
                          <ClockIcon className="h-3 w-3" aria-hidden="true" />
                          {formatSupportStatus(ticket.status)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-charcoal-400">
                    {canUseSupport ? 'Your latest support requests will appear here.' : 'Sign in to view your requests.'}
                  </p>
                )}
              </div>
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
