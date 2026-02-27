import React, { useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { PPEItem, PpeReorderRequest, PpeStock, PpeStockMovement, UUID } from '../../api/models/entities';
import {
  createPpeReorderRequest,
  createPpeStockMovement,
  listPpeReorderRequests,
  listPpeStockMovements
} from '../../api/services/ppeService';
import { useAsync } from '../../api/hooks/useAsync';

export function PpeStockDetailModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  actorUserId: UUID;
  stock: PpeStock;
  item?: PPEItem;
  siteName?: string | null;
  departmentName?: string | null;
  onChanged?: () => void;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [movementType, setMovementType] = useState<'in' | 'out' | 'adjust' | 'return'>('out');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [movementLoading, setMovementLoading] = useState(false);
  const [movementError, setMovementError] = useState<string | null>(null);

  const [reorderQty, setReorderQty] = useState('');
  const [reorderReason, setReorderReason] = useState('');
  const [reorderLoading, setReorderLoading] = useState(false);
  const [reorderError, setReorderError] = useState<string | null>(null);

  const { data: movements, loading: movementsLoading, error: movementsError } = useAsync<PpeStockMovement[]>(
    async () => {
      if (!props.open) return [];
      return await listPpeStockMovements({
        companyId: props.companyId,
        stockId: props.stock.id,
        limit: 200
      });
    },
    [props.companyId, props.stock.id, props.open, refreshKey]
  );

  const { data: reorderRequests, loading: reorderListLoading, error: reorderListError } = useAsync<PpeReorderRequest[]>(
    async () => {
      if (!props.open) return [];
      return await listPpeReorderRequests({
        companyId: props.companyId,
        status: undefined,
        limit: 50
      });
    },
    [props.companyId, props.open, refreshKey]
  );

  const relatedReorders =
    reorderRequests?.filter((r) => r.stock_id === props.stock.id) ?? [];

  const availableStock = useMemo(
    () => props.stock.on_hand_qty - (props.stock.reserved_qty ?? 0),
    [props.stock.on_hand_qty, props.stock.reserved_qty]
  );

  const stockStatus =
    availableStock <= 0
      ? 'Out of stock'
      : props.stock.reorder_level > 0 && availableStock <= props.stock.reorder_level
      ? 'Low stock'
      : 'Available';

  async function handleMovementSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!quantity) return;
    setMovementError(null);
    try {
      setMovementLoading(true);
      await createPpeStockMovement({
        companyId: props.companyId,
        stockId: props.stock.id,
        movementType,
        quantity: Number(quantity),
        reason: reason.trim() || null,
        actorUserId: props.actorUserId
      });
      setQuantity('');
      setReason('');
      setRefreshKey((k) => k + 1);
      props.onChanged?.();
    } catch (err: any) {
      setMovementError(formatAuthError(err));
    } finally {
      setMovementLoading(false);
    }
  }

  async function handleReorderSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reorderQty) return;
    setReorderError(null);
    try {
      setReorderLoading(true);
      await createPpeReorderRequest({
        companyId: props.companyId,
        stockId: props.stock.id,
        requestedQty: Number(reorderQty),
        reason: reorderReason.trim() || null,
        requestedByUserId: props.actorUserId
      });
      setReorderQty('');
      setReorderReason('');
      setRefreshKey((k) => k + 1);
      props.onChanged?.();
    } catch (err: any) {
      setReorderError(formatAuthError(err));
    } finally {
      setReorderLoading(false);
    }
  }

  if (!props.open) return null;

  const title = props.item?.name ?? `Item ${String(props.stock.ppe_item_id).slice(0, 8)}`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-5xl mx-4 bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <div>
            <p className="text-sm font-semibold text-charcoal">PPE Stock Detail</p>
            <p className="text-xs text-charcoal-500 mt-0.5">
              {title} • On hand: {props.stock.on_hand_qty} • Location:{' '}
              {props.siteName || 'All sites'} / {props.departmentName || 'All departments'}
            </p>
            {(props.stock.captured_by_name || props.stock.date_ordered || props.stock.date_stock_received) && (
              <p className="text-xs text-charcoal-400 mt-1">
                Captured by: {props.stock.captured_by_name ?? '—'} • Ordered: {props.stock.date_ordered ?? '—'} • Received: {props.stock.date_stock_received ?? '—'}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-500"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-6 overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Movement form */}
            <div className="lg:col-span-2 space-y-4">
              <p className="text-sm font-semibold text-charcoal">Record stock movement</p>
              {movementError && (
                <div className="bg-critical/5 border border-critical/20 rounded-xl p-3 mb-2">
                  <p className="text-xs font-semibold text-critical">Could not record movement</p>
                  <p className="text-xs text-charcoal-600 mt-1">{movementError}</p>
                </div>
              )}
              <form onSubmit={handleMovementSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                <div>
                  <label className="block text-xs font-medium text-charcoal mb-1.5">Type</label>
                  <select
                    value={movementType}
                    onChange={(e) => setMovementType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  >
                    <option value="in">In</option>
                    <option value="out">Out</option>
                    <option value="return">Return</option>
                    <option value="adjust">Adjust (set quantity)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-charcoal mb-1.5">Quantity *</label>
                  <input
                    type="number"
                    min={0}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs font-medium text-charcoal mb-1.5">Reason (optional)</label>
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  />
                </div>
                <div className="sm:col-span-3 flex justify-end">
                  <button
                    type="submit"
                    disabled={!quantity || movementLoading}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-navy-700 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {movementLoading && <LoadingSpinner size={14} />}
                    Save movement
                  </button>
                </div>
              </form>
            </div>

            {/* Reorder request */}
            <div className="space-y-4">
              <p className="text-sm font-semibold text-charcoal">Create reorder request</p>
              {reorderError && (
                <div className="bg-critical/5 border border-critical/20 rounded-xl p-3 mb-2">
                  <p className="text-xs font-semibold text-critical">Could not create reorder request</p>
                  <p className="text-xs text-charcoal-600 mt-1">{reorderError}</p>
                </div>
              )}
              <form onSubmit={handleReorderSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-charcoal mb-1.5">
                    Quantity *
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={reorderQty}
                    onChange={(e) => setReorderQty(e.target.value)}
                    placeholder={
                      props.stock.reorder_qty ? String(props.stock.reorder_qty) : 'e.g. 50'
                    }
                    className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-charcoal mb-1.5">
                    Reason (optional)
                  </label>
                  <textarea
                    rows={3}
                    value={reorderReason}
                    onChange={(e) => setReorderReason(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!reorderQty || reorderLoading}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-xs font-semibold hover:bg-teal-600 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {reorderLoading && <LoadingSpinner size={14} />}
                  Create reorder
                </button>
              </form>

              <div className="pt-3 border-t border-surface-200">
                <p className="text-xs font-semibold text-charcoal mb-2">Reorder history</p>
                {reorderListLoading && (
                  <p className="text-xs text-charcoal-500">Loading reorder requests…</p>
                )}
                {reorderListError && (
                  <p className="text-xs text-critical">{reorderListError.message}</p>
                )}
                {!reorderListLoading && !reorderListError && relatedReorders.length === 0 && (
                  <p className="text-xs text-charcoal-500">No reorder requests for this stock yet.</p>
                )}
                {!reorderListLoading &&
                  !reorderListError &&
                  relatedReorders.length > 0 && (
                    <ul className="space-y-1 max-h-40 overflow-y-auto text-xs">
                      {relatedReorders.map((r) => (
                        <li key={r.id} className="flex items-center justify-between">
                          <span>
                            {r.requested_qty} units •{' '}
                            <span className="capitalize">{r.status.replace('-', ' ')}</span>
                          </span>
                          <span className="text-charcoal-400">
                            {new Date(r.created_at).toLocaleDateString('en-ZA')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
              </div>
            </div>
          </div>

          {/* Stock summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-surface-50 rounded-xl border border-surface-200 p-3">
              <p className="text-xs text-charcoal-500">On hand</p>
              <p className="text-lg font-semibold text-charcoal">{props.stock.on_hand_qty}</p>
            </div>
            <div className="bg-surface-50 rounded-xl border border-surface-200 p-3">
              <p className="text-xs text-charcoal-500">Reserved</p>
              <p className="text-lg font-semibold text-charcoal">{props.stock.reserved_qty}</p>
            </div>
            <div className="bg-surface-50 rounded-xl border border-surface-200 p-3">
              <p className="text-xs text-charcoal-500">Available</p>
              <p className="text-lg font-semibold text-charcoal">
                {availableStock} ({stockStatus})
              </p>
            </div>
          </div>

          {/* Movement history table */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-charcoal">Movement history</p>
            {movementsError && (
              <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
                <p className="text-xs font-semibold text-critical">Unable to load movements</p>
                <p className="text-xs text-charcoal-600 mt-1">{movementsError.message}</p>
              </div>
            )}
            {movementsLoading && (
              <div className="bg-white rounded-xl border border-surface-300 p-3 shadow-card">
                <p className="text-xs text-charcoal-500">Loading movements…</p>
              </div>
            )}
            {!movementsLoading && !movementsError && (movements ?? []).length === 0 && (
              <div className="bg-white rounded-xl border border-surface-300 p-3 shadow-card">
                <p className="text-xs text-charcoal-500">No movements recorded yet.</p>
              </div>
            )}
            {!movementsLoading && !movementsError && (movements ?? []).length > 0 && (
              <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-[10px] font-semibold text-charcoal-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-4 py-2 text-left text-[10px] font-semibold text-charcoal-500 uppercase tracking-wider">
                          Type
                        </th>
                        <th className="px-4 py-2 text-left text-[10px] font-semibold text-charcoal-500 uppercase tracking-wider">
                          Quantity
                        </th>
                        <th className="px-4 py-2 text-left text-[10px] font-semibold text-charcoal-500 uppercase tracking-wider">
                          Balance
                        </th>
                        <th className="px-4 py-2 text-left text-[10px] font-semibold text-charcoal-500 uppercase tracking-wider">
                          Reason
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {(movements ?? []).map((m) => (
                        <tr key={m.id}>
                          <td className="px-4 py-2 text-xs text-charcoal-500">
                            {new Date(m.created_at).toLocaleString('en-ZA')}
                          </td>
                          <td className="px-4 py-2 text-xs text-charcoal-500 capitalize">
                            {m.movement_type}
                          </td>
                          <td className="px-4 py-2 text-xs text-charcoal-500">{m.quantity}</td>
                          <td className="px-4 py-2 text-xs text-charcoal-500">
                            {m.new_on_hand_qty ?? '—'}
                          </td>
                          <td className="px-4 py-2 text-xs text-charcoal-500">
                            {m.reason || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

