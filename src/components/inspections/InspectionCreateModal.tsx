import React, { useEffect, useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { toUserFacingError } from '../../utils/userFacingMessage';
import type { ModuleKey, UUID } from '../../api/models/core';
import { createInspection, listInspectionChecklistTemplates } from '../../api/services/inspectionsService';
import { listUserProfiles } from '../../api/services/profilesService';
import type { UserProfile } from '../../api/models/entities';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';

type ChecklistTemplateOption = {
  id: string;
  name: string;
  module: ModuleKey;
  scope: 'global' | 'site' | 'department';
};

export function InspectionCreateModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  createdByUserId: UUID;
  onCreated?: () => void;
}) {
  const [module, setModule] = useState<ModuleKey>('safety');
  const [templateId, setTemplateId] = useState<string>('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [inspectionDate, setInspectionDate] = useState('');
  const [location, setLocation] = useState('');
  const [sector, setSector] = useState('');
  const [department, setDepartment] = useState('');
  const [frequency, setFrequency] = useState<'daily' | 'monthly' | 'audit-linked'>('daily');
  const [inspectorUserId, setInspectorUserId] = useState('');
  const [auditorUserId, setAuditorUserId] = useState('');
  const [templates, setTemplates] = useState<ChecklistTemplateOption[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  const { restoreDraft, clearDraft } = useDraftManager();
  const draftKey = `inspection-create:${props.companyId}:${props.createdByUserId}`;

  const hasDirtyDraft = useMemo(
    () =>
      props.open &&
      (templateId.trim().length > 0 ||
        scheduledAt.trim().length > 0 ||
        inspectionDate.trim().length > 0 ||
        location.trim().length > 0 ||
        sector.trim().length > 0 ||
        department.trim().length > 0 ||
        frequency !== 'daily' ||
        inspectorUserId.trim().length > 0 ||
        auditorUserId.trim().length > 0 ||
        module !== 'safety'),
    [auditorUserId, department, frequency, inspectorUserId, inspectionDate, location, module, props.open, props.companyId, props.createdByUserId, scheduledAt, sector, templateId]
  );

  useDraftRegistration({
    key: draftKey,
    enabled: props.open,
    isDirty: () => hasDirtyDraft,
    serialize: () => ({
      module,
      templateId,
      scheduledAt,
      inspectionDate,
      location,
      sector,
      department,
      frequency,
      inspectorUserId,
      auditorUserId
    })
  });

  useEffect(() => {
    if (!props.open) return;
    const restored = restoreDraft<{
      module?: ModuleKey;
      templateId?: string;
      scheduledAt?: string;
      inspectionDate?: string;
      location?: string;
      sector?: string;
      department?: string;
      frequency?: 'daily' | 'monthly' | 'audit-linked';
      inspectorUserId?: string;
      auditorUserId?: string;
    }>(draftKey);

    if (!restored) return;

    setModule(restored.module ?? 'safety');
    setTemplateId(restored.templateId ?? '');
    setScheduledAt(restored.scheduledAt ?? '');
    setInspectionDate(restored.inspectionDate ?? '');
    setLocation(restored.location ?? '');
    setSector(restored.sector ?? '');
    setDepartment(restored.department ?? '');
    setFrequency(restored.frequency ?? 'daily');
    setInspectorUserId(restored.inspectorUserId ?? '');
    setAuditorUserId(restored.auditorUserId ?? '');
  }, [draftKey, props.open, restoreDraft]);

  useEffect(() => {
    async function loadTemplates() {
      if (!props.companyId) return;
      try {
        setLoadingTemplates(true);
        const data = await listInspectionChecklistTemplates({
          companyId: props.companyId,
          module,
          includeInactive: false
        });
        setTemplates(
          data.map((t) => ({
            id: t.id,
            name: t.name,
            module: t.module,
            scope: t.scope
          }))
        );
        if (data.length > 0) {
          setTemplateId((prev) => prev || data[0].id);
        }
      } catch (err) {
        console.error('Failed to load inspection templates', err);
      } finally {
        setLoadingTemplates(false);
      }
    }
    loadTemplates();
  }, [props.companyId, module]);

  useEffect(() => {
    async function loadProfiles() {
      if (!props.companyId) return;
      try {
        const data = await listUserProfiles(props.companyId);
        setProfiles(data);
      } catch {
        setProfiles([]);
      }
    }
    loadProfiles();
  }, [props.companyId]);

  const canSubmit = useMemo(() => !!templateId && !loading, [templateId, loading]);

  useEffect(() => {
    if (!props.open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') props.onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [props.open, props.onClose]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      setLoading(true);
      const selectedTemplate = templates.find((t) => t.id === templateId);
      const title = selectedTemplate ? `[INSPECTION] ${selectedTemplate.name}` : '[INSPECTION] Inspection';
      
      await createInspection({
        companyId: props.companyId,
        module,
        title,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        inspectionDate: inspectionDate || undefined,
        location: location.trim() || undefined,
        sector: sector.trim() || undefined,
        frequency,
        inspectorUserId: inspectorUserId ? (inspectorUserId as UUID) : undefined,
        auditorUserId: auditorUserId ? (auditorUserId as UUID) : undefined,
        createdByUserId: props.createdByUserId,
        templateId: templateId as UUID
      });
      
      clearDraft(draftKey);
      props.onCreated?.();
      props.onClose();
      resetForm();
    } catch (err) {
      setError(toUserFacingError(err, 'Failed to create inspection. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setTemplateId('');
    setScheduledAt('');
    setInspectionDate('');
    setLocation('');
    setSector('');
    setDepartment('');
    setFrequency('daily');
    setInspectorUserId('');
    setAuditorUserId('');
    setModule('safety');
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div role="dialog" aria-modal="true" className="relative w-full max-w-5xl bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90dvh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-surface-200 px-4 py-4 sm:px-6 flex items-center justify-between z-10">
          <div>
            <p className="text-sm font-semibold text-charcoal">Create Inspection Checklist</p>
            <p className="text-xs text-charcoal-500 mt-0.5">Google Forms-style checklist builder. NCs will auto-escalate to NCR.</p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-surface-100 text-charcoal-500 shrink-0"
            aria-label="Close"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-4 sm:p-6 space-y-6">
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
              <p className="text-sm font-semibold text-critical">Could not create inspection</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}

          {/* Basic Information */}
          <div className="border-b border-surface-200 pb-4">
            <h3 className="text-sm font-semibold text-charcoal mb-4">Basic Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Module</label>
                <select
                  value={module}
                  onChange={(e) => setModule(e.target.value as ModuleKey)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                >
                  <option value="safety">Safety</option>
                  <option value="quality">Quality</option>
                  <option value="environment">Environment</option>
                  <option value="health">Health</option>
                  <option value="legal">Legal</option>
                  <option value="hr">HR</option>
                  <option value="general">General</option>
                  <option value="security">Security</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Checklist Template *</label>
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  required
                  disabled={loadingTemplates}
                >
                  <option value="">{loadingTemplates ? 'Loading templates…' : 'Select a template'}</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-charcoal-500">
                  Templates are managed in the Inspections &quot;Checklist Library&quot;.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Scheduled Date</label>
                <input
                  type="date"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Inspection Date</label>
                <input
                  type="date"
                  value={inspectionDate}
                  onChange={(e) => setInspectionDate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-charcoal mb-1.5">Location</label>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Site A, Warehouse B"
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Sector</label>
                <input
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                  placeholder="e.g. Mining, Construction"
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Department</label>
                <input
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. Operations"
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Frequency</label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as 'daily' | 'monthly' | 'audit-linked')}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                >
                  <option value="daily">Daily</option>
                  <option value="monthly">Monthly</option>
                  <option value="audit-linked">Audit-linked</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Inspector</label>
                <select
                  value={inspectorUserId}
                  onChange={(e) => setInspectorUserId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                >
                  <option value="">Select inspector</option>
                  {profiles.map((p) => (
                    <option key={p.user_id} value={p.user_id}>
                      {p.full_name || p.email || p.user_id}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Auditor</label>
                <select
                  value={auditorUserId}
                  onChange={(e) => setAuditorUserId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                >
                  <option value="">Select auditor</option>
                  {profiles.map((p) => (
                    <option key={p.user_id} value={p.user_id}>
                      {p.full_name || p.email || p.user_id}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>


          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-4 border-t border-surface-200">
            <button
              type="button"
              onClick={props.onClose}
              className="min-h-[44px] inline-flex items-center justify-center px-4 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || loading}
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60 disabled:cursor-not-allowed w-full sm:w-auto"
            >
              {loading && <LoadingSpinner size={16} />}
              {loading ? 'Saving...' : 'Create Inspection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

