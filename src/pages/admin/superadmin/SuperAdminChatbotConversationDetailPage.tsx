import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useUser } from '@insforge/react';
import {
  ArrowLeftIcon,
  BotIcon,
  FileIcon,
  RefreshCwIcon,
  UserIcon
} from 'lucide-react';
import type { UUID } from '../../../api/models/entities';
import {
  getChatbotConversationWithMessages,
  updateChatbotConversation,
  type ChatbotConversationWithMessages
} from '../../../api/services/chatbotLogsService';
import {
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_STATUSES,
  formatSupportCategory,
  formatSupportPriority,
  formatSupportStatus,
  getSupportTicketWithThread,
  updateSupportTicketPriority,
  updateSupportTicketStatus,
  type SupportTicketPriority,
  type SupportTicketStatus
} from '../../../api/services/supportService';
import { LicenseActionPanel } from '../../../components/support/LicenseActionPanel';
import { ModuleAccessPanel } from '../../../components/support/ModuleAccessPanel';
import { SupportPriorityBadge, SupportStatusBadge } from '../../../components/support/SupportTicketBadges';
import { SupportTicketThread } from '../../../components/support/SupportTicketThread';

export function SuperAdminChatbotConversationDetailPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { user } = useUser();
  const [record, setRecord] = useState<ChatbotConversationWithMessages | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actorName = useMemo(() => {
    const metadata = (user as any)?.user_metadata ?? {};
    return metadata.full_name ?? metadata.name ?? user?.email ?? null;
  }, [user]);

  const load = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    setError(null);
    try {
      setRecord(await getChatbotConversationWithMessages(conversationId as UUID));
    } catch (err) {
      setError((err as Error)?.message ?? 'Failed to load chatbot conversation.');
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateConversationStatus = async (status: SupportTicketStatus) => {
    if (!record || !user?.id) return;
    setSaving(true);
    setError(null);
    try {
      if (record.ticketThread) {
        const ticket = await updateSupportTicketStatus({
          ticketId: record.ticketThread.ticket.id,
          status,
          actorUserId: user.id,
          actorName,
          notify: true
        });
        await updateChatbotConversation({ conversationId: record.conversation.id, status: ticket.status });
      } else {
        await updateChatbotConversation({ conversationId: record.conversation.id, status });
      }
      await load();
    } catch (err) {
      setError((err as Error)?.message ?? 'Failed to update status.');
    } finally {
      setSaving(false);
    }
  };

  const updatePriority = async (priority: SupportTicketPriority) => {
    if (!record || !user?.id) return;
    setSaving(true);
    setError(null);
    try {
      if (record.ticketThread) {
        const ticket = await updateSupportTicketPriority({
          ticketId: record.ticketThread.ticket.id,
          priority,
          actorUserId: user.id,
          actorName
        });
        await updateChatbotConversation({ conversationId: record.conversation.id, priority: ticket.priority });
      } else {
        await updateChatbotConversation({ conversationId: record.conversation.id, priority });
      }
      await load();
    } catch (err) {
      setError((err as Error)?.message ?? 'Failed to update priority.');
    } finally {
      setSaving(false);
    }
  };

  const ticket = record?.ticketThread?.ticket ?? record?.conversation.linked_ticket ?? null;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-surface-300 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link to="/super-admin/chatbot-logs" className="inline-flex items-center gap-2 text-sm font-medium text-teal hover:text-teal-800">
              <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
              Back to chatbot logs
            </Link>
            <h1 className="mt-3 text-2xl font-semibold text-charcoal">Chatbot Conversation</h1>
            <p className="mt-1 text-sm text-charcoal-500">Full transcript, linked ticket details, attachments, and admin actions.</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-surface-300 px-4 py-2 text-sm font-medium text-charcoal hover:bg-surface-50"
          >
            <RefreshCwIcon className="h-4 w-4" aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-critical/20 bg-critical/10 p-3 text-sm text-critical">{error}</div>}

      {loading && !record ? (
        <div className="rounded-lg border border-surface-300 bg-white p-6 text-sm text-charcoal-500">Loading conversation...</div>
      ) : record ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
          <div className="xl:col-span-2 space-y-4">
            <div className="rounded-lg border border-surface-300 bg-white p-5">
              <div className="flex flex-wrap items-center gap-2">
                <SupportStatusBadge status={ticket?.status ?? record.conversation.status} />
                <SupportPriorityBadge priority={ticket?.priority ?? record.conversation.priority} />
                {ticket && <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal">{ticket.reference_number}</span>}
              </div>
              <h2 className="mt-4 text-lg font-semibold text-charcoal">{record.conversation.selected_option ?? ticket?.subject ?? 'Support chat'}</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <InfoRow label="User" value={record.conversation.user_name ?? record.conversation.user_email ?? 'Unknown user'} />
                <InfoRow label="Email" value={record.conversation.user_email ?? 'Not captured'} />
                <InfoRow label="Organisation" value={record.conversation.company_name_snapshot ?? record.conversation.company_id} />
                <InfoRow label="Category" value={formatSupportCategory(ticket?.category ?? record.conversation.category)} />
                <InfoRow label="Created" value={new Date(record.conversation.created_at).toLocaleString()} />
                <InfoRow label="Last update" value={new Date(record.conversation.updated_at).toLocaleString()} />
              </dl>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-charcoal-500">Status</label>
                  <select
                    value={ticket?.status ?? record.conversation.status}
                    onChange={(event) => void updateConversationStatus(event.target.value as SupportTicketStatus)}
                    disabled={saving}
                    className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm"
                  >
                    {SUPPORT_TICKET_STATUSES.map((status) => <option key={status} value={status}>{formatSupportStatus(status)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-charcoal-500">Priority</label>
                  <select
                    value={ticket?.priority ?? record.conversation.priority}
                    onChange={(event) => void updatePriority(event.target.value as SupportTicketPriority)}
                    disabled={saving}
                    className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm"
                  >
                    {SUPPORT_TICKET_PRIORITIES.map((priority) => <option key={priority} value={priority}>{formatSupportPriority(priority)}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-surface-300 bg-white p-5">
              <h2 className="text-sm font-semibold text-charcoal">Attachments</h2>
              {record.ticketThread?.attachments.length ? (
                <div className="mt-3 space-y-2">
                  {record.ticketThread.attachments.map((attachment) => (
                    <div key={attachment.id} className="flex items-center gap-2 rounded-lg bg-surface-50 px-3 py-2 text-sm text-charcoal-600">
                      <FileIcon className="h-4 w-4 text-teal" aria-hidden="true" />
                      <span className="truncate">{attachment.original_filename ?? attachment.storage_key}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-charcoal-400">No attachments are linked to this conversation.</p>
              )}
            </div>

            {record.ticketThread && user?.id && (
              <>
                <LicenseActionPanel ticket={record.ticketThread.ticket} actorUserId={user.id} actorName={actorName} onProcessed={load} />
                <ModuleAccessPanel ticket={record.ticketThread.ticket} actorUserId={user.id} actorName={actorName} onProcessed={load} />
              </>
            )}
          </div>

          <div className="xl:col-span-3 space-y-4">
            <div className="rounded-lg border border-surface-300 bg-white p-5">
              <h2 className="text-lg font-semibold text-charcoal">Chat Transcript</h2>
              <div className="mt-4 max-h-[620px] space-y-3 overflow-y-auto rounded-lg bg-surface-50 p-4">
                {record.messages.length === 0 ? (
                  <p className="text-sm text-charcoal-400">No transcript messages were logged.</p>
                ) : record.messages.map((message) => {
                  const isUser = message.role === 'user';
                  return (
                    <div key={message.id} className={`flex items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
                      {!isUser && (
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-100 text-teal-700">
                          <BotIcon className="h-4 w-4" aria-hidden="true" />
                        </span>
                      )}
                      <div className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm shadow-sm ${isUser ? 'rounded-br-sm bg-teal-700 text-white' : 'rounded-bl-sm border border-surface-200 bg-white text-charcoal'}`}>
                        <p className="whitespace-pre-line">{message.body}</p>
                        <p className={`mt-2 text-[11px] ${isUser ? 'text-white/70' : 'text-charcoal-400'}`}>
                          {new Date(message.created_at).toLocaleString()} - {message.response_source}
                        </p>
                      </div>
                      {isUser && (
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-charcoal text-white">
                          <UserIcon className="h-4 w-4" aria-hidden="true" />
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {record.ticketThread && user?.id ? (
              <SupportTicketThread
                thread={record.ticketThread}
                currentUser={{
                  id: user.id,
                  name: actorName,
                  email: user.email ?? null,
                  role: 'super_admin'
                }}
                canAddInternalNote
                onChanged={async () => {
                  if (!record.ticketThread) return;
                  const refreshed = await getSupportTicketWithThread(record.ticketThread.ticket.id);
                  if (!refreshed) return;
                  setRecord((current) => current ? { ...current, ticketThread: refreshed, conversation: { ...current.conversation, linked_ticket: refreshed.ticket } } : current);
                }}
              />
            ) : (
              <div className="rounded-lg border border-surface-300 bg-white p-5 text-sm text-charcoal-500">
                This conversation has not been escalated into a support ticket yet. Status and priority can still be updated above.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-charcoal-400">{label}</dt>
      <dd className="text-right font-medium text-charcoal">{value}</dd>
    </div>
  );
}
