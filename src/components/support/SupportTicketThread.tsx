import { useState } from 'react';
import { FileIcon, LockIcon, SendIcon } from 'lucide-react';
import {
  addInternalSupportNote,
  replyToSupportTicket,
  type SupportMessageRole,
  type SupportTicketAttachment,
  type SupportTicketMessage,
  type SupportTicketWithThread
} from '../../api/services/supportService';
import type { UUID } from '../../api/models/entities';
import { SupportAttachmentUploader } from './SupportAttachmentUploader';

type Props = {
  thread: SupportTicketWithThread;
  currentUser: {
    id: UUID;
    name?: string | null;
    email?: string | null;
    role: SupportMessageRole;
  };
  canAddInternalNote?: boolean;
  onChanged: () => void;
};

export function SupportTicketThread({ thread, currentUser, canAddInternalNote = false, onChanged }: Props) {
  const [reply, setReply] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitReply = async () => {
    if (!reply.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await replyToSupportTicket({
        ticketId: thread.ticket.id,
        companyId: thread.ticket.company_id,
        actorUserId: currentUser.id,
        actorName: currentUser.name,
        actorEmail: currentUser.email,
        actorRole: currentUser.role,
        body: reply
      });
      setReply('');
      onChanged();
    } catch (err) {
      setError((err as Error)?.message ?? 'Failed to send reply.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitNote = async () => {
    if (!note.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await addInternalSupportNote({
        ticketId: thread.ticket.id,
        companyId: thread.ticket.company_id,
        actorUserId: currentUser.id,
        actorName: currentUser.name,
        actorEmail: currentUser.email,
        actorRole: 'super_admin',
        body: note
      });
      setNote('');
      onChanged();
    } catch (err) {
      setError((err as Error)?.message ?? 'Failed to add note.');
    } finally {
      setSubmitting(false);
    }
  };

  const attachmentsByMessage = new Map<string, SupportTicketAttachment[]>();
  for (const attachment of thread.attachments) {
    if (!attachment.message_id) continue;
    const list = attachmentsByMessage.get(attachment.message_id) ?? [];
    list.push(attachment);
    attachmentsByMessage.set(attachment.message_id, list);
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-surface-300 rounded-lg p-4">
        <h2 className="text-lg font-semibold text-charcoal">Conversation</h2>
        <div className="mt-4 space-y-3">
          {thread.messages.map((message: SupportTicketMessage) => (
            <div
              key={message.id}
              className={`rounded-lg border p-3 ${
                message.is_internal_note
                  ? 'border-amber-200 bg-amber-50'
                  : message.sender_role === 'super_admin' || message.sender_role === 'support'
                    ? 'border-teal-200 bg-teal-50'
                    : 'border-surface-200 bg-surface-50'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-charcoal">{message.sender_name || message.sender_email || 'Support user'}</p>
                {message.is_internal_note && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                    <LockIcon className="w-3 h-3" />
                    Internal
                  </span>
                )}
                <span className="text-xs text-charcoal-400">{new Date(message.created_at).toLocaleString()}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-charcoal-600">{message.body}</p>
              {(attachmentsByMessage.get(message.id) ?? []).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {(attachmentsByMessage.get(message.id) ?? []).map((attachment) => (
                    <span key={attachment.id} className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs text-charcoal-500 border border-surface-200">
                      <FileIcon className="w-3 h-3" />
                      {attachment.original_filename ?? 'Attachment'}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {thread.attachments.filter((attachment) => !attachment.message_id).length > 0 && (
        <div className="bg-white border border-surface-300 rounded-lg p-4">
          <h3 className="font-semibold text-charcoal">Ticket attachments</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {thread.attachments.filter((attachment) => !attachment.message_id).map((attachment) => (
              <span key={attachment.id} className="inline-flex items-center gap-2 rounded-lg border border-surface-200 px-3 py-2 text-sm text-charcoal-600">
                <FileIcon className="w-4 h-4 text-teal" />
                {attachment.original_filename ?? 'Attachment'}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border border-surface-300 rounded-lg p-4">
        <label className="block text-sm font-semibold text-charcoal mb-2">Reply</label>
        <textarea
          value={reply}
          onChange={(event) => setReply(event.target.value)}
          rows={4}
          className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
          placeholder="Write a reply..."
        />
        <div className="mt-3 flex flex-col gap-3">
          <SupportAttachmentUploader
            ticketId={thread.ticket.id}
            companyId={thread.ticket.company_id}
            userId={currentUser.id}
            onUploaded={onChanged}
          />
          <button
            type="button"
            disabled={submitting || !reply.trim()}
            onClick={submitReply}
            className="inline-flex w-fit items-center gap-2 rounded-lg bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            <SendIcon className="w-4 h-4" />
            Reply
          </button>
        </div>
      </div>

      {canAddInternalNote && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <label className="block text-sm font-semibold text-amber-900 mb-2">Internal note</label>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            className="w-full rounded-lg border border-amber-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            placeholder="Visible to super admins only"
          />
          <button
            type="button"
            disabled={submitting || !note.trim()}
            onClick={submitNote}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            <LockIcon className="w-4 h-4" />
            Add internal note
          </button>
        </div>
      )}

      {error && <p className="text-sm text-critical">{error}</p>}
    </div>
  );
}
