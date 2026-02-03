import React, { useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { ModuleKey, UUID } from '../../api/models/core';
import { createDocument } from '../../api/services/documentsService';
import { uploadDocumentFile } from '../../api/services/documentsStorageService';

export function DocumentUploadModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  actorUserId: UUID;
  onUploaded?: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [module, setModule] = useState<ModuleKey>('safety');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('General');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => !!file && title.trim().length > 2 && category.trim().length > 1, [category, file, title]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !file) return;
    setError(null);
    try {
      setLoading(true);
      const uploaded = await uploadDocumentFile({ companyId: props.companyId, file });
      await createDocument({
        companyId: props.companyId,
        module,
        title: title.trim(),
        category: category.trim(),
        ownerUserId: props.actorUserId,
        storageBucket: uploaded.bucket,
        storageKey: uploaded.key
      });
      props.onUploaded?.();
      props.onClose();
      setFile(null);
      setTitle('');
      setCategory('General');
      setModule('safety');
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
            <p className="text-sm font-semibold text-charcoal">Upload document</p>
            <p className="text-xs text-charcoal-500 mt-0.5">Uploads to InsForge Storage and creates a document record.</p>
          </div>
          <button type="button" onClick={props.onClose} className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-500">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
              <p className="text-sm font-semibold text-critical">Upload failed</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Module</label>
              <select
                value={module}
                onChange={(e) => setModule(e.target.value as ModuleKey)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                <option value="safety">Safety</option>
                <option value="quality">Quality</option>
                <option value="environment">Environment</option>
                <option value="health">Health</option>
                <option value="legal">Legal</option>
                <option value="hr">HR</option>
                <option value="general">General</option>
                <option value="security">Security</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Category</label>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Policy, Procedure, Register"
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. OHS Policy"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">File *</label>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm"
            />
            {file && <p className="text-xs text-charcoal-500 mt-1">Selected: {file.name}</p>}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={props.onClose}
              className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading && <LoadingSpinner size={16} />}
              Upload
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

