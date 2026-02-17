import React, { useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { UUID } from '../../api/models/entities';
import { createTemplateLibraryItem, TEMPLATES_BUCKET } from '../../api/services/templateLibraryService';
import { insforge } from '../../api/insforge/client';

export function TemplateUploadModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  createdByUserId: UUID;
  onCreated?: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState('Policy');
  const [category, setCategory] = useState('Safety');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => name.trim().length > 2 && type.trim().length > 1 && category.trim().length > 1, [category, name, type]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      setLoading(true);
      let storageBucket: string | null = null;
      let storageKey: string | null = null;
      if (file) {
        const key = `${props.companyId}/${Date.now()}-${file.name}`.replace(/\s+/g, '_');
        const { data, error: upErr } = await insforge.storage.from(TEMPLATES_BUCKET).upload(key, file);
        if (upErr) throw upErr;
        storageBucket = TEMPLATES_BUCKET;
        storageKey = data?.path ?? key;
      }

      await createTemplateLibraryItem({
        companyId: props.companyId,
        name: name.trim(),
        type: type.trim(),
        category: category.trim(),
        storageBucket,
        storageKey,
        createdByUserId: props.createdByUserId
      });

      props.onCreated?.();
      props.onClose();
      setName('');
      setType('Policy');
      setCategory('Safety');
      setFile(null);
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
      <div className="relative w-full max-w-2xl mx-4 bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <p className="text-sm font-semibold text-charcoal">Add template</p>
          <button type="button" onClick={props.onClose} className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-500">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
              <p className="text-sm font-semibold text-critical">Could not add template</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Name *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Safety Policy (ISO 45001)"
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Type</label>
              <input
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Category</label>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">File (optional)</label>
              <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="w-full text-sm" />
              {file && <p className="text-xs text-charcoal-500 mt-1">Selected: {file.name}</p>}
            </div>
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
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

