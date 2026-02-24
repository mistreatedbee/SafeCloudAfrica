import React, { useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { UUID } from '../../api/models/entities';
import { PPE_CATEGORY_OPTIONS } from '../../api/models/entities';
import { createPpeItem } from '../../api/services/ppeService';

export function PpeItemCreateModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  onCreated?: () => void;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [sizesText, setSizesText] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [stockLocation, setStockLocation] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sizesAvailable = useMemo(() => {
    const t = sizesText.trim();
    if (!t) return null;
    return t.split(/[\s,]+/).filter(Boolean);
  }, [sizesText]);

  const canSubmit = useMemo(() => name.trim().length > 2, [name]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      setLoading(true);
      await createPpeItem({
        companyId: props.companyId,
        name: name.trim(),
        category: category.trim() || undefined,
        unitCost: unitCost ? Number(unitCost) : null,
        description: description.trim() || null,
        sizesAvailable: sizesAvailable && sizesAvailable.length > 0 ? sizesAvailable : null,
        supplierName: supplierName.trim() || null,
        stockLocation: stockLocation.trim() || null
      });
      props.onCreated?.();
      props.onClose();
      setName('');
      setCategory('');
      setDescription('');
      setSizesText('');
      setSupplierName('');
      setStockLocation('');
      setUnitCost('');
    } catch (err: unknown) {
      setError(formatAuthError(err as Error));
    } finally {
      setLoading(false);
    }
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-xl mx-4 bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <p className="text-sm font-semibold text-charcoal">Add PPE item</p>
          <button type="button" onClick={props.onClose} className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-500">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
              <p className="text-sm font-semibold text-critical">Could not create item</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Hard hat"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="e.g. Safety helmet, EN 397"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Category (optional)</label>
            <input
              list="ppe-category-options"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Select or type category"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
            <datalist id="ppe-category-options">
              {PPE_CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </datalist>
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Sizes available (optional)</label>
            <input
              value={sizesText}
              onChange={(e) => setSizesText(e.target.value)}
              placeholder="e.g. S, M, L, XL or one per line"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Supplier name (optional)</label>
              <input
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="e.g. Acme Safety"
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Stock location (optional)</label>
              <input
                value={stockLocation}
                onChange={(e) => setStockLocation(e.target.value)}
                placeholder="e.g. Warehouse A"
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Unit cost (optional)</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              placeholder="e.g. 250"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
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
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-navy text-white text-sm font-semibold hover:bg-navy-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading && <LoadingSpinner size={16} />}
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

