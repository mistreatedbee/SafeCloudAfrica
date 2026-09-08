import React, { useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { HazardousChemical, UUID } from '../../api/models/entities';
import { createHazardousChemical } from '../../api/services/hazardousChemicalsService';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';

export function HazardousChemicalCreateModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  createdByUserId: UUID;
  onCreated?: () => void;
}) {
  const { restoreDraft, clearDraft } = useDraftManager();
  const draftKey = `hazchem-create:${props.companyId}:${props.createdByUserId}`;
  const [chemicalName, setChemicalName] = useState('');
  const [casNumber, setCasNumber] = useState('');
  const [storageLocation, setStorageLocation] = useState('');
  const [quantity, setQuantity] = useState('');
  const [hazardClass, setHazardClass] = useState('');
  const [sdsStatus, setSdsStatus] = useState<HazardousChemical['sds_status']>('missing');
  const [approvalStatus, setApprovalStatus] = useState<HazardousChemical['approval_status']>('pending');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => chemicalName.trim().length > 1, [chemicalName]);
  const hasDirtyDraft = useMemo(
    () =>
      props.open &&
      (chemicalName.trim().length > 0 ||
        casNumber.trim().length > 0 ||
        storageLocation.trim().length > 0 ||
        quantity.trim().length > 0 ||
        hazardClass.trim().length > 0 ||
        sdsStatus !== 'missing' ||
        approvalStatus !== 'pending'),
    [approvalStatus, casNumber, chemicalName, hazardClass, props.open, quantity, sdsStatus, storageLocation]
  );

  function resetForm() {
    setChemicalName('');
    setCasNumber('');
    setStorageLocation('');
    setQuantity('');
    setHazardClass('');
    setSdsStatus('missing');
    setApprovalStatus('pending');
  }

  useDraftRegistration({
    key: draftKey,
    label: 'Chemical Register Form',
    enabled: props.open,
    metadata: {
      organizationId: props.companyId,
      moduleName: 'hazardous_chemical_management',
      formType: 'hazchem-create'
    },
    isDirty: () => hasDirtyDraft,
    serialize: () => ({
      chemicalName,
      casNumber,
      storageLocation,
      quantity,
      hazardClass,
      sdsStatus,
      approvalStatus
    })
  });

  React.useEffect(() => {
    if (!props.open) return;
    const restored = restoreDraft<{
      chemicalName?: string;
      casNumber?: string;
      storageLocation?: string;
      quantity?: string;
      hazardClass?: string;
      sdsStatus?: HazardousChemical['sds_status'];
      approvalStatus?: HazardousChemical['approval_status'];
    }>(draftKey);

    if (!restored) return;
    setChemicalName(restored.chemicalName ?? '');
    setCasNumber(restored.casNumber ?? '');
    setStorageLocation(restored.storageLocation ?? '');
    setQuantity(restored.quantity ?? '');
    setHazardClass(restored.hazardClass ?? '');
    setSdsStatus(restored.sdsStatus ?? 'missing');
    setApprovalStatus(restored.approvalStatus ?? 'pending');
  }, [draftKey, props.open, restoreDraft]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      setLoading(true);
      await createHazardousChemical({
        companyId: props.companyId,
        chemicalName: chemicalName.trim(),
        casNumber: casNumber.trim() || null,
        storageLocation: storageLocation.trim() || null,
        quantity: quantity.trim() || null,
        hazardClass: hazardClass.trim() || null,
        sdsStatus,
        approvalStatus,
        createdByUserId: props.createdByUserId
      });
      clearDraft(draftKey);
      props.onCreated?.();
      props.onClose();
      resetForm();
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
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90dvh] overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <p className="text-sm font-semibold text-charcoal">Add chemical</p>
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
              <p className="text-sm font-semibold text-critical">Could not create</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Chemical name *</label>
            <input
              value={chemicalName}
              onChange={(e) => setChemicalName(e.target.value)}
              placeholder="e.g. Acetone"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">CAS number</label>
              <input
                value={casNumber}
                onChange={(e) => setCasNumber(e.target.value)}
                placeholder="67-64-1"
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Quantity</label>
              <input
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="20 L"
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Storage location</label>
              <input
                value={storageLocation}
                onChange={(e) => setStorageLocation(e.target.value)}
                placeholder="Chemical store A"
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Hazard class</label>
              <input
                value={hazardClass}
                onChange={(e) => setHazardClass(e.target.value)}
                placeholder="Flammable liquid"
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">SDS status</label>
              <select
                value={sdsStatus}
                onChange={(e) => setSdsStatus(e.target.value as HazardousChemical['sds_status'])}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                <option value="missing">Missing</option>
                <option value="on_file">On file</option>
                <option value="expired">Expired</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Approval status</label>
              <select
                value={approvalStatus}
                onChange={(e) => setApprovalStatus(e.target.value as HazardousChemical['approval_status'])}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="restricted">Restricted</option>
              </select>
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
              Add chemical
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
