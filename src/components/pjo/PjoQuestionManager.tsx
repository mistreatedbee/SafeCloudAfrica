import React, { useState } from 'react';
import { PlusIcon, Trash2Icon, ChevronUpIcon, ChevronDownIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { toUserFacingError } from '../../utils/userFacingMessage';
import type { UUID } from '../../api/models/core';
import type { PjoChecklistItem } from '../../api/models/entities';
import { useAsync } from '../../api/hooks/useAsync';
import {
  getOrCreateDefaultPjoTemplate,
  listPjoChecklistItems,
  createPjoChecklistItem,
  updatePjoChecklistItem,
  deleteOrDeactivatePjoChecklistItem,
  reorderPjoChecklistItems
} from '../../api/services/pjoService';

export function PjoQuestionManager(props: { companyId: UUID; actorUserId: UUID; canManage: boolean }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [newQuestion, setNewQuestion] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<UUID | null>(null);
  const [editingText, setEditingText] = useState('');
  const [busyId, setBusyId] = useState<UUID | null>(null);

  const { data: template } = useAsync(
    async () => getOrCreateDefaultPjoTemplate({ companyId: props.companyId, actorUserId: props.actorUserId }),
    [props.companyId, refreshKey]
  );

  const { data: items, loading } = useAsync<PjoChecklistItem[]>(
    async () => {
      if (!template) return [];
      return await listPjoChecklistItems(props.companyId, template.id);
    },
    [props.companyId, template?.id, refreshKey]
  );

  function refresh() {
    setRefreshKey((k) => k + 1);
  }

  async function handleAdd() {
    if (!template || !newQuestion.trim()) return;
    setAdding(true);
    setError(null);
    try {
      await createPjoChecklistItem({
        companyId: props.companyId,
        templateId: template.id,
        questionText: newQuestion.trim()
      });
      setNewQuestion('');
      refresh();
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to add question.'));
    } finally {
      setAdding(false);
    }
  }

  async function handleToggleActive(item: PjoChecklistItem) {
    setBusyId(item.id);
    setError(null);
    try {
      await updatePjoChecklistItem({
        companyId: props.companyId,
        itemId: item.id,
        patch: { is_active: !item.is_active }
      });
      refresh();
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to update question.'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleSaveEdit(item: PjoChecklistItem) {
    if (!editingText.trim()) return;
    setBusyId(item.id);
    setError(null);
    try {
      await updatePjoChecklistItem({
        companyId: props.companyId,
        itemId: item.id,
        patch: { question_text: editingText.trim() }
      });
      setEditingId(null);
      refresh();
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to update question.'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(item: PjoChecklistItem) {
    if (!window.confirm(`Remove "${item.question_text}"? If it has existing answers it will be deactivated instead of deleted.`)) return;
    setBusyId(item.id);
    setError(null);
    try {
      const result = await deleteOrDeactivatePjoChecklistItem({ companyId: props.companyId, itemId: item.id });
      if (!result.deleted) {
        setError('This question has existing answers, so it was deactivated instead of deleted.');
      }
      refresh();
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to remove question.'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleMove(index: number, direction: -1 | 1) {
    if (!items) return;
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const reordered = [...items];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setError(null);
    try {
      await reorderPjoChecklistItems(props.companyId, reordered.map((i) => i.id));
      refresh();
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to reorder questions.'));
    }
  }

  return (
    <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
      <div className="px-5 py-4 border-b border-surface-200">
        <h3 className="font-semibold text-charcoal">PJO Questions</h3>
        <p className="text-xs text-charcoal-500 mt-0.5">
          Customize the checklist used for every new PJO at this company. Reordering, deactivating, or editing
          a question here does not change answers already captured on existing PJOs.
        </p>
      </div>

      {error && (
        <div className="mx-5 mt-4 bg-critical/5 border border-critical/20 rounded-xl p-3">
          <p className="text-sm text-charcoal-600">{error}</p>
        </div>
      )}

      {props.canManage && (
        <div className="px-5 py-4 border-b border-surface-100 flex gap-2">
          <input
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            placeholder="New question text"
            className="flex-1 px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
          />
          <button
            type="button"
            disabled={adding || !newQuestion.trim()}
            onClick={() => void handleAdd()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60"
          >
            {adding ? <LoadingSpinner size={14} /> : <PlusIcon className="w-4 h-4" />}
            Add question
          </button>
        </div>
      )}

      <div className="divide-y divide-surface-100">
        {loading && <div className="px-5 py-4 text-sm text-charcoal-500">Loading questions…</div>}
        {!loading && (items ?? []).length === 0 && (
          <div className="px-5 py-4 text-sm text-charcoal-500">No questions yet.</div>
        )}
        {(items ?? []).map((item, idx) => (
          <div key={item.id} className={`px-5 py-3 flex items-center gap-3 ${!item.is_active ? 'opacity-50' : ''}`}>
            {props.canManage && (
              <div className="flex flex-col shrink-0">
                <button
                  type="button"
                  onClick={() => void handleMove(idx, -1)}
                  disabled={idx === 0}
                  className="p-0.5 rounded hover:bg-surface-100 disabled:opacity-30"
                  aria-label="Move up"
                >
                  <ChevronUpIcon className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleMove(idx, 1)}
                  disabled={idx === (items?.length ?? 0) - 1}
                  className="p-0.5 rounded hover:bg-surface-100 disabled:opacity-30"
                  aria-label="Move down"
                >
                  <ChevronDownIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <span className="text-xs text-charcoal-400 w-6 shrink-0">{item.question_no}</span>
            <div className="flex-1 min-w-0">
              {editingId === item.id ? (
                <input
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  className="w-full px-3 py-1.5 border border-surface-300 rounded-lg text-sm"
                  autoFocus
                />
              ) : (
                <p className="text-sm text-charcoal truncate">{item.question_text}</p>
              )}
            </div>
            {props.canManage && (
              <div className="flex items-center gap-3 shrink-0">
                {editingId === item.id ? (
                  <>
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void handleSaveEdit(item)}
                      className="text-xs text-teal font-semibold hover:underline"
                    >
                      Save
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="text-xs text-charcoal-500 hover:underline">
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(item.id);
                      setEditingText(item.question_text);
                    }}
                    className="text-xs text-charcoal-600 hover:underline"
                  >
                    Edit
                  </button>
                )}
                <label className="inline-flex items-center gap-1.5 text-xs text-charcoal-500">
                  <input
                    type="checkbox"
                    checked={item.is_active}
                    disabled={busyId === item.id}
                    onChange={() => void handleToggleActive(item)}
                    className="h-3.5 w-3.5"
                  />
                  Active
                </label>
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => void handleDelete(item)}
                  className="p-1.5 rounded-lg border border-critical/30 text-critical hover:bg-critical/5 disabled:opacity-50"
                  title="Delete (or deactivate if answered)"
                >
                  <Trash2Icon className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
