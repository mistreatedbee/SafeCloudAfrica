import React, { useEffect, useMemo, useState } from 'react';
import { PlusIcon, Edit2Icon, ArchiveIcon, RefreshCwIcon } from 'lucide-react';
import type { ModuleKey, UUID } from '../../api/models/core';
import type { InspectionChecklistTemplate } from '../../api/models/entities';
import {
  listInspectionChecklistTemplates,
  createInspectionChecklistTemplate,
  updateInspectionChecklistTemplate
} from '../../api/services/inspectionsService';
import { LoadingSpinner } from '../ui/LoadingSpinner';

type Props = {
  companyId: UUID;
  canManage: boolean;
};

type TemplateFormState = {
  id?: UUID;
  name: string;
  description: string;
  module: ModuleKey;
  scope: 'global' | 'site' | 'department';
};

export function InspectionChecklistLibrary(props: Props) {
  const [moduleFilter, setModuleFilter] = useState<ModuleKey | 'all'>('all');
  const [templates, setTemplates] = useState<InspectionChecklistTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<TemplateFormState | null>(null);
  const [saving, setSaving] = useState(false);

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
      setTemplates(data as any);
    } catch (err: any) {
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
      description: '',
      module: 'safety',
      scope: 'global'
    });
  }

  function startEdit(t: InspectionChecklistTemplate) {
    setEditing({
      id: t.id,
      name: t.name,
      description: t.description ?? '',
      module: t.module,
      scope: t.scope
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
      if (editing.id) {
        await updateInspectionChecklistTemplate({
          companyId: props.companyId,
          templateId: editing.id,
          name: editing.name.trim(),
          description: editing.description.trim() || null,
          scope: editing.scope,
          updatedByUserId: props.companyId as unknown as UUID // Note: will be replaced with real user id via service layer if needed
        });
      } else {
        await createInspectionChecklistTemplate({
          companyId: props.companyId,
          module: editing.module,
          name: editing.name.trim(),
          description: editing.description.trim() || undefined,
          scope: editing.scope,
          createdByUserId: props.companyId as unknown as UUID
        });
      }
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
        updatedByUserId: props.companyId as unknown as UUID
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
      ) : visibleTemplates.length === 0 ? (
        <div className="text-sm text-charcoal-500 border border-dashed border-surface-300 rounded-xl p-4">
          No checklist templates yet. Create your first template to standardise inspections.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleTemplates.map((t) => (
            <div
              key={t.id}
              className="border border-surface-200 rounded-xl p-4 bg-white shadow-card flex flex-col gap-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-charcoal">{t.name}</p>
                  <p className="text-xs text-charcoal-500 mt-0.5">
                    {t.module} • {t.scope}
                  </p>
                </div>
                {props.canManage && (
                  <div className="flex items-center gap-1">
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
      )}

      {editing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditing(null)} />
          <div className="relative w-full max-w-lg mx-4 bg-white rounded-2xl shadow-xl border border-surface-200 p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-charcoal">
                {editing.id ? 'Edit Checklist Template' : 'New Checklist Template'}
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-charcoal mb-1.5">Name *</label>
                <input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-surface-300 text-sm"
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
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-surface-200">
              <button
                type="button"
                onClick={() => setEditing(null)}
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
    </div>
  );
}

