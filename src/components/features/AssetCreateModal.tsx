import React, { useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { Asset, UUID } from '../../api/models/entities';
import { createAsset } from '../../api/services/assetManagementService';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';

export function AssetCreateModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  createdByUserId: UUID;
  onCreated?: () => void;
}) {
  const { restoreDraft, clearDraft } = useDraftManager();
  const draftKey = `asset-create:${props.companyId}:${props.createdByUserId}`;
  const [name, setName] = useState('');
  const [assetTag, setAssetTag] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [status, setStatus] = useState<Asset['status']>('active');
  const [maintenanceDueDate, setMaintenanceDueDate] = useState('');
  const [inspectionDueDate, setInspectionDueDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => name.trim().length > 1, [name]);
  const hasDirtyDraft = useMemo(
    () =>
      props.open &&
      (name.trim().length > 0 ||
        assetTag.trim().length > 0 ||
        category.trim().length > 0 ||
        location.trim().length > 0 ||
        status !== 'active' ||
        maintenanceDueDate.length > 0 ||
        inspectionDueDate.length > 0),
    [assetTag, category, inspectionDueDate, location, maintenanceDueDate, name, props.open, status]
  );

  function resetForm() {
    setName('');
    setAssetTag('');
    setCategory('');
    setLocation('');
    setStatus('active');
    setMaintenanceDueDate('');
    setInspectionDueDate('');
  }

  useDraftRegistration({
    key: draftKey,
    label: 'Asset Form',
    enabled: props.open,
    metadata: {
      organizationId: props.companyId,
      moduleName: 'asset_management',
      formType: 'asset-create'
    },
    isDirty: () => hasDirtyDraft,
    serialize: () => ({
      name,
      assetTag,
      category,
      location,
      status,
      maintenanceDueDate,
      inspectionDueDate
    })
  });

  React.useEffect(() => {
    if (!props.open) return;
    const restored = restoreDraft<{
      name?: string;
      assetTag?: string;
      category?: string;
      location?: string;
      status?: Asset['status'];
      maintenanceDueDate?: string;
      inspectionDueDate?: string;
    }>(draftKey);

    if (!restored) return;
    setName(restored.name ?? '');
    setAssetTag(restored.assetTag ?? '');
    setCategory(restored.category ?? '');
    setLocation(restored.location ?? '');
    setStatus(restored.status ?? 'active');
    setMaintenanceDueDate(restored.maintenanceDueDate ?? '');
    setInspectionDueDate(restored.inspectionDueDate ?? '');
  }, [draftKey, props.open, restoreDraft]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      setLoading(true);
      await createAsset({
        companyId: props.companyId,
        name: name.trim(),
        assetTag: assetTag.trim() || null,
        category: category.trim() || null,
        location: location.trim() || null,
        status,
        maintenanceDueDate: maintenanceDueDate || null,
        inspectionDueDate: inspectionDueDate || null,
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
          <p className="text-sm font-semibold text-charcoal">Add asset</p>
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
            <label className="block text-sm font-medium text-charcoal mb-1.5">Asset name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Forklift FL-12"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Asset tag</label>
              <input
                value={assetTag}
                onChange={(e) => setAssetTag(e.target.value)}
                placeholder="AST-001"
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Category</label>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Plant / vehicle / tool"
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Location</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Warehouse A / Site yard"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Asset['status'])}
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="under_maintenance">Under maintenance</option>
              <option value="disposed">Disposed</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Maintenance due</label>
              <input
                type="date"
                value={maintenanceDueDate}
                onChange={(e) => setMaintenanceDueDate(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Inspection due</label>
              <input
                type="date"
                value={inspectionDueDate}
                onChange={(e) => setInspectionDueDate(e.target.value)}
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
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading && <LoadingSpinner size={16} />}
              Add asset
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
