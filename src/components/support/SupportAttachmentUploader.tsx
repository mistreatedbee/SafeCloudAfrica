import { useState } from 'react';
import { PaperclipIcon, UploadIcon } from 'lucide-react';
import { uploadSupportAttachment, type SupportTicketAttachment } from '../../api/services/supportService';
import type { UUID } from '../../api/models/entities';

type Props = {
  ticketId: UUID;
  companyId: UUID;
  messageId?: UUID | null;
  userId: UUID;
  onUploaded?: (attachment: SupportTicketAttachment) => void;
};

export function SupportAttachmentUploader({ ticketId, companyId, messageId, userId, onUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const attachment = await uploadSupportAttachment({
        ticketId,
        companyId,
        messageId,
        file,
        uploadedByUserId: userId
      });
      setFile(null);
      onUploaded?.(attachment);
    } catch (err) {
      setError((err as Error)?.message ?? 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-lg border border-dashed border-surface-300 p-3">
      <label className="flex items-center gap-2 text-sm font-medium text-charcoal">
        <PaperclipIcon className="w-4 h-4 text-teal" />
        Attachment
      </label>
      <div className="mt-2 flex flex-col sm:flex-row gap-2">
        <input
          type="file"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="block w-full text-sm text-charcoal file:mr-3 file:rounded-lg file:border-0 file:bg-surface-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-charcoal"
        />
        <button
          type="button"
          disabled={!file || uploading}
          onClick={upload}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          <UploadIcon className="w-4 h-4" />
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-critical">{error}</p>}
    </div>
  );
}
