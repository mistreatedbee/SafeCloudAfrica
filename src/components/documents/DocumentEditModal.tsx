import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import type { Document, DocumentFolder, UUID } from '../../api/models/entities';
import { toUserFacingError } from '../../utils/userFacingMessage';

function buildFolderLabel(folder: DocumentFolder, byId: Map<string, DocumentFolder>): string {
  const parts = [folder.name];
  let cursor = folder.parent_id ? byId.get(String(folder.parent_id)) ?? null : null;
  while (cursor) {
    parts.unshift(cursor.name);
    cursor = cursor.parent_id ? byId.get(String(cursor.parent_id)) ?? null : null;
  }
  return parts.join(' / ');
}

export function DocumentEditModal(props: {
  open: boolean;
  document: Document | null;
  folders: DocumentFolder[];
  canManageRestriction: boolean;
  isLoading?: boolean;
  onClose: () => void;
  onSave: (updates: Partial<Document>) => Promise<void>;
}) {
  const activeDocument = props.document;
  const [formData, setFormData] = useState<Partial<Document>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeDocument || !props.open) return;
    setFormData({
      title: activeDocument.title,
      category: activeDocument.category,
      description: activeDocument.description ?? '',
      folder_id: activeDocument.folder_id ?? null,
      effective_date: activeDocument.effective_date ?? '',
      document_owner_name: activeDocument.document_owner_name ?? '',
      approving_officer_name: activeDocument.approving_officer_name ?? '',
      document_number: activeDocument.document_number ?? '',
      revision_number: activeDocument.revision_number ?? '',
      revision_date: activeDocument.revision_date ?? '',
      approved_date: activeDocument.approved_date ?? '',
      expiry_date: activeDocument.expiry_date ?? '',
      is_restricted: Boolean(activeDocument.is_restricted)
    });
    setError(null);
  }, [activeDocument, props.open]);

  const folderOptions = useMemo(() => {
    if (!activeDocument) return [];
    const relevant = props.folders.filter((folder) => folder.module === activeDocument.module);
    const byId = new Map(relevant.map((folder) => [String(folder.id), folder]));
    return relevant
      .slice()
      .sort((left, right) => buildFolderLabel(left, byId).localeCompare(buildFolderLabel(right, byId)))
      .map((folder) => ({
        id: folder.id,
        label: buildFolderLabel(folder, byId),
        isRestricted: Boolean(folder.is_restricted)
      }));
  }, [document, props.folders]);

  useEffect(() => {
    if (!props.open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    window.document.addEventListener('keydown', handler);
    return () => window.document.removeEventListener('keydown', handler);
  }, [props.open, props.onClose]);

  if (!props.open || !activeDocument) return null;

  const selectedFolder = folderOptions.find((folder) => folder.id === formData.folder_id) ?? null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!String(formData.title ?? '').trim()) {
      setError('Document title is required.');
      return;
    }
    if (!String(formData.category ?? '').trim()) {
      setError('Category is required.');
      return;
    }
    if (!formData.folder_id) {
      setError('Please select a folder.');
      return;
    }

    try {
      await props.onSave({
        ...formData,
        title: String(formData.title ?? '').trim(),
        category: String(formData.category ?? '').trim(),
        description: String(formData.description ?? '').trim() || null,
        effective_date: String(formData.effective_date ?? '').trim() || null,
        document_owner_name: String(formData.document_owner_name ?? '').trim() || null,
        approving_officer_name: String(formData.approving_officer_name ?? '').trim() || null,
        document_number: String(formData.document_number ?? '').trim() || null,
        revision_number: String(formData.revision_number ?? '').trim() || null,
        revision_date: String(formData.revision_date ?? '').trim() || null,
        approved_date: String(formData.approved_date ?? '').trim() || null,
        expiry_date: String(formData.expiry_date ?? '').trim() || null,
        is_restricted: Boolean(formData.is_restricted)
      });
      props.onClose();
    } catch (err) {
      setError(toUserFacingError(err, 'Failed to save document. Please try again.'));
    }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90dvh] overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <div>
            <p className="text-sm font-semibold text-charcoal">Edit document details</p>
            <p className="text-xs text-charcoal-500 mt-0.5">Update metadata, folder placement, restriction, and expiry.</p>
          </div>
          <button onClick={props.onClose} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-surface-100 text-charcoal-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {error && (
            <div className="flex items-start gap-3 p-3 bg-critical/5 border border-critical/20 rounded-xl">
              <AlertCircle className="w-5 h-5 text-critical mt-0.5 shrink-0" />
              <p className="text-sm text-charcoal-700">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="block text-charcoal-600 mb-1.5">Document title</span>
              <input
                value={String(formData.title ?? '')}
                onChange={(event) => setFormData((current) => ({ ...current, title: event.target.value }))}
                className="w-full px-4 py-2.5 border border-surface-300 rounded-lg"
              />
            </label>
            <label className="block text-sm">
              <span className="block text-charcoal-600 mb-1.5">Category</span>
              <input
                value={String(formData.category ?? '')}
                onChange={(event) => setFormData((current) => ({ ...current, category: event.target.value }))}
                className="w-full px-4 py-2.5 border border-surface-300 rounded-lg"
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="block text-charcoal-600 mb-1.5">Description</span>
            <textarea
              rows={3}
              value={String(formData.description ?? '')}
              onChange={(event) => setFormData((current) => ({ ...current, description: event.target.value }))}
              className="w-full px-4 py-2.5 border border-surface-300 rounded-lg resize-none"
            />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="block text-charcoal-600 mb-1.5">Folder</span>
              <select
                value={String(formData.folder_id ?? '')}
                onChange={(event) => {
                  const nextId = event.target.value || null;
                  const nextFolder = folderOptions.find((folder) => folder.id === nextId) ?? null;
                  setFormData((current) => ({
                    ...current,
                    folder_id: nextId as UUID | null,
                    is_restricted: props.canManageRestriction
                      ? Boolean(nextFolder?.isRestricted ?? current.is_restricted)
                      : current.is_restricted
                  }));
                }}
                className="w-full px-4 py-2.5 border border-surface-300 rounded-lg"
              >
                <option value="">Select folder</option>
                {folderOptions.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="block text-charcoal-600 mb-1.5">Expiry date</span>
              <input
                type="date"
                value={String(formData.expiry_date ?? '')}
                onChange={(event) => setFormData((current) => ({ ...current, expiry_date: event.target.value }))}
                className="w-full px-4 py-2.5 border border-surface-300 rounded-lg"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="block text-charcoal-600 mb-1.5">Effective date</span>
              <input
                type="date"
                value={String(formData.effective_date ?? '')}
                onChange={(event) => setFormData((current) => ({ ...current, effective_date: event.target.value }))}
                className="w-full px-4 py-2.5 border border-surface-300 rounded-lg"
              />
            </label>
            <label className="block text-sm">
              <span className="block text-charcoal-600 mb-1.5">Approved date</span>
              <input
                type="date"
                value={String(formData.approved_date ?? '')}
                onChange={(event) => setFormData((current) => ({ ...current, approved_date: event.target.value }))}
                className="w-full px-4 py-2.5 border border-surface-300 rounded-lg"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="block text-charcoal-600 mb-1.5">Document owner / compiler</span>
              <input
                value={String(formData.document_owner_name ?? '')}
                onChange={(event) => setFormData((current) => ({ ...current, document_owner_name: event.target.value }))}
                className="w-full px-4 py-2.5 border border-surface-300 rounded-lg"
              />
            </label>
            <label className="block text-sm">
              <span className="block text-charcoal-600 mb-1.5">Approving officer</span>
              <input
                value={String(formData.approving_officer_name ?? '')}
                onChange={(event) => setFormData((current) => ({ ...current, approving_officer_name: event.target.value }))}
                className="w-full px-4 py-2.5 border border-surface-300 rounded-lg"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="block text-sm">
              <span className="block text-charcoal-600 mb-1.5">Document number</span>
              <input
                value={String(formData.document_number ?? '')}
                onChange={(event) => setFormData((current) => ({ ...current, document_number: event.target.value }))}
                className="w-full px-4 py-2.5 border border-surface-300 rounded-lg"
              />
            </label>
            <label className="block text-sm">
              <span className="block text-charcoal-600 mb-1.5">Revision number</span>
              <input
                value={String(formData.revision_number ?? '')}
                onChange={(event) => setFormData((current) => ({ ...current, revision_number: event.target.value }))}
                className="w-full px-4 py-2.5 border border-surface-300 rounded-lg"
              />
            </label>
            <label className="block text-sm">
              <span className="block text-charcoal-600 mb-1.5">Revision date</span>
              <input
                type="date"
                value={String(formData.revision_date ?? '')}
                onChange={(event) => setFormData((current) => ({ ...current, revision_date: event.target.value }))}
                className="w-full px-4 py-2.5 border border-surface-300 rounded-lg"
              />
            </label>
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-surface-200 p-4">
            <input
              type="checkbox"
              checked={Boolean(formData.is_restricted)}
              disabled={!props.canManageRestriction}
              onChange={(event) => setFormData((current) => ({ ...current, is_restricted: event.target.checked }))}
              className="mt-1"
            />
            <span className="text-sm text-charcoal-700">
              <span className="block font-medium text-charcoal">Restricted company document</span>
              {selectedFolder?.isRestricted
                ? 'This folder is restricted. The document will only be visible to organisation owners and admins.'
                : 'Only organisation owners and admins can view restricted documents.'}
            </span>
          </label>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={props.onClose} className="flex-1 px-4 py-2.5 rounded-lg border border-surface-300 text-charcoal font-medium">
              Cancel
            </button>
            <button type="submit" disabled={props.isLoading} className="flex-1 px-4 py-2.5 rounded-lg bg-teal text-white font-semibold disabled:opacity-60">
              {props.isLoading ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
