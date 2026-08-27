import { useEffect, useState } from 'react';
import { PlusIcon, Trash2Icon, XIcon, ChevronUpIcon, ChevronDownIcon } from 'lucide-react';
import type { InspectionChecklistItem, InspectionChecklistTemplate, UUID } from '../../api/models/entities';
import {
  deleteInspectionChecklistItem,
  listInspectionChecklistItems,
  upsertInspectionChecklistItems
} from '../../api/services/inspectionsService';
import { LoadingSpinner } from '../ui/LoadingSpinner';

type ItemDraft = {
  id?: UUID;
  item_order: number;
  section: string;
  requirement_reference: string;
  question: string;
  expected_evidence: string;
  risk_level_default: 'low' | 'medium' | 'high';
  inspection_method_default: 'physical-inspection' | 'observation' | 'record-review';
  evidence_required_default: boolean;
  is_mandatory: boolean;
};

function toDraft(item: InspectionChecklistItem, order: number): ItemDraft {
  return {
    id: item.id,
    item_order: item.item_order ?? order,
    section: item.audit_section_or_category ?? item.section ?? '',
    requirement_reference: item.requirement_reference ?? '',
    question: item.question,
    expected_evidence: item.expected_evidence ?? '',
    risk_level_default: item.risk_level_default ?? 'medium',
    inspection_method_default: item.inspection_method_default ?? 'observation',
    evidence_required_default: item.evidence_required_default ?? false,
    is_mandatory: item.is_mandatory ?? false
  };
}

function emptyDraft(order: number): ItemDraft {
  return {
    item_order: order,
    section: '',
    requirement_reference: '',
    question: '',
    expected_evidence: '',
    risk_level_default: 'medium',
    inspection_method_default: 'observation',
    evidence_required_default: false,
    is_mandatory: false
  };
}

type Props = {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  template: InspectionChecklistTemplate;
};

export function InspectionChecklistItemBuilder({ open, onClose, companyId, template }: Props) {
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const rows = await listInspectionChecklistItems(companyId, template.id);
        if (!cancelled) {
          setItems(rows.length > 0 ? rows.map((row, idx) => toDraft(row, idx + 1)) : [emptyDraft(1)]);
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message ?? 'Failed to load checklist items.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, companyId, template.id]);

  function updateItem(index: number, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addItem() {
    setItems((prev) => [...prev, emptyDraft(prev.length + 1)]);
  }

  async function removeItem(index: number) {
    const target = items[index];
    if (target?.id) {
      await deleteInspectionChecklistItem(companyId, target.id);
    }
    setItems((prev) => prev.filter((_, i) => i !== index).map((row, i) => ({ ...row, item_order: i + 1 })));
  }

  function moveItem(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    setItems((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((row, i) => ({ ...row, item_order: i + 1 }));
    });
  }

  async function save() {
    const valid = items.filter((row) => row.question.trim());
    if (valid.length === 0) {
      setError('Add at least one question before saving.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await upsertInspectionChecklistItems({
        companyId,
        templateId: template.id,
        items: valid.map((row, idx) => ({
          id: row.id,
          item_order: idx + 1,
          audit_section_or_category: row.section.trim() || null,
          requirement_reference: row.requirement_reference.trim() || null,
          question: row.question.trim(),
          expected_evidence: row.expected_evidence.trim() || null,
          risk_level_default: row.risk_level_default,
          inspection_method_default: row.inspection_method_default,
          evidence_required_default: row.evidence_required_default,
          is_mandatory: row.is_mandatory
        }))
      });
      onClose();
    } catch (err: any) {
      setError(err.message ?? 'Failed to save checklist items.');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[92dvh] overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <div>
            <p className="text-sm font-semibold text-charcoal">Checklist builder</p>
            <p className="text-xs text-charcoal-500">{template.name}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-surface-100" aria-label="Close">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-lg p-3 text-sm text-critical">{error}</div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-charcoal-500">
              <LoadingSpinner size={16} />
              Loading items…
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={item.id ?? `new-${index}`} className="border border-surface-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-charcoal-500">Item {index + 1}</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => moveItem(index, -1)}
                        disabled={index === 0}
                        className="p-1 rounded hover:bg-surface-100 disabled:opacity-40"
                        aria-label="Move up"
                      >
                        <ChevronUpIcon className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveItem(index, 1)}
                        disabled={index === items.length - 1}
                        className="p-1 rounded hover:bg-surface-100 disabled:opacity-40"
                        aria-label="Move down"
                      >
                        <ChevronDownIcon className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeItem(index)}
                        className="inline-flex items-center gap-1 text-xs text-critical hover:underline"
                      >
                        <Trash2Icon className="w-3 h-3" />
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-charcoal-500 mb-1">Section / category</label>
                      <input
                        value={item.section}
                        onChange={(e) => updateItem(index, { section: e.target.value })}
                        className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
                        placeholder="e.g. Housekeeping"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-charcoal-500 mb-1">Requirement reference</label>
                      <input
                        value={item.requirement_reference}
                        onChange={(e) => updateItem(index, { requirement_reference: e.target.value })}
                        className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
                        placeholder="e.g. ISO 45001 8.1.2"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-charcoal-500 mb-1">Question *</label>
                    <textarea
                      value={item.question}
                      onChange={(e) => updateItem(index, { question: e.target.value })}
                      rows={2}
                      className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
                      placeholder="What should the inspector verify?"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-charcoal-500 mb-1">Expected evidence</label>
                    <input
                      value={item.expected_evidence}
                      onChange={(e) => updateItem(index, { expected_evidence: e.target.value })}
                      className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs text-charcoal-500 mb-1">Default risk</label>
                      <select
                        value={item.risk_level_default}
                        onChange={(e) => updateItem(index, { risk_level_default: e.target.value as ItemDraft['risk_level_default'] })}
                        className="w-full px-2 py-2 border border-surface-300 rounded-lg text-sm"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-charcoal-500 mb-1">Method</label>
                      <select
                        value={item.inspection_method_default}
                        onChange={(e) =>
                          updateItem(index, {
                            inspection_method_default: e.target.value as ItemDraft['inspection_method_default']
                          })
                        }
                        className="w-full px-2 py-2 border border-surface-300 rounded-lg text-sm"
                      >
                        <option value="observation">Observation</option>
                        <option value="physical-inspection">Physical</option>
                        <option value="record-review">Record review</option>
                      </select>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-charcoal-600 mt-6">
                      <input
                        type="checkbox"
                        checked={item.evidence_required_default}
                        onChange={(e) => updateItem(index, { evidence_required_default: e.target.checked })}
                      />
                      Evidence required
                    </label>
                    <label className="flex items-center gap-2 text-xs text-charcoal-600 mt-6">
                      <input
                        type="checkbox"
                        checked={item.is_mandatory}
                        onChange={(e) => updateItem(index, { is_mandatory: e.target.checked })}
                      />
                      Mandatory
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={addItem}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-surface-300 text-sm text-charcoal hover:bg-surface-50"
          >
            <PlusIcon className="w-4 h-4" />
            Add question
          </button>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-surface-200 px-5 py-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-surface-300 text-sm">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold disabled:opacity-60"
          >
            {saving && <LoadingSpinner size={14} />}
            Save checklist
          </button>
        </div>
      </div>
    </div>
  );
}
