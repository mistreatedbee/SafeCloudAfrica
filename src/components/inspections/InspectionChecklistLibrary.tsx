import React, { useEffect, useMemo, useState } from 'react';
import { PlusIcon, Edit2Icon, ArchiveIcon, RefreshCwIcon, XIcon, ChevronUpIcon, ChevronDownIcon, Trash2Icon, CopyIcon } from 'lucide-react';
import type { ModuleKey, UUID } from '../../api/models/core';
import type { InspectionChecklistTemplate } from '../../api/models/entities';
import {
  listInspectionChecklistTemplates,
  createInspectionChecklistTemplate,
  updateInspectionChecklistTemplate,
  listInspectionChecklistItems,
  upsertInspectionChecklistItems,
  deleteInspectionChecklistItem
} from '../../api/services/inspectionsService';
import { HrEmployeeSelect } from '../ui/HrEmployeeSelect';
import { listHrEmployees, type HrEmployee } from '../../api/services/hrService';
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
  /** Display-only: the HR employee id behind the selected default auditor/area
      manager, since those may not have a linked platform login (defaultXUserId
      stays the real user_id used for auto-notification, kept null when the
      selected employee has no login). */
  defaultAuditorHrEmployeeId: string;
  defaultAreaManagerHrEmployeeId: string;
};

type QuestionRow = {
  key: string;
  id?: UUID;
  section: string;
  idNumber: string;
  question: string;
  score: string;
  riskLevel: 'low' | 'medium' | 'high';
};

let questionRowSeq = 0;
function newQuestionRow(section = ''): QuestionRow {
  questionRowSeq += 1;
  return { key: `q-${Date.now()}-${questionRowSeq}`, section, idNumber: '', question: '', score: '1', riskLevel: 'medium' };
}

export function InspectionChecklistLibrary(props: Props) {
  const { user } = useUser();
  const [moduleFilter, setModuleFilter] = useState<ModuleKey | 'all'>(props.defaultModule ?? 'all');
  const [templates, setTemplates] = useState<InspectionChecklistTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchSucceeded, setFetchSucceeded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<TemplateFormState | null>(null);
  const [buildingTemplate, setBuildingTemplate] = useState<InspectionChecklistTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<UUID | null>(null);
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [questionRows, setQuestionRows] = useState<QuestionRow[]>([]);
  const [removedItemIds, setRemovedItemIds] = useState<UUID[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!props.companyId) return;
    listHrEmployees(props.companyId).then(setEmployees).catch(() => setEmployees([]));
  }, [props.companyId]);

  const employeeIdByUserId = useMemo(
    () => new Map(employees.filter((e) => e.user_id).map((e) => [e.user_id as string, e.id])),
    [employees]
  );

  const { restoreDraft, clearDraft } = useDraftManager();
  const draftKey = `inspection-checklist-library:${props.companyId}:${user?.id ?? 'anon'}`;

  const hasDirtyDraft = useMemo(() => {
    if (!editing) return false;
    return (
      editing.name.trim().length > 0 ||
      editing.description.trim().length > 0 ||
      questionRows.some((r) => r.question.trim().length > 0)
    );
  }, [editing, questionRows]);

  useDraftRegistration({
    key: draftKey,
    enabled: props.canManage && editing !== null,
    isDirty: () => hasDirtyDraft,
    serialize: () => ({ editing, questionRows, removedItemIds })
  });

  useEffect(() => {
    if (!props.canManage) return;
    const restored = restoreDraft<
      TemplateFormState | { editing: TemplateFormState | null; questionRows?: QuestionRow[]; removedItemIds?: UUID[] }
    >(draftKey);
    if (!restored) return;
    if ('editing' in restored) {
      if (!restored.editing) return;
      setEditing(restored.editing);
      setQuestionRows(restored.questionRows ?? []);
      setRemovedItemIds(restored.removedItemIds ?? []);
    } else {
      // Drafts saved before questions were part of this form.
      setEditing(restored);
    }
  }, [draftKey, props.canManage, restoreDraft]);

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
      defaultAreaManagerUserId: '',
      defaultAuditorHrEmployeeId: '',
      defaultAreaManagerHrEmployeeId: ''
    });
    setQuestionRows([newQuestionRow()]);
    setRemovedItemIds([]);
    setNotice(null);
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
      defaultAreaManagerUserId: t.default_area_manager_user_id ?? '',
      defaultAuditorHrEmployeeId: t.default_auditor_user_id ? (employeeIdByUserId.get(t.default_auditor_user_id) ?? '') : '',
      defaultAreaManagerHrEmployeeId: t.default_area_manager_user_id ? (employeeIdByUserId.get(t.default_area_manager_user_id) ?? '') : ''
    });
    setQuestionRows([]);
    setRemovedItemIds([]);
    setNotice(null);
    setLoadingQuestions(true);
    listInspectionChecklistItems(props.companyId, t.id)
      .then((items) => {
        setQuestionRows(
          items.length > 0
            ? items.map((item) => ({
                key: `existing-${item.id}`,
                id: item.id,
                section: item.audit_section_or_category ?? item.section ?? '',
                idNumber: item.requirement_reference ?? '',
                question: item.question,
                score: String((item as any).allocated_score ?? 1),
                riskLevel: (item.risk_level_default ?? 'medium') as 'low' | 'medium' | 'high'
              }))
            : [newQuestionRow()]
        );
      })
      .catch((err: any) => setError(err.message ?? 'Failed to load this template\'s questions.'))
      .finally(() => setLoadingQuestions(false));
  }

  function updateQuestionRow(key: string, patch: Partial<QuestionRow>) {
    setQuestionRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addQuestionRow(afterKey?: string) {
    setQuestionRows((rows) => {
      const index = afterKey ? rows.findIndex((r) => r.key === afterKey) : rows.length - 1;
      const section = index >= 0 ? rows[index].section : '';
      const next = [...rows];
      next.splice(index + 1, 0, newQuestionRow(section));
      return next;
    });
  }

  function removeQuestionRow(key: string) {
    setQuestionRows((rows) => {
      const target = rows.find((r) => r.key === key);
      if (target?.id) setRemovedItemIds((ids) => [...ids, target.id as UUID]);
      return rows.filter((r) => r.key !== key);
    });
  }

  function moveQuestionRow(index: number, direction: -1 | 1) {
    setQuestionRows((rows) => {
      const target = index + direction;
      if (target < 0 || target >= rows.length) return rows;
      const next = [...rows];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
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
      let templateId: UUID;
      if (editing.id) {
        await updateInspectionChecklistTemplate({
          ...payload,
          templateId: editing.id,
          updatedByUserId: (user?.id ?? props.companyId) as UUID
        });
        templateId = editing.id;
      } else {
        const created = await createInspectionChecklistTemplate({
          ...payload,
          module: editing.module,
          createdByUserId: (user?.id ?? props.companyId) as UUID
        });
        templateId = created.id as UUID;
        // If saving the questions fails below, a retry should update this template, not create another.
        setEditing((prev) => (prev ? { ...prev, id: templateId } : prev));
      }

      for (const itemId of removedItemIds) {
        await deleteInspectionChecklistItem(props.companyId, itemId);
      }
      setRemovedItemIds([]);

      const rows = questionRows
        .filter((r) => r.question.trim())
        .map((r, idx) => {
          const score = Number(r.score);
          return {
            id: r.id,
            item_order: idx + 1,
            section: r.section.trim() || null,
            requirement_reference: r.idNumber.trim() || null,
            question: r.question.trim(),
            allocated_score: Number.isFinite(score) && score >= 0 ? score : 1,
            risk_level_default: r.riskLevel
          };
        });
      const existingRows = rows.filter((r) => r.id);
      const newRows = rows.filter((r) => !r.id).map(({ id: _id, ...rest }) => rest);
      if (existingRows.length > 0) {
        await upsertInspectionChecklistItems({ companyId: props.companyId, templateId, items: existingRows });
      }
      if (newRows.length > 0) {
        await upsertInspectionChecklistItems({ companyId: props.companyId, templateId, items: newRows });
      }

      clearDraft(draftKey);
      setEditing(null);
      setQuestionRows([]);
      setNotice(`Template saved with ${rows.length} question${rows.length === 1 ? '' : 's'}.`);
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

  async function duplicateTemplate(t: InspectionChecklistTemplate) {
    if (!props.canManage) return;
    setDuplicatingId(t.id);
    setError(null);
    setNotice(null);
    try {
      const items = await listInspectionChecklistItems(props.companyId, t.id);
      const created = await createInspectionChecklistTemplate({
        companyId: props.companyId,
        module: t.module,
        name: `${t.name} (copy)`,
        subtitle: t.subtitle ?? undefined,
        description: t.description ?? undefined,
        scope: t.scope,
        siteId: t.site_id ?? null,
        departmentId: t.department_id ?? null,
        defaultArea: t.default_area ?? undefined,
        frequency: (t.frequency ?? 'monthly') as InspectionFrequency,
        defaultAuditorUserId: t.default_auditor_user_id ?? undefined,
        defaultAreaManagerUserId: t.default_area_manager_user_id ?? undefined,
        createdByUserId: (user?.id ?? props.companyId) as UUID
      });
      if (items.length > 0) {
        await upsertInspectionChecklistItems({
          companyId: props.companyId,
          templateId: created.id,
          items: items.map((item, idx) => ({
            item_order: idx + 1,
            section: item.audit_section_or_category ?? item.section ?? null,
            requirement_reference: item.requirement_reference ?? null,
            question: item.question,
            expected_evidence: item.expected_evidence ?? null,
            allocated_score: item.allocated_score ?? 1,
            risk_level_default: item.risk_level_default ?? null
          }))
        });
      }
      setNotice(`"${t.name}" duplicated as "${created.name}" with ${items.length} question${items.length === 1 ? '' : 's'}.`);
      await refresh();
    } catch (err: any) {
      setError(err.message ?? 'Failed to duplicate template.');
    } finally {
      setDuplicatingId(null);
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

      {notice && (
        <div className="bg-success/5 border border-success/20 rounded-xl p-3 text-sm text-success">
          {notice}
        </div>
      )}

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
                      title="View or edit this checklist's questions in detail"
                      className="px-2 py-1 rounded-lg border border-teal/30 text-[11px] text-teal font-medium hover:bg-teal/5"
                    >
                      Items
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(t)}
                      title="Edit this checklist"
                      className="p-1.5 rounded-lg border border-surface-200 text-xs text-charcoal-500 hover:bg-surface-50"
                    >
                      <Edit2Icon className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void duplicateTemplate(t)}
                      disabled={duplicatingId === t.id}
                      title="Duplicate this checklist (e.g. for next year)"
                      className="p-1.5 rounded-lg border border-surface-200 text-xs text-charcoal-500 hover:bg-surface-50 disabled:opacity-50"
                    >
                      {duplicatingId === t.id ? <LoadingSpinner size={12} /> : <CopyIcon className="w-3 h-3" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => void archiveTemplate(t)}
                      title={t.is_active ? 'Archive this checklist' : 'Restore this checklist'}
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
          <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90dvh] overflow-y-auto">
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
                <HrEmployeeSelect
                  companyId={props.companyId}
                  value={editing.defaultAuditorHrEmployeeId as UUID | ''}
                  valueField="id"
                  includeUnlinked
                  label="Default auditor"
                  onChange={(selected, meta) =>
                    setEditing({ ...editing, defaultAuditorHrEmployeeId: selected, defaultAuditorUserId: meta.userId ?? '' })
                  }
                />
                {editing.defaultAuditorHrEmployeeId && !editing.defaultAuditorUserId && (
                  <p className="mt-1 text-xs text-charcoal-500">
                    This employee has no platform login, so they won&apos;t get an automatic notification — they can still be assigned manually per inspection.
                  </p>
                )}
              </div>
              <div>
                <HrEmployeeSelect
                  companyId={props.companyId}
                  value={editing.defaultAreaManagerHrEmployeeId as UUID | ''}
                  valueField="id"
                  includeUnlinked
                  label="Area manager"
                  onChange={(selected, meta) =>
                    setEditing({ ...editing, defaultAreaManagerHrEmployeeId: selected, defaultAreaManagerUserId: meta.userId ?? '' })
                  }
                />
                {editing.defaultAreaManagerHrEmployeeId && !editing.defaultAreaManagerUserId && (
                  <p className="mt-1 text-xs text-charcoal-500">
                    This employee has no platform login, so they won&apos;t get an automatic notification — they can still be assigned manually per inspection.
                  </p>
                )}
              </div>
              <div className="pt-2 border-t border-surface-200">
                <p className="text-sm font-semibold text-charcoal">Checklist Questions</p>
                <p className="text-xs text-charcoal-500 mb-2">
                  Add the questions inspectors will answer for this checklist. Press Enter in a question to add the next one.
                </p>
                {loadingQuestions ? (
                  <div className="flex items-center gap-2 text-xs text-charcoal-500">
                    <LoadingSpinner size={14} />
                    Loading questions…
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="text-left text-charcoal-500 border-b border-surface-200">
                          <th className="py-1.5 pr-2 w-8">#</th>
                          <th className="py-1.5 pr-2 w-28">ID/Number</th>
                          <th className="py-1.5 pr-2 w-32">Section</th>
                          <th className="py-1.5 pr-2">Question *</th>
                          <th className="py-1.5 pr-2 w-14">Points</th>
                          <th className="py-1.5 pr-2 w-24">Risk (L/M/H)</th>
                          <th className="py-1.5 w-20" />
                        </tr>
                      </thead>
                      <tbody>
                        {questionRows.map((row, idx) => (
                          <tr key={row.key} className="border-b border-surface-100">
                            <td className="py-1.5 pr-2 text-charcoal-500">{idx + 1}</td>
                            <td className="py-1.5 pr-2">
                              <input
                                value={row.idNumber}
                                onChange={(e) => updateQuestionRow(row.key, { idNumber: e.target.value })}
                                placeholder="e.g. House 2"
                                className="w-full px-2 py-1 border border-surface-300 rounded text-xs"
                              />
                            </td>
                            <td className="py-1.5 pr-2">
                              <input
                                value={row.section}
                                onChange={(e) => updateQuestionRow(row.key, { section: e.target.value })}
                                placeholder="e.g. Electrical"
                                className="w-full px-2 py-1 border border-surface-300 rounded text-xs"
                              />
                            </td>
                            <td className="py-1.5 pr-2">
                              <input
                                value={row.question}
                                onChange={(e) => updateQuestionRow(row.key, { question: e.target.value })}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    addQuestionRow(row.key);
                                  }
                                }}
                                placeholder="Question text"
                                className="w-full px-2 py-1 border border-surface-300 rounded text-xs"
                              />
                            </td>
                            <td className="py-1.5 pr-2">
                              <input
                                type="number"
                                min={0}
                                step={0.5}
                                value={row.score}
                                onChange={(e) => updateQuestionRow(row.key, { score: e.target.value })}
                                className="w-14 px-2 py-1 border border-surface-300 rounded text-xs"
                              />
                            </td>
                            <td className="py-1.5 pr-2">
                              <select
                                value={row.riskLevel}
                                onChange={(e) => updateQuestionRow(row.key, { riskLevel: e.target.value as QuestionRow['riskLevel'] })}
                                className="w-full px-2 py-1 border border-surface-300 rounded text-xs"
                              >
                                <option value="low">L — Low</option>
                                <option value="medium">M — Medium</option>
                                <option value="high">H — High</option>
                              </select>
                            </td>
                            <td className="py-1.5">
                              <div className="flex items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => moveQuestionRow(idx, -1)}
                                  disabled={idx === 0}
                                  className="p-1 rounded hover:bg-surface-100 disabled:opacity-30"
                                  aria-label="Move question up"
                                >
                                  <ChevronUpIcon className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveQuestionRow(idx, 1)}
                                  disabled={idx === questionRows.length - 1}
                                  className="p-1 rounded hover:bg-surface-100 disabled:opacity-30"
                                  aria-label="Move question down"
                                >
                                  <ChevronDownIcon className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeQuestionRow(row.key)}
                                  className="p-1 rounded text-critical hover:bg-critical/5"
                                  aria-label="Remove question"
                                >
                                  <Trash2Icon className="w-3 h-3" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <button
                      type="button"
                      onClick={() => addQuestionRow()}
                      className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-teal/30 text-xs text-teal font-medium hover:bg-teal/5"
                    >
                      <PlusIcon className="w-3 h-3" />
                      Add question
                    </button>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-charcoal mb-1.5">
                  Comments
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
