import React, { useEffect, useMemo, useState } from 'react';
import { PlusIcon, Edit2Icon, ArchiveIcon, RefreshCwIcon, XIcon } from 'lucide-react';
import type { ModuleKey, UUID } from '../../api/models/core';
import type { InspectionChecklistTemplate } from '../../api/models/entities';
import {
  listInspectionChecklistTemplates,
  createInspectionChecklistTemplate,
  updateInspectionChecklistTemplate
} from '../../api/services/inspectionsService';
import { listUserProfiles } from '../../api/services/profilesService';
import type { UserProfile } from '../../api/models/entities';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { useUser } from '@insforge/react';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';
import { InspectionChecklistItemBuilder } from './InspectionChecklistItemBuilder';
import {
  INSPECTION_FREQUENCY_OPTIONS,
  formatInspectionFrequencyLabel,
  type InspectionFrequency
} from '../../utils/inspectionFrequency';

type Props = {
  companyId: UUID;
  canManage: boolean;
  defaultModule?: ModuleKey;
};

type TemplateFormState = {
  id?: UUID;
  name: string;
  subtitle: string;
  description: string;
  module: ModuleKey;
  scope: 'global' | 'site' | 'department';
  defaultArea: string;
  frequency: InspectionFrequency;
  defaultAuditorUserId: string;
  defaultAreaManagerUserId: string;
};

export function InspectionChecklistLibrary(props: Props) {
  const { user } = useUser();
  const [moduleFilter, setModuleFilter] = useState<ModuleKey | 'all'>(props.defaultModule ?? 'all');
  const [templates, setTemplates] = useState<InspectionChecklistTemplate[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchSucceeded, setFetchSucceeded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<TemplateFormState | null>(null);
  const [buildingTemplate, setBuildingTemplate] = useState<InspectionChecklistTemplate | null>(null);
  const [saving, setSaving] = useState(false);

  const { restoreDraft, clearDraft } = useDraftManager();
  const draftKey = `inspection-checklist-library:${props.companyId}:${user?.id ?? 'anon'}`;

  const hasDirtyDraft = useMemo(() => {
    if (!editing) return false;
    return editing.name.trim().length > 0 || editing.description.trim().length > 0;
  }, [editing]);

  useDraftRegistration({
    key: draftKey,
    enabled: props.canManage && editing !== null,
    isDirty: () => hasDirtyDraft,
    serialize: () => editing
  });

  useEffect(() => {
    if (!props.canManage) return;
    const restored = restoreDraft<TemplateFormState>(draftKey);
    if (!restored) return;
    setEditing(restored);
  }, [draftKey, props.canManage, restoreDraft]);

  useEffect(() => {
    async function loadProfiles() {
      try {
        const data = await listUserProfiles(props.companyId);
        setProfiles(data);
      } catch {
        setProfiles([]);
      }
    }
    void loadProfiles();
  }, [props.companyId]);

  async function refresh() {
    if (!props.companyId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await listInspectionChecklistTemplates({
        companyId: props.companyId,
        module: moduleFilter === 'all' ? undefined : moduleFilter,
        includeInactive: true
      });
      setTemplates(data);
      setFetchSucceeded(true);
    } catch (err: any) {
      setFetchSucceeded(false);
      setError(err.message ?? 'Failed to load checklist templates.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [props.companyId, moduleFilter]);

  const visibleTemplates = useMemo(() => templates, [templates]);

  function startCreate() {
    setEditing({
      name: '',
      subtitle: '',
      description: '',
      module: props.defaultModule ?? 'safety',
      scope: 'global',
      defaultArea: '',
      frequency: 'monthly',
      defaultAuditorUserId: '',
      defaultAreaManagerUserId: ''
    });
  }

  function startEdit(t: InspectionChecklistTemplate) {
    setEditing({
      id: t.id,
      name: t.name,
      subtitle: t.subtitle ?? '',
      description: t.description ?? '',
      module: t.module,
      scope: t.scope,
      defaultArea: t.default_area ?? '',
      frequency: (t.frequency ?? 'monthly') as InspectionFrequency,
      defaultAuditorUserId: t.default_auditor_user_id ?? '',
      defaultAreaManagerUserId: t.default_area_manager_user_id ?? ''
    });
  }

  async function saveTemplate() {
    if (!editing) return;
    if (!editing.name.trim()) {
      setError('Template name is required.');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const payload = {
        companyId: props.companyId,
        name: editing.name.trim(),
        subtitle: editing.subtitle.trim() || null,
        description: editing.description.trim() || undefined,
        scope: editing.scope,
        defaultArea: editing.defaultArea.trim() || null,
        frequency: editing.frequency,
        defaultAuditorUserId: (editing.defaultAuditorUserId || null) as UUID | null,
        defaultAreaManagerUserId: (editing.defaultAreaManagerUserId || null) as UUID | null
      };
      if (editing.id) {
        await updateInspectionChecklistTemplate({
          ...payload,
          templateId: editing.id,
          updatedByUserId: (user?.id ?? props.companyId) as UUID
        });
      } else {
        await createInspectionChecklistTemplate({
          ...payload,
          module: editing.module,
          createdByUserId: (user?.id ?? props.companyId) as UUID
        });
      }
      clearDraft(draftKey);
      setEditing(null);
      await refresh();
    } catch (err: any) {
      setError(err.message ?? 'Failed to save template.');
    } finally {
      setSaving(false);
    }
  }

  async function archiveTemplate(t: InspectionChecklistTemplate) {
    if (!props.canManage) return;
    try {
      setSaving(true);
      await updateInspectionChecklistTemplate({
        companyId: props.companyId,
        templateId: t.id,
        isActive: !t.is_active,
        updatedByUserId: (user?.id ?? props.companyId) as UUID
      });
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value as ModuleKey | 'all')}
            className="px-3 py-1.5 rounded-lg border border-surface-300 text-sm bg-white"
          >
            <option value="all">All modules</option>
            <option value="safety">Safety</option>
            <option value="quality">Quality</option>
            <option value="environment">Environment</option>
            <option value="health">Health</option>
            <option value="legal">Legal</option>
            <option value="hr">HR</option>
            <option value="general">General</option>
            <option value="security">Security</option>
          </select>
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-surface-300 text-xs text-charcoal hover:bg-surface-50"
          >
            <RefreshCwIcon className="w-3 h-3" />
            Refresh
          </button>
        </div>
        {props.canManage && (
          <button
            type="button"
            onClick={startCreate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600"
          >
            <PlusIcon className="w-4 h-4" />
            New Template
          </button>
        )}
      </div>

      {error && (
        <div className="bg-critical/5 border border-critical/20 rounded-xl p-3 text-sm text-critical">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-charcoal-500">
          <LoadingSpinner size={16} />
          Loading templates…
        </div>
      ) : fetchSucceeded && visibleTemplates.length === 0 ? (
        <div className="text-sm text-charcoal-500 border border-dashed border-surface-300 rounded-xl p-4">
          No checklist templates yet. Create your first template to standardise inspections.
        </div>
      ) : fetchSucceeded ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleTemplates.map((t) => (
            <div
              key={t.id}
              className="border border-surface-200 rounded-xl p-4 bg-white shadow-card flex flex-col gap-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-charcoal">{t.name}</p>
                  {t.subtitle && <p className="text-xs text-charcoal-600">{t.subtitle}</p>}
                  <p className="text-xs text-charcoal-500 mt-0.5">
                    {t.module} • {t.scope}
                    {t.frequency ? ` • ${formatInspectionFrequencyLabel(t.frequency)}` : ''}
                  </p>
                </div>
                {props.canManage && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setBuildingTemplate(t)}
                      className="px-2 py-1 rounded-lg border border-teal/30 text-[11px] text-teal font-medium hover:bg-teal/5"
                    >
                      Items
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(t)}
                      className="p-1.5 rounded-lg border border-surface-200 text-xs text-charcoal-500 hover:bg-surface-50"
                    >
                      <Edit2Icon className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void archiveTemplate(t)}
                      className="p-1.5 rounded-lg border border-surface-200 text-xs text-charcoal-500 hover:bg-surface-50"
                    >
                      <ArchiveIcon className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
              {t.description && (
                <p className="text-xs text-charcoal-600 line-clamp-2">{t.description}</p>
              )}
              {!t.is_active && (
                <p className="mt-1 text-[11px] text-charcoal-400 uppercase tracking-wide">
                  Archived
                </p>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {editing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditing(null)} />
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90dvh] overflow-y-auto">
            <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-4 border-b border-surface-200">
              <p className="text-sm font-semibold text-charcoal">
                {editing.id ? 'Edit Checklist Template' : 'New Checklist Template'}
              </p>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-surface-100 text-charcoal-500 shrink-0"
                aria-label="Close"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-charcoal mb-1.5">Title *</label>
                <input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-surface-300 text-sm"
                  placeholder="e.g. Vehicle inspection"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-charcoal mb-1.5">Sub-title</label>
                <input
                  value={editing.subtitle}
                  onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-surface-300 text-sm"
                  placeholder="e.g. Section 2 — Environmental Compliance"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-charcoal mb-1.5">Module</label>
                <select
                  value={editing.module}
                  onChange={(e) =>
                    setEditing({ ...editing, module: e.target.value as ModuleKey })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-surface-300 text-sm"
                  disabled={!!editing.id}
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
                <label className="block text-xs font-medium text-charcoal mb-1.5">Scope</label>
                <select
                  value={editing.scope}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      scope: e.target.value as 'global' | 'site' | 'department'
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-surface-300 text-sm"
                >
                  <option value="global">Global</option>
                  <option value="site">Site</option>
                  <option value="department">Department</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-charcoal mb-1.5">Default area</label>
                <input
                  value={editing.defaultArea}
                  onChange={(e) => setEditing({ ...editing, defaultArea: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-surface-300 text-sm"
                  placeholder="e.g. Plant A — north yard"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-charcoal mb-1.5">Frequency</label>
                <select
                  value={editing.frequency}
                  onChange={(e) =>
                    setEditing({ ...editing, frequency: e.target.value as InspectionFrequency })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-surface-300 text-sm"
                >
                  {INSPECTION_FREQUENCY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-charcoal mb-1.5">Default auditor</label>
                <select
                  value={editing.defaultAuditorUserId}
                  onChange={(e) => setEditing({ ...editing, defaultAuditorUserId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-surface-300 text-sm"
                >
                  <option value="">None</option>
                  {profiles.map((p) => (
                    <option key={p.user_id} value={p.user_id}>
                      {p.full_name || p.email || p.user_id}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-charcoal mb-1.5">Area manager</label>
                <select
                  value={editing.defaultAreaManagerUserId}
                  onChange={(e) => setEditing({ ...editing, defaultAreaManagerUserId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-surface-300 text-sm"
                >
                  <option value="">None</option>
                  {profiles.map((p) => (
                    <option key={p.user_id} value={p.user_id}>
                      {p.full_name || p.email || p.user_id}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-charcoal mb-1.5">
                  Description
                </label>
                <textarea
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-surface-300 text-sm"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-surface-200 px-5 pb-5">
              <button
                type="button"
                onClick={() => {
                  clearDraft(draftKey);
                  setEditing(null);
                }}
                className="px-4 py-2 rounded-lg border border-surface-300 text-xs font-medium text-charcoal hover:bg-surface-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveTemplate()}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-xs font-semibold hover:bg-teal-600 disabled:opacity-60"
              >
                {saving && <LoadingSpinner size={14} />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {buildingTemplate && user?.id && (
        <InspectionChecklistItemBuilder
          open={Boolean(buildingTemplate)}
          onClose={() => {
            setBuildingTemplate(null);
            void refresh();
          }}
          companyId={props.companyId}
          template={buildingTemplate}
        />
      )}
    </div>
  );
}
