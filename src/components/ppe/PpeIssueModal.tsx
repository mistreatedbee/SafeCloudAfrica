import React, { useEffect, useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type {
  Department,
  PPEItem,
  PPEIssue,
  QualityNcr,
  Site,
  UUID,
  UserProfile
} from '../../api/models/entities';
import { PPE_REASON_FOR_ISSUE_OPTIONS } from '../../api/models/entities';
import {
  createPpeIssue,
  getPpeStockByLocation,
  setPpeIssueLinks,
  type CreatePpeIssueInput
} from '../../api/services/ppeService';
import { listQualityNcrs } from '../../api/services/qualityNcrsService';
import { listCorrectiveActions } from '../../api/services/correctiveActionsService';
import { listUserProfiles } from '../../api/services/profilesService';

export function PpeIssueModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  issuedByUserId: UUID;
  issuedByName?: string | null;
  issuedByRole?: string | null;
  items: PPEItem[];
  sites: Site[];
  departments: Department[];
  isAdmin?: boolean;
  onIssued?: () => void;
}) {
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [ppeItemId, setPpeItemId] = useState('');
  const [size, setSize] = useState('');
  const [sizeOther, setSizeOther] = useState('');
  const [quantityIssued, setQuantityIssued] = useState(1);
  const [reasonForIssue, setReasonForIssue] = useState('');
  const [reasonOther, setReasonOther] = useState('');
  const [issuedToUserId, setIssuedToUserId] = useState('');
  const [issuedToEmployeeNumber, setIssuedToEmployeeNumber] = useState('');
  const [jobRole, setJobRole] = useState('');
  const [siteId, setSiteId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [notes, setNotes] = useState('');
  const [unitCostOverride, setUnitCostOverride] = useState<string>('');
  const [adminOverrideInsufficientStock, setAdminOverrideInsufficientStock] = useState(false);
  const [selectedNcrIds, setSelectedNcrIds] = useState<string[]>([]);
  const [selectedCapaIds, setSelectedCapaIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stockWarning, setStockWarning] = useState<string | null>(null);
  const [resolvedStockId, setResolvedStockId] = useState<UUID | null>(null);

  const [ncrOptions, setNcrOptions] = useState<QualityNcr[]>([]);
  const [capaOptions, setCapaOptions] = useState<
    import('../../api/services/correctiveActionsService').CorrectiveAction[]
  >([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);

  useEffect(() => {
    async function load() {
      if (!props.open) return;
      try {
        const [ncrs, capas, profs] = await Promise.all([
          listQualityNcrs({ companyId: props.companyId, limit: 100 }),
          listCorrectiveActions({ companyId: props.companyId, limit: 100 }),
          listUserProfiles(props.companyId)
        ]);
        setNcrOptions(ncrs);
        setCapaOptions(capas);
        setProfiles(profs ?? []);
      } catch {
        // optional
      }
    }
    load();
  }, [props.companyId, props.open]);

  const selectedItem = useMemo(
    () => props.items.find((i) => i.id === ppeItemId) ?? null,
    [props.items, ppeItemId]
  );
  const sizesAvailable = useMemo(() => {
    const s = selectedItem?.sizes_available;
    if (Array.isArray(s) && s.length > 0) return s as string[];
    return [];
  }, [selectedItem]);
  const unitCost = useMemo(() => {
    if (unitCostOverride !== '' && Number.isFinite(Number(unitCostOverride)))
      return Number(unitCostOverride);
    return selectedItem?.unit_cost ?? null;
  }, [selectedItem, unitCostOverride]);
  const totalCost = useMemo(() => {
    const q = Math.max(1, quantityIssued);
    return unitCost != null ? unitCost * q : null;
  }, [unitCost, quantityIssued]);

  useEffect(() => {
    if (!props.open || !ppeItemId || !props.companyId) {
      setStockWarning(null);
      setResolvedStockId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const stock = await getPpeStockByLocation({
        companyId: props.companyId,
        siteId: siteId || null,
        departmentId: departmentId || null,
        ppeItemId: ppeItemId as UUID
      });
      if (cancelled) return;
      if (!stock) {
        setResolvedStockId(null);
        setStockWarning('No stock record for this item at selected site/department. Issue will be recorded without stock decrement.');
        return;
      }
      setResolvedStockId(stock.id);
      const q = Math.max(1, quantityIssued);
      if (stock.on_hand_qty < q) {
        setStockWarning(`Insufficient stock: ${stock.on_hand_qty} on hand, ${q} requested.`);
      } else {
        setStockWarning(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.open, props.companyId, ppeItemId, siteId, departmentId, quantityIssued]);

  const canSubmit = useMemo(
    () =>
      !!ppeItemId &&
      !!issueDate &&
      (size.trim() !== '' || sizeOther.trim() !== '') &&
      (reasonForIssue !== '' || reasonOther.trim() !== '') &&
      quantityIssued >= 1,
    [ppeItemId, issueDate, size, sizeOther, reasonForIssue, reasonOther, quantityIssued]
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      setLoading(true);
      const payload: CreatePpeIssueInput = {
        companyId: props.companyId,
        ppeItemId: ppeItemId as UUID,
        issuedByUserId: props.issuedByUserId,
        issuedByRole: props.issuedByRole ?? null,
        issueDate,
        siteId: siteId ? (siteId as UUID) : null,
        departmentId: departmentId ? (departmentId as UUID) : null,
        size: size.trim() || sizeOther.trim() || null,
        quantityIssued: Math.max(1, quantityIssued),
        reasonForIssue: reasonForIssue || reasonOther.trim() || null,
        issuedToUserId: issuedToUserId ? (issuedToUserId as UUID) : null,
        issuedToEmployeeNumber: issuedToEmployeeNumber.trim() || null,
        jobRole: jobRole.trim() || null,
        unitCostAtIssue: unitCost ?? null,
        notes: notes.trim() || null,
        nextIssueAt: null,
        returnDueAt: null,
        adminOverrideInsufficientStock: props.isAdmin && adminOverrideInsufficientStock
      };
      if (resolvedStockId) payload.stockId = resolvedStockId;

      const issue = await createPpeIssue(payload);
      if (issue && (selectedNcrIds.length > 0 || selectedCapaIds.length > 0)) {
        await setPpeIssueLinks({
          companyId: props.companyId,
          issueId: issue.id,
          ncrIds: selectedNcrIds as UUID[],
          correctiveActionIds: selectedCapaIds as UUID[],
          actorUserId: props.issuedByUserId
        });
      }
      props.onIssued?.();
      props.onClose();
      resetForm();
    } catch (err: unknown) {
      setError(formatAuthError(err as Error));
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setIssueDate(new Date().toISOString().slice(0, 10));
    setPpeItemId('');
    setSize('');
    setSizeOther('');
    setQuantityIssued(1);
    setReasonForIssue('');
    setReasonOther('');
    setIssuedToUserId('');
    setIssuedToEmployeeNumber('');
    setJobRole('');
    setSiteId('');
    setDepartmentId('');
    setNotes('');
    setUnitCostOverride('');
    setAdminOverrideInsufficientStock(false);
    setSelectedNcrIds([]);
    setSelectedCapaIds([]);
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-2xl mx-4 bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <p className="text-sm font-semibold text-charcoal">Issue PPE</p>
          <button
            type="button"
            onClick={props.onClose}
            className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-500"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
              <p className="text-sm font-semibold text-critical">Could not issue PPE</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Issue date *</label>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">PPE item *</label>
              <select
                value={ppeItemId}
                onChange={(e) => {
                  setPpeItemId(e.target.value);
                  setSize('');
                }}
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
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Size *</label>
              {sizesAvailable.length > 0 ? (
                <select
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                >
                  <option value="">Select size</option>
                  {sizesAvailable.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                  <option value="Other">Other</option>
                </select>
              ) : null}
              {(size === 'Other' || sizesAvailable.length === 0) && (
                <input
                  value={sizesAvailable.length === 0 ? size || sizeOther : sizeOther}
                  onChange={(e) =>
                    sizesAvailable.length === 0 ? setSize(e.target.value) : setSizeOther(e.target.value)
                  }
                  placeholder="Enter size"
                  className="mt-1 w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Quantity *</label>
              <input
                type="number"
                min={1}
                value={quantityIssued}
                onChange={(e) => setQuantityIssued(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Reason for issue *</label>
            <select
              value={reasonForIssue}
              onChange={(e) => setReasonForIssue(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            >
              <option value="">Select reason</option>
              {PPE_REASON_FOR_ISSUE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {reasonForIssue === 'Other' && (
              <input
                value={reasonOther}
                onChange={(e) => setReasonOther(e.target.value)}
                placeholder="Specify reason"
                className="mt-1 w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Issued by (auto-filled)</label>
            <input
              readOnly
              value={props.issuedByName ?? `User ${props.issuedByUserId.slice(0, 8)}`}
              className="w-full px-4 py-2.5 bg-surface-50 border border-surface-200 rounded-lg text-sm text-charcoal-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Issued to</label>
              <select
                value={issuedToUserId}
                onChange={(e) => setIssuedToUserId(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                <option value="">Select employee</option>
                {profiles.map((p) => (
                  <option key={p.user_id} value={p.user_id}>
                    {p.full_name ?? p.email ?? p.user_id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Employee number</label>
              <input
                value={issuedToEmployeeNumber}
                onChange={(e) => setIssuedToEmployeeNumber(e.target.value)}
                placeholder="Optional"
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Job role</label>
              <input
                value={jobRole}
                onChange={(e) => setJobRole(e.target.value)}
                placeholder="Optional"
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Site</label>
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
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Department</label>
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

          {selectedItem && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">
                  Unit cost {props.isAdmin ? '(editable)' : ''}
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={unitCostOverride !== '' ? unitCostOverride : (selectedItem.unit_cost ?? '')}
                  onChange={(e) => setUnitCostOverride(e.target.value)}
                  readOnly={!props.isAdmin}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Total cost</label>
                <p className="px-4 py-2.5 text-sm text-charcoal-700">
                  {totalCost != null ? `R ${totalCost.toFixed(2)}` : '—'}
                </p>
              </div>
            </div>
          )}

          {stockWarning && (
            <div className="bg-warning/10 border border-warning/30 rounded-xl p-3">
              <p className="text-sm text-charcoal-700">{stockWarning}</p>
              {props.isAdmin && (
                <label className="mt-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={adminOverrideInsufficientStock}
                    onChange={(e) => setAdminOverrideInsufficientStock(e.target.checked)}
                  />
                  <span className="text-sm">Override and record issue anyway (admin)</span>
                </label>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>

          <div className="border-t border-surface-200 pt-4 mt-2 space-y-4">
            <p className="text-sm font-semibold text-charcoal">Link to NCR / CAPA (optional)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Linked NCRs</label>
                <select
                  multiple
                  value={selectedNcrIds}
                  onChange={(e) =>
                    setSelectedNcrIds(Array.from(e.target.selectedOptions).map((o) => o.value))
                  }
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm h-28"
                >
                  {ncrOptions.map((ncr) => (
                    <option key={ncr.id} value={ncr.id}>
                      {ncr.nc_number ?? String(ncr.id).slice(0, 8)} — {ncr.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Linked CAPA</label>
                <select
                  multiple
                  value={selectedCapaIds}
                  onChange={(e) =>
                    setSelectedCapaIds(Array.from(e.target.selectedOptions).map((o) => o.value))
                  }
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm h-28"
                >
                  {capaOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {(c as { action_number?: string }).action_number ?? String(c.id).slice(0, 8)} — {c.title}
                    </option>
                  ))}
                </select>
              </div>
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
              Issue
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
