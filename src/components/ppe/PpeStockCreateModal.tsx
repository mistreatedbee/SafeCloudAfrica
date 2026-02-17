import React, { useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { Department, PPEItem, Site, UUID } from '../../api/models/entities';
import { createPpeStock } from '../../api/services/ppeService';

export function PpeStockCreateModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  createdByUserId: UUID;
  items: PPEItem[];
  sites: Site[];
  departments: Department[];
  onCreated?: () => void;
}) {
  const [ppeItemId, setPpeItemId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [onHandQty, setOnHandQty] = useState('');
  const [reorderLevel, setReorderLevel] = useState('');
  const [reorderQty, setReorderQty] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => !!ppeItemId, [ppeItemId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      setLoading(true);
      await createPpeStock({
        companyId: props.companyId,
        siteId: siteId ? (siteId as any) : null,
        departmentId: departmentId ? (departmentId as any) : null,
        ppeItemId: ppeItemId as any,
        onHandQty: onHandQty ? Number(onHandQty) : 0,
        reorderLevel: reorderLevel ? Number(reorderLevel) : 0,
        reorderQty: reorderQty ? Number(reorderQty) : 0,
        createdByUserId: props.createdByUserId
      });
      props.onCreated?.();
      props.onClose();
      setPpeItemId('');
      setSiteId('');
      setDepartmentId('');
      setOnHandQty('');
      setReorderLevel('');
      setReorderQty('');
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
      <div className="relative w-full max-w-3xl mx-4 bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <p className="text-sm font-semibold text-charcoal">Add PPE Stock</p>
          <button type="button" onClick={props.onClose} className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-500">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
              <p className="text-sm font-semibold text-critical">Could not create stock record</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Item *</label>
              <select
                value={ppeItemId}
                onChange={(e) => setPpeItemId(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                <option value="">Select PPE item</option>
                {props.items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Site (optional)</label>
                <select
                  value={siteId}
                  onChange={(e) => setSiteId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                >
                  <option value="">All sites</option>
                  {props.sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Department (optional)</label>
                <select
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                >
                  <option value="">All departments</option>
                  {props.departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">On-hand quantity</label>
              <input
                type="number"
                min={0}
                value={onHandQty}
                onChange={(e) => setOnHandQty(e.target.value)}
                placeholder="0"
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Reorder level</label>
              <input
                type="number"
                min={0}
                value={reorderLevel}
                onChange={(e) => setReorderLevel(e.target.value)}
                placeholder="e.g. 10"
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Reorder quantity</label>
              <input
                type="number"
                min={0}
                value={reorderQty}
                onChange={(e) => setReorderQty(e.target.value)}
                placeholder="e.g. 50"
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
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

