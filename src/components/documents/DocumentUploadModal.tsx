import React, { useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { ModuleKey, UUID } from '../../api/models/core';
import type { DocumentFolder } from '../../api/models/entities';
import { createDocumentWithInitialVersion } from '../../api/services/documentsService';
import { uploadDocumentFile } from '../../api/services/documentsStorageService';
import { DOCUMENT_CATEGORIES_BY_MODULE } from '../../constants/documentCategories';

export function DocumentUploadModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  actorUserId: UUID;
  folders?: DocumentFolder[];
  defaultFolderId?: UUID | null;
  onUploaded?: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [module, setModule] = useState<ModuleKey>('safety');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryPreset, setCategoryPreset] = useState('Policies');
  const [categoryCustom, setCategoryCustom] = useState('');
  const [folderId, setFolderId] = useState<UUID | ''>(() => (props.defaultFolderId ? props.defaultFolderId : ''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggested = useMemo(() => DOCUMENT_CATEGORIES_BY_MODULE[module] ?? ['Other'], [module]);
  const category = useMemo(() => {
    const p = categoryPreset.trim();
    if (p && p.toLowerCase() !== 'other') return p;
    return categoryCustom.trim();
  }, [categoryCustom, categoryPreset]);

  const canSubmit = useMemo(() => !!file && title.trim().length > 2 && category.trim().length > 1, [category, file, title]);

  const folderOptions = useMemo(() => {
    const all = props.folders ?? [];
    const filtered = all.filter((f) => f.company_id === props.companyId && f.module === module);
    // Shallow flatten with basic "Parent / Child" labels for selection.
    const byId = new Map<string, DocumentFolder>();
    filtered.forEach((f) => byId.set(String(f.id), f));
    const labelFor = (f: DocumentFolder): string => {
      if (!f.parent_id) return f.name;
      const parent = byId.get(String(f.parent_id));
      return parent ? `${parent.name} / ${f.name}` : f.name;
    };
    return filtered
      .slice()
      .sort((a, b) => labelFor(a).localeCompare(labelFor(b)))
      .map((f) => ({ id: f.id, label: labelFor(f) }));
  }, [module, props.companyId, props.folders]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !file) return;
      setError(null);
    try {
      setLoading(true);
      const uploaded = await uploadDocumentFile({ companyId: props.companyId, file });
      await createDocumentWithInitialVersion({
        companyId: props.companyId,
        module,
        title: title.trim(),
        category: category.trim(),
        description: description.trim() || null,
        folderId: folderId ? (folderId as UUID) : null,
        ownerUserId: props.actorUserId,
        createdByUserId: props.actorUserId,
        storageBucket: uploaded.bucket,
        storageKey: uploaded.key,
        originalFilename: file.name,
        mimeType: file.type || null,
        fileSize: file.size
      });
      props.onUploaded?.();
      props.onClose();
      setFile(null);
      setTitle('');
      setDescription('');
      setCategoryPreset('Policies');
      setCategoryCustom('');
      setModule('safety');
      setFolderId(props.defaultFolderId ? props.defaultFolderId : '');
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90dvh] overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <div>
            <p className="text-sm font-semibold text-charcoal">Upload document</p>
            <p className="text-xs text-charcoal-500 mt-0.5">Uploads to InsForge Storage and creates a document record.</p>
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
                onChange={(e) => {
                  const next = e.target.value as ModuleKey;
                  setModule(next);
                  const first = (DOCUMENT_CATEGORIES_BY_MODULE[next] ?? ['Other'])[0] ?? 'Other';
                  setCategoryPreset(first);
                  setCategoryCustom('');
                }}
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
              <select
                value={categoryPreset}
                onChange={(e) => setCategoryPreset(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                {suggested.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {categoryPreset === 'Other' && (
                <input
                  value={categoryCustom}
                  onChange={(e) => setCategoryCustom(e.target.value)}
                  placeholder="Type category…"
                  className="mt-2 w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
              )}
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
            <label className="block text-sm font-medium text-charcoal mb-1.5">Description (optional)</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short summary for audit and search…"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Folder (optional)</label>
            <select
              value={folderId}
              onChange={(e) => setFolderId((e.target.value || '') as any)}
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            >
              <option value="">No folder</option>
              {folderOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
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
