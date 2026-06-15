import React, { useEffect, useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { toUserFacingError } from '../../utils/userFacingMessage';
import type { Department, PPEItem, Site, UUID } from '../../api/models/entities';
import { createPpeStock } from '../../api/services/ppeService';
import { getMyProfile } from '../../api/services/profilesService';
import { useAsync } from '../../api/hooks/useAsync';
import { listHrEmployees, type HrEmployee } from '../../api/services/hrService';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';

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
  const [dateOrdered, setDateOrdered] = useState('');
  const [dateStockReceived, setDateStockReceived] = useState('');
  const [onHandQty, setOnHandQty] = useState('');
  const [reorderLevel, setReorderLevel] = useState('');
  const [reorderQty, setReorderQty] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [capturedEmployeeId, setCapturedEmployeeId] = useState('');
  const [sizeQtys, setSizeQtys] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedItem = useMemo(
    () => props.items.find((i) => i.id === ppeItemId) ?? null,
    [props.items, ppeItemId]
  );
  const itemSizes = useMemo(() => {
    if (!selectedItem) return [];
    const fromPrices = (selectedItem.sizes_with_prices ?? []).map((s) => s.size).filter(Boolean) as string[];
    const fromAvail = (selectedItem.sizes_available ?? []) as string[];
    return fromPrices.length > 0 ? fromPrices : fromAvail;
  }, [selectedItem]);
  const hasSizes = itemSizes.length > 0;

  type PpeStockCreateDraft = {
    ppeItemId: string;
    siteId: string;
    departmentId: string;
    dateOrdered: string;
    dateStockReceived: string;
    onHandQty: string;
    reorderLevel: string;
    reorderQty: string;
    expiryDate: string;
    capturedEmployeeId: string;
    sizeQtys: Record<string, string>;
  };

  const { restoreDraft, clearDraft } = useDraftManager();
  const draftKey = `ppe-stock-create:${props.companyId}:${props.createdByUserId}`;

  const hasDirtyDraft = useMemo(() => {
    return (
      ppeItemId.trim().length > 0 ||
      siteId.trim().length > 0 ||
      departmentId.trim().length > 0 ||
      dateOrdered.trim().length > 0 ||
      dateStockReceived.trim().length > 0 ||
      onHandQty.trim().length > 0 ||
      reorderLevel.trim().length > 0 ||
      reorderQty.trim().length > 0 ||
      expiryDate.trim().length > 0 ||
      capturedEmployeeId.trim().length > 0 ||
      Object.values(sizeQtys).some((v) => v.trim().length > 0)
    );
  }, [capturedEmployeeId, dateOrdered, dateStockReceived, departmentId, expiryDate, onHandQty, ppeItemId, reorderLevel, reorderQty, siteId, sizeQtys]);

  useDraftRegistration({
    key: draftKey,
    enabled: props.open,
    isDirty: () => hasDirtyDraft,
    serialize: () =>
      ({
        ppeItemId,
        siteId,
        departmentId,
        dateOrdered,
        dateStockReceived,
        onHandQty,
        reorderLevel,
        reorderQty,
        expiryDate,
        capturedEmployeeId,
        sizeQtys
      }) satisfies PpeStockCreateDraft
  });

  useEffect(() => {
    if (!props.open) return;
    const restored = restoreDraft<PpeStockCreateDraft>(draftKey);
    if (!restored) return;

    setPpeItemId(restored.ppeItemId ?? '');
    setSiteId(restored.siteId ?? '');
    setDepartmentId(restored.departmentId ?? '');
    setDateOrdered(restored.dateOrdered ?? '');
    setDateStockReceived(restored.dateStockReceived ?? '');
    setOnHandQty(restored.onHandQty ?? '');
    setReorderLevel(restored.reorderLevel ?? '');
    setReorderQty(restored.reorderQty ?? '');
    setExpiryDate(restored.expiryDate ?? '');
    setCapturedEmployeeId(restored.capturedEmployeeId ?? '');
    setSizeQtys(restored.sizeQtys ?? {});
  }, [draftKey, props.open, restoreDraft]);

  const closeWithDraftClear = () => {
    clearDraft(draftKey);
    props.onClose();
  };

  const { data: myProfile } = useAsync(
    async () => {
      if (!props.open || !props.companyId || !props.createdByUserId) return null;
      return await getMyProfile(props.companyId, props.createdByUserId);
    },
    [props.open, props.companyId, props.createdByUserId]
  );
  const capturedByName = myProfile?.full_name ?? `User ${props.createdByUserId.slice(0, 8)}`;

  const { data: employees } = useAsync(
    async () => {
      if (!props.open || !props.companyId) return [] as HrEmployee[];
      const rows = await listHrEmployees(props.companyId);
      return rows
        .filter((e) => e.employment_status !== 'ARCHIVED' && e.employment_status !== 'TERMINATED')
        .sort((a, b) => {
          const aName = `${a.last_name ?? ''} ${a.first_name ?? ''}`.toLowerCase();
          const bName = `${b.last_name ?? ''} ${b.first_name ?? ''}`.toLowerCase();
          return aName.localeCompare(bName);
        });
    },
    [props.open, props.companyId]
  );

  const canSubmit = useMemo(
    () => !!ppeItemId && !!dateOrdered && !!dateStockReceived,
    [ppeItemId, dateOrdered, dateStockReceived]
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      setLoading(true);
      const basePayload = {
        companyId: props.companyId,
        siteId: siteId ? (siteId as UUID) : null,
        departmentId: departmentId ? (departmentId as UUID) : null,
        ppeItemId: ppeItemId as UUID,
        reorderLevel: reorderLevel ? Number(reorderLevel) : 0,
        reorderQty: reorderQty ? Number(reorderQty) : 0,
        createdByUserId: props.createdByUserId,
        capturedByEmployeeId: capturedEmployeeId ? (capturedEmployeeId as UUID) : null,
        dateOrdered: dateOrdered || null,
        dateStockReceived: dateStockReceived || null,
        expiryDate: expiryDate || null
      };

      if (hasSizes) {
        const sizesToCreate = itemSizes.filter((s) => Number(sizeQtys[s] ?? 0) > 0);
        if (sizesToCreate.length > 0) {
          for (const size of sizesToCreate) {
            await createPpeStock({ ...basePayload, onHandQty: Number(sizeQtys[size]), size });
          }
        } else {
          await createPpeStock({ ...basePayload, onHandQty: 0, size: null });
        }
      } else {
        await createPpeStock({ ...basePayload, onHandQty: onHandQty ? Number(onHandQty) : 0, size: null });
      }

      props.onCreated?.();
      clearDraft(draftKey);
      props.onClose();
      setPpeItemId('');
      setSiteId('');
      setDepartmentId('');
      setDateOrdered('');
      setDateStockReceived('');
      setOnHandQty('');
      setReorderLevel('');
      setReorderQty('');
      setExpiryDate('');
      setCapturedEmployeeId('');
      setSizeQtys({});
    } catch (err: unknown) {
      setError(toUserFacingError(err, 'Unable to create stock record right now.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!props.open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeWithDraftClear();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [props.open]);

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 sm:p-6" role="dialog" aria-modal="true" aria-label="Add PPE Stock">
      <div className="absolute inset-0 bg-black/40" onClick={closeWithDraftClear} />
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90dvh] overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <p className="text-sm font-semibold text-charcoal">Add PPE Stock</p>
          <button
            type="button"
            onClick={closeWithDraftClear}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-surface-100 text-charcoal-500 shrink-0"
            aria-label="Close"
          >
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
              <label className="block text-sm font-medium text-charcoal mb-1.5">
                Person capturing stock (HR employee)
              </label>
              <select
                value={capturedEmployeeId}
                onChange={(e) => setCapturedEmployeeId(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                <option value="">Select employee (optional)</option>
                {(employees ?? []).map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {`${emp.last_name ?? ''}, ${emp.first_name ?? ''}`.trim()} — {emp.employee_no}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">
                Person capturing stock (display)
              </label>
              <input
                readOnly
                value={capturedByName}
                className="w-full px-4 py-2.5 bg-surface-50 border border-surface-200 rounded-lg text-sm text-charcoal-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Date ordered *</label>
              <input
                type="date"
                value={dateOrdered}
                onChange={(e) => setDateOrdered(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Date stock received *</label>
              <input
                type="date"
                value={dateStockReceived}
                onChange={(e) => setDateStockReceived(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Expiry date (optional)</label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
          </div>

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
            {hasSizes ? (
              <div className="sm:col-span-3">
                <label className="block text-sm font-medium text-charcoal mb-1.5">
                  Initial quantity per size
                </label>
                <div className="space-y-2">
                  {itemSizes.map((size) => (
                    <div key={size} className="flex items-center gap-3">
                      <span className="w-28 text-sm text-charcoal-600 shrink-0">{size}</span>
                      <input
                        type="number"
                        min={0}
                        value={sizeQtys[size] ?? ''}
                        onChange={(e) => setSizeQtys((prev) => ({ ...prev, [size]: e.target.value }))}
                        placeholder="0"
                        className="w-32 px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                      />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-charcoal-400 mt-1">Each size creates a separate stock record tracked independently.</p>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Initial quantity</label>
                <input
                  type="number"
                  min={0}
                  value={onHandQty}
                  onChange={(e) => setOnHandQty(e.target.value)}
                  placeholder="0"
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
              </div>
            )}
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
              onClick={closeWithDraftClear}
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
              {loading ? 'Saving...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
