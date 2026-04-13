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
import {
  createPpeIssue,
  getPpeStockByLocation,
  setPpeIssueLinks,
  type CreatePpeIssueInput
} from '../../api/services/ppeService';
import { getMergedOptions, getBuiltInOptions } from '../../api/services/dynamicOptionsService';
import type { OptionItem } from '../../api/services/dynamicOptionsService';
import { SelectOrType } from '../ui/SelectOrType';
import { listQualityNcrs } from '../../api/services/qualityNcrsService';
import { listCorrectiveActions } from '../../api/services/correctiveActionsService';
import { listUserProfiles } from '../../api/services/profilesService';
import { listHrEmployees, type HrEmployee } from '../../api/services/hrService';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';

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
  const [issuedToEmployeeId, setIssuedToEmployeeId] = useState('');
  const [issuedToEmployeeNumber, setIssuedToEmployeeNumber] = useState('');
  const [jobRole, setJobRole] = useState('');
  const [nextIssueDate, setNextIssueDate] = useState('');
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
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [reasonOptions, setReasonOptions] = useState<OptionItem[]>([]);

  type PpeIssueDraft = {
    issueDate: string;
    ppeItemId: string;
    size: string;
    sizeOther: string;
    quantityIssued: number;
    reasonForIssue: string;
    reasonOther: string;
    issuedToUserId: string;
    issuedToEmployeeId: string;
    issuedToEmployeeNumber: string;
    jobRole: string;
    nextIssueDate: string;
    siteId: string;
    departmentId: string;
    notes: string;
    unitCostOverride: string;
    adminOverrideInsufficientStock: boolean;
    selectedNcrIds: string[];
    selectedCapaIds: string[];
  };

  const { restoreDraft, clearDraft } = useDraftManager();
  const draftKey = `ppe-issue:${props.companyId}:${props.issuedByUserId}`;

  const hasDirtyDraft = useMemo(() => {
    return (
      ppeItemId.trim().length > 0 ||
      size.trim().length > 0 ||
      sizeOther.trim().length > 0 ||
      quantityIssued !== 1 ||
      reasonForIssue.trim().length > 0 ||
      reasonOther.trim().length > 0 ||
      issuedToUserId.trim().length > 0 ||
      issuedToEmployeeId.trim().length > 0 ||
      issuedToEmployeeNumber.trim().length > 0 ||
      jobRole.trim().length > 0 ||
      nextIssueDate.trim().length > 0 ||
      siteId.trim().length > 0 ||
      departmentId.trim().length > 0 ||
      notes.trim().length > 0 ||
      unitCostOverride.trim().length > 0 ||
      adminOverrideInsufficientStock ||
      selectedNcrIds.length > 0 ||
      selectedCapaIds.length > 0
    );
  }, [
    adminOverrideInsufficientStock,
    departmentId,
    issuedToEmployeeId,
    issuedToEmployeeNumber,
    issuedToUserId,
    jobRole,
    nextIssueDate,
    notes,
    ppeItemId,
    quantityIssued,
    reasonForIssue,
    reasonOther,
    selectedCapaIds.length,
    selectedNcrIds.length,
    size,
    sizeOther,
    siteId,
    unitCostOverride
  ]);

  useDraftRegistration({
    key: draftKey,
    enabled: props.open,
    isDirty: () => hasDirtyDraft,
    serialize: () =>
      ({
        issueDate,
        ppeItemId,
        size,
        sizeOther,
        quantityIssued,
        reasonForIssue,
        reasonOther,
        issuedToUserId,
        issuedToEmployeeId,
        issuedToEmployeeNumber,
        jobRole,
        nextIssueDate,
        siteId,
        departmentId,
        notes,
        unitCostOverride,
        adminOverrideInsufficientStock,
        selectedNcrIds,
        selectedCapaIds
      }) satisfies PpeIssueDraft
  });

  useEffect(() => {
    if (!props.open) return;
    const restored = restoreDraft<PpeIssueDraft>(draftKey);
    if (!restored) return;

    setIssueDate(restored.issueDate ?? issueDate);
    setPpeItemId(restored.ppeItemId ?? ppeItemId);
    setSize(restored.size ?? '');
    setSizeOther(restored.sizeOther ?? '');
    setQuantityIssued(Number(restored.quantityIssued ?? 1));
    setReasonForIssue(restored.reasonForIssue ?? '');
    setReasonOther(restored.reasonOther ?? '');
    setIssuedToUserId(restored.issuedToUserId ?? '');
    setIssuedToEmployeeId(restored.issuedToEmployeeId ?? '');
    setIssuedToEmployeeNumber(restored.issuedToEmployeeNumber ?? '');
    setJobRole(restored.jobRole ?? '');
    setNextIssueDate(restored.nextIssueDate ?? '');
    setSiteId(restored.siteId ?? '');
    setDepartmentId(restored.departmentId ?? '');
    setNotes(restored.notes ?? '');
    setUnitCostOverride(restored.unitCostOverride ?? '');
    setAdminOverrideInsufficientStock(restored.adminOverrideInsufficientStock ?? false);
    setSelectedNcrIds(Array.isArray(restored.selectedNcrIds) ? restored.selectedNcrIds : []);
    setSelectedCapaIds(Array.isArray(restored.selectedCapaIds) ? restored.selectedCapaIds : []);
  }, [draftKey, props.open, restoreDraft]);

  const closeWithDraftClear = () => {
    clearDraft(draftKey);
    props.onClose();
  };

  useEffect(() => {
    async function load() {
      if (!props.open) return;
      try {
        const [ncrs, capas, profs, emps] = await Promise.all([
          listQualityNcrs({ companyId: props.companyId, limit: 100 }),
          listCorrectiveActions({ companyId: props.companyId, limit: 100 }),
          listUserProfiles(props.companyId),
          listHrEmployees(props.companyId)
        ]);
        setNcrOptions(ncrs);
        setCapaOptions(capas);
        setProfiles(profs ?? []);
        setEmployees(
          (emps ?? [])
            .filter(
              (e) =>
                e.employment_status === 'ONBOARDING' ||
                e.employment_status === 'ACTIVE' ||
                e.employment_status === 'ON_LEAVE' ||
                e.employment_status === 'SUSPENDED'
            )
            .sort((a, b) => {
              const aName = `${a.last_name ?? ''} ${a.first_name ?? ''}`.toLowerCase();
              const bName = `${b.last_name ?? ''} ${b.first_name ?? ''}`.toLowerCase();
              return aName.localeCompare(bName);
            })
        );
      } catch {
        // optional
      }
    }
    load();
  }, [props.companyId, props.open]);

  useEffect(() => {
    if (!props.open || !props.companyId) return;
    const builtIn = getBuiltInOptions('ppe', 'ppeIssueReason');
    getMergedOptions(
      { companyId: props.companyId, moduleKey: 'ppe', fieldKey: 'ppeIssueReason' },
      builtIn
    ).then(setReasonOptions).catch(() => setReasonOptions(builtIn.map((v) => ({ id: `builtin:${v}`, value: v, label: v }))));
  }, [props.open, props.companyId]);

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
    if (selectedItem && 'sizes_with_prices' in selectedItem && Array.isArray((selectedItem as any).sizes_with_prices)) {
      const sizesWithPrices = (selectedItem as any).sizes_with_prices as { size: string; price: number | null }[];
      const match = sizesWithPrices.find((row) => row.size === size);
      if (match && typeof match.price === 'number') return match.price;
    }
    return selectedItem?.unit_cost ?? null;
  }, [selectedItem, unitCostOverride, size]);
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
        reasonForIssue: reasonForIssue === 'Other' ? (reasonOther.trim() || null) : (reasonForIssue || null),
        issuedToUserId: issuedToUserId ? (issuedToUserId as UUID) : null,
        issuedToEmployeeId: issuedToEmployeeId ? (issuedToEmployeeId as UUID) : null,
        issuedToEmployeeNumber: issuedToEmployeeNumber.trim() || null,
        jobRole: jobRole.trim() || null,
        unitCostAtIssue: unitCost ?? null,
        notes: notes.trim() || null,
        nextIssueAt: nextIssueDate || null,
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
      clearDraft(draftKey);
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
    setIssuedToEmployeeId('');
    setIssuedToEmployeeNumber('');
    setJobRole('');
    setNextIssueDate('');
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={closeWithDraftClear} />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90dvh] overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <p className="text-sm font-semibold text-charcoal">Issue PPE</p>
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
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">
                Next issue date (optional)
              </label>
              <input
                type="date"
                value={nextIssueDate}
                onChange={(e) => setNextIssueDate(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
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

          <SelectOrType
            label="Reason for issue *"
            value={reasonForIssue === 'Other' ? reasonOther : reasonForIssue}
            onChange={(v, isCustom) => {
              if (isCustom) {
                setReasonForIssue('Other');
                setReasonOther(v);
              } else {
                setReasonForIssue(v);
                setReasonOther('');
              }
            }}
            options={reasonOptions}
            placeholder="Select reason"
            otherLabel="Other / Type manually"
            required
            allowCreate
            companyId={props.companyId}
            moduleKey="ppe"
            fieldKey="ppeIssueReason"
            createdByUserId={props.issuedByUserId}
          />

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
              <label className="block text-sm font-medium text-charcoal mb-1.5">Issued to (HR employee)</label>
              <select
                value={issuedToEmployeeId}
                onChange={(e) => {
                  const employeeId = e.target.value;
                  setIssuedToEmployeeId(employeeId);
                  const emp = (employees ?? []).find((x) => String(x.id) === String(employeeId)) ?? null;
                  setIssuedToUserId(emp?.user_id ? String(emp.user_id) : '');
                  if (emp?.employee_no) setIssuedToEmployeeNumber(String(emp.employee_no));
                }}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                <option value="">Select employee</option>
                {(employees ?? []).map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {`${emp.last_name ?? ''}, ${emp.first_name ?? ''}`.trim()} — {emp.employee_no}
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
              Issue
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
