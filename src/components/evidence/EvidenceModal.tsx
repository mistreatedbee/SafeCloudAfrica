import React, { useMemo, useRef, useState } from 'react';
import { XIcon, UploadIcon, EyeIcon, DownloadIcon, Trash2Icon, CheckCircleIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { EvidenceAttachment, UUID } from '../../api/models/entities';
import { createEvidence, deleteEvidence, listEvidence } from '../../api/services/evidenceService';
import { downloadBlob, downloadDocumentFile, openBlobInNewTab } from '../../api/services/documentsStorageService';
import { insforge } from '../../api/insforge/client';
import { useAsync } from '../../api/hooks/useAsync';
import { ListEmptyState } from '../ui/ListEmptyState';

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

export const EVIDENCE_BUCKET = 'sca-evidence';

export function EvidenceModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  actorUserId: UUID;
  entityType: string;
  entityId: UUID;
  title?: string;
  onUploaded?: (items: EvidenceAttachment[]) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploadTitle, setUploadTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [removingId, setRemovingId] = useState<UUID | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hasEntityContext = Boolean(props.open && props.companyId && props.entityType && props.entityId);

  const { data, loading: listLoading } = useAsync<EvidenceAttachment[]>(
    async () => {
      if (!hasEntityContext) return [];
      return listEvidence(props.companyId, { entityType: props.entityType, entityId: props.entityId, limit: 200 });
    },
    [hasEntityContext, props.companyId, props.entityType, props.entityId, refreshKey]
  );
  const evidence = data ?? [];

  const canUpload = useMemo(() => hasEntityContext && files.length > 0, [files, hasEntityContext]);

  async function upload() {
    if (files.length === 0 || !hasEntityContext) return;
    setError(null);
    try {
      setLoading(true);
      const createdItems: EvidenceAttachment[] = [];
      for (const file of files) {
        const key = `${props.companyId}/${props.entityType}/${props.entityId}/${Date.now()}-${file.name}`.replace(/\s+/g, '_');
        const { data: uploaded, error: upErr } = await insforge.storage.from(EVIDENCE_BUCKET).upload(key, file);
        if (upErr) throw upErr;
        const created = await createEvidence({
          companyId: props.companyId,
          entityType: props.entityType,
          entityId: props.entityId,
          title: files.length === 1 ? uploadTitle.trim() || file.name : file.name,
          displayTitle: files.length === 1 ? uploadTitle.trim() || file.name : file.name,
          originalFilename: file.name,
          fileKind: file.type.startsWith('image/') ? 'image' : 'document',
          storageBucket: EVIDENCE_BUCKET,
          storageKey: uploaded?.path ?? key,
          createdByUserId: props.actorUserId
        });
        createdItems.push(created);
      }
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setUploadTitle('');
      setRefreshKey((k) => k + 1);
      props.onUploaded?.(createdItems);
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  async function remove(item: EvidenceAttachment) {
    if (!window.confirm('Remove this evidence file? This cannot be undone.')) return;
    setError(null);
    try {
      setRemovingId(item.id);
      await deleteEvidence(item.id, {
        companyId: props.companyId,
        actorUserId: props.actorUserId,
        storageBucket: item.storage_bucket,
        storageKey: item.storage_key,
        entityType: props.entityType
      });
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setRemovingId(null);
    }
  }

  if (!props.open) return null;

  const selectedFileNames = files.map((item) => item.name);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90dvh] overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <div>
            <p className="text-sm font-semibold text-charcoal">{props.title ?? 'Evidence'}</p>
            <p className="text-xs text-charcoal-500 mt-0.5">Upload and view evidence files linked to this record.</p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-surface-100 text-charcoal-500 shrink-0"
            aria-label="Close"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
              <p className="text-sm font-semibold text-critical">Evidence action failed</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-charcoal mb-1.5">Title (optional)</label>
              <input
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder="e.g. Compliance certificate, photo, signed document"
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">File</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp,.gif"
                multiple
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                className="w-full text-sm"
              />
            </div>
            <div className="sm:col-span-3 flex justify-end gap-2">
              <button
                type="button"
                disabled={!canUpload || loading}
                onClick={() => void upload()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? <LoadingSpinner size={16} /> : <UploadIcon className="w-4 h-4" />}
                Upload evidence
              </button>
              <button
                type="button"
                onClick={props.onClose}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-300 text-charcoal text-sm font-semibold hover:bg-surface-50"
              >
                Done
              </button>
            </div>
            {selectedFileNames.length > 0 && (
              <div className="sm:col-span-3 rounded-lg border border-teal/20 bg-teal/5 px-3 py-2 text-xs text-teal-800">
                Selected files: {selectedFileNames.join(', ')}
              </div>
            )}
            {evidence.length > 0 && (
              <div className="sm:col-span-3 flex items-center gap-2 rounded-lg border border-teal/20 bg-teal/5 px-3 py-2 text-xs text-teal-800">
                <CheckCircleIcon className="w-4 h-4 shrink-0" />
                {evidence.length} file{evidence.length === 1 ? '' : 's'} attached
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-surface-300 overflow-hidden">
            <div className="px-4 py-3 border-b border-surface-200 flex items-center justify-between">
              <p className="text-sm font-semibold text-charcoal">Files</p>
              <p className="text-xs text-charcoal-500">{evidence.length} item(s)</p>
            </div>
            <div className="divide-y divide-surface-100">
              {listLoading && (
                <div className="px-4 py-3">
                  <p className="text-sm text-charcoal-500">Loading…</p>
                </div>
              )}
              {!listLoading && evidence.length === 0 && (
                <ListEmptyState
                  embedded
                  className="px-4"
                  icon={UploadIcon}
                  title="No evidence yet"
                  description="Add a file (photo, certificate, PDF) to keep an auditable trail linked to this record."
                  primaryAction={{
                    kind: 'button',
                    label: 'Choose file',
                    onClick: () => fileInputRef.current?.click()
                  }}
                  secondaryAction={{
                    kind: 'button',
                    label: 'Refresh',
                    onClick: () => setRefreshKey((k) => k + 1)
                  }}
                />
              )}
              {evidence.map((evi) => (
                <EvidenceRow key={evi.id} item={evi} onRemove={remove} removing={removingId === evi.id} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EvidenceRow({ item, onRemove, removing }: { item: EvidenceAttachment; onRemove: (item: EvidenceAttachment) => void; removing: boolean }) {
  const filename = item.storage_key.split('/').pop() ?? 'evidence';
  return (
    <div className="px-4 py-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-charcoal truncate">{item.title ?? filename}</p>
        <p className="text-xs text-charcoal-400 mt-0.5">
          {new Date(item.created_at).toLocaleString('en-ZA')} • Uploaded by User {shortId(item.created_by_user_id)}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={async () => {
            const blob = await downloadDocumentFile({ bucket: item.storage_bucket, key: item.storage_key });
            openBlobInNewTab(blob);
          }}
          className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-400 hover:text-charcoal transition-colors"
          aria-label="Open"
        >
          <EyeIcon className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={async () => {
            const blob = await downloadDocumentFile({ bucket: item.storage_bucket, key: item.storage_key });
            downloadBlob(blob, filename);
          }}
          className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-400 hover:text-charcoal transition-colors"
          aria-label="Download"
        >
          <DownloadIcon className="w-4 h-4" />
        </button>
        <button
          type="button"
          disabled={removing}
          onClick={() => onRemove(item)}
          className="p-2 rounded-lg hover:bg-critical/10 text-charcoal-400 hover:text-critical transition-colors disabled:opacity-60"
          aria-label="Remove"
        >
          {removing ? <LoadingSpinner size={16} /> : <Trash2Icon className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
