import React, { useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { PpeSizeWithPrice, UUID } from '../../api/models/entities';
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

  const [sizeRows, setSizeRows] = useState<Array<{ id: string; size: string; price: string }>>([
    { id: 's', size: 'Small', price: '' },
    { id: 'm', size: 'Medium', price: '' },
    { id: 'l', size: 'Large', price: '' }
  ]);

  const sizesAvailable = useMemo(() => {
    const manual = sizesText.trim();
    if (manual) {
      const tokens = manual.split(/[\s,]+/).filter(Boolean);
      if (tokens.length > 0) return tokens;
    }
    const fromRows = sizeRows
      .map((row) => row.size.trim())
      .filter((v, idx, arr) => v && arr.indexOf(v) === idx);
    return fromRows.length > 0 ? fromRows : null;
  }, [sizesText, sizeRows]);

  const sizesWithPrices: PpeSizeWithPrice[] | null = useMemo(() => {
    const rows = sizeRows
      .map((row) => ({
        size: row.size.trim(),
        price: row.price.trim() === '' ? null : Number(row.price)
      }))
      .filter((row) => row.size !== '');
    return rows.length > 0 ? rows : null;
  }, [sizeRows]);

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
        unitCost: unitCost ? Number(unitCost) : (sizesWithPrices && sizesWithPrices[0] ? sizesWithPrices[0].price ?? null : null),
        sizesWithPrices,
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
      setSizeRows([
        { id: 's', size: 'Small', price: '' },
        { id: 'm', size: 'Medium', price: '' },
        { id: 'l', size: 'Large', price: '' }
      ]);
    } catch (err: unknown) {
      setError(formatAuthError(err as Error));
    } finally {
      setLoading(false);
    }
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
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

          <div className="space-y-2">
            <label className="block text-sm font-medium text-charcoal mb-1.5">
              Sizes & prices (optional)
            </label>
            <div className="space-y-2">
              {sizeRows.map((row, index) => (
                <div key={row.id} className="grid grid-cols-5 gap-2">
                  <input
                    value={row.size}
                    onChange={(e) => {
                      const next = [...sizeRows];
                      next[index] = { ...next[index], size: e.target.value };
                      setSizeRows(next);
                    }}
                    placeholder="Size (e.g. Small)"
                    className="col-span-3 w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  />
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={row.price}
                    onChange={(e) => {
                      const next = [...sizeRows];
                      next[index] = { ...next[index], price: e.target.value };
                      setSizeRows(next);
                    }}
                    placeholder="Price"
                    className="col-span-2 w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setSizeRows((rows) => [
                    ...rows,
                    { id: `row-${rows.length + 1}`, size: '', price: '' }
                  ])
                }
                className="px-3 py-1.5 rounded-lg border border-surface-300 text-xs font-medium text-charcoal hover:bg-surface-50"
              >
                Add size
              </button>
              {sizeRows.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSizeRows((rows) => rows.slice(0, -1))}
                  className="px-3 py-1.5 rounded-lg border border-surface-300 text-xs font-medium text-charcoal hover:bg-surface-50"
                >
                  Remove last
                </button>
              )}
            </div>
            <p className="text-xs text-charcoal-500">
              You can still type a quick list of sizes in the field below if you prefer.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">
              Sizes available (optional quick list)
            </label>
            <input
              value={sizesText}
              onChange={(e) => setSizesText(e.target.value)}
              placeholder="e.g. S, M, L, XL"
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

