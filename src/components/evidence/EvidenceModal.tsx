import React, { useMemo, useState } from 'react';
import { XIcon, UploadIcon, EyeIcon, DownloadIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { EvidenceAttachment, UUID } from '../../api/models/entities';
import { createEvidence, listEvidence } from '../../api/services/evidenceService';
import { downloadBlob, downloadDocumentFile, openBlobInNewTab } from '../../api/services/documentsStorageService';
import { insforge } from '../../api/insforge/client';
import { useAsync } from '../../api/hooks/useAsync';

export const EVIDENCE_BUCKET = 'sca-evidence';

export function EvidenceModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  actorUserId: UUID;
  entityType: string;
  entityId: UUID;
  title?: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, loading: listLoading } = useAsync<EvidenceAttachment[]>(
    async () => listEvidence(props.companyId, { entityType: props.entityType, entityId: props.entityId, limit: 200 }),
    [props.companyId, props.entityType, props.entityId, refreshKey]
  );
  const evidence = data ?? [];

  const canUpload = useMemo(() => !!file, [file]);

  async function upload() {
    if (!file) return;
    setError(null);
    try {
      setLoading(true);
      const key = `${props.companyId}/${props.entityType}/${props.entityId}/${Date.now()}-${file.name}`.replace(/\s+/g, '_');
      const { data: uploaded, error: upErr } = await insforge.storage.from(EVIDENCE_BUCKET).upload(key, file);
      if (upErr) throw upErr;
      await createEvidence({
        companyId: props.companyId,
        entityType: props.entityType,
        entityId: props.entityId,
        title: uploadTitle.trim() || file.name,
        storageBucket: EVIDENCE_BUCKET,
        storageKey: uploaded?.path ?? key,
        createdByUserId: props.actorUserId
      });
      setFile(null);
      setUploadTitle('');
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-2xl mx-4 bg-white rounded-2xl shadow-xl border border-surface-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <div>
            <p className="text-sm font-semibold text-charcoal">{props.title ?? 'Evidence'}</p>
            <p className="text-xs text-charcoal-500 mt-0.5">Upload and view evidence files linked to this record.</p>
          </div>
          <button type="button" onClick={props.onClose} className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-500">
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
              <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="w-full text-sm" />
            </div>
            <div className="sm:col-span-3 flex justify-end">
              <button
                type="button"
                disabled={!canUpload || loading}
                onClick={() => void upload()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? <LoadingSpinner size={16} /> : <UploadIcon className="w-4 h-4" />}
                Upload evidence
              </button>
            </div>
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
                <div className="px-4 py-3">
                  <p className="text-sm text-charcoal-500">No evidence uploaded yet.</p>
                </div>
              )}
              {evidence.map((evi) => (
                <EvidenceRow key={evi.id} item={evi} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EvidenceRow({ item }: { item: EvidenceAttachment }) {
  const filename = item.storage_key.split('/').pop() ?? 'evidence';
  return (
    <div className="px-4 py-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-charcoal truncate">{item.title ?? filename}</p>
        <p className="text-xs text-charcoal-400 mt-0.5">{new Date(item.created_at).toLocaleString('en-ZA')}</p>
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
      </div>
    </div>
  );
}
