import React, { useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import { useUser } from '@insforge/react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { HrEmployeeSelect } from '../ui/HrEmployeeSelect';
import { formatAuthError } from '../../auth/authMessages';
import type {
  ModuleTargetCategory,
  ModuleTargetReviewActionStatus,
  ModuleTargetStatus,
  UUID
} from '../../api/models/entities';
import type { ModuleKey } from '../../api/models/core';
import { createModuleTarget } from '../../api/services/moduleTargetsService';

const STATUS_OPTIONS: Array<{ value: ModuleTargetStatus; label: string }> = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'not_achieved', label: 'Not Achieved' }
];

const ACTION_STATUS_OPTIONS: Array<{ value: ModuleTargetReviewActionStatus; label: string }> = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' }
];

const CATEGORY_OPTIONS: ModuleTargetCategory[] = ['Safety', 'Health', 'Environment', 'Quality'];

export function ObjectiveCreateModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  module: ModuleKey;
  onCreated?: () => void;
}) {
  const { user } = useUser();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetText, setTargetText] = useState('');
  const [category, setCategory] = useState<ModuleTargetCategory | ''>(props.module === 'safety' ? 'Safety' : '');
  const [startDate, setStartDate] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [status, setStatus] = useState<ModuleTargetStatus>('not_started');
  const [responsibleEmployeeId, setResponsibleEmployeeId] = useState<UUID | ''>('');
  const [responsibleUserId, setResponsibleUserId] = useState<UUID | null>(null);
  const [responsibleName, setResponsibleName] = useState('');
  const [reviewReason, setReviewReason] = useState('');
  const [reviewCorrectiveAction, setReviewCorrectiveAction] = useState('');
  const [reviewResponsibleEmployeeId, setReviewResponsibleEmployeeId] = useState<UUID | ''>('');
  const [reviewResponsibleUserId, setReviewResponsibleUserId] = useState<UUID | null>(null);
  const [reviewResponsibleName, setReviewResponsibleName] = useState('');
  const [reviewResourcesRequired, setReviewResourcesRequired] = useState('');
  const [reviewStartDate, setReviewStartDate] = useState('');
  const [reviewActionStatus, setReviewActionStatus] = useState<ModuleTargetReviewActionStatus>('not_started');
  const [reviewCloseDate, setReviewCloseDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => title.trim().length > 2 && targetText.trim().length > 2 && Boolean(responsibleEmployeeId) && Boolean(user?.id),
    [responsibleEmployeeId, targetText, title, user?.id]
  );

  function resetForm() {
    setTitle('');
    setDescription('');
    setTargetText('');
    setCategory(props.module === 'safety' ? 'Safety' : '');
    setStartDate('');
    setTargetDate('');
    setStatus('not_started');
    setResponsibleEmployeeId('');
    setResponsibleUserId(null);
    setResponsibleName('');
    setReviewReason('');
    setReviewCorrectiveAction('');
    setReviewResponsibleEmployeeId('');
    setReviewResponsibleUserId(null);
    setReviewResponsibleName('');
    setReviewResourcesRequired('');
    setReviewStartDate('');
    setReviewActionStatus('not_started');
    setReviewCloseDate('');
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !user?.id) return;
    setError(null);
    try {
      setLoading(true);
      await createModuleTarget({
        companyId: props.companyId,
        module: props.module,
        name: title.trim(),
        description: description.trim() || null,
        targetText: targetText.trim(),
        category: category || null,
        startDate: startDate || null,
        targetDate: targetDate || null,
        status,
        responsibleEmployeeId: responsibleEmployeeId || null,
        responsibleUserId,
        responsibleName: responsibleName || null,
        reviewReason: status === 'not_achieved' ? reviewReason.trim() || null : null,
        reviewCorrectiveAction: status === 'not_achieved' ? reviewCorrectiveAction.trim() || null : null,
        reviewResponsibleEmployeeId: status === 'not_achieved' ? reviewResponsibleEmployeeId || null : null,
        reviewResponsibleUserId: status === 'not_achieved' ? reviewResponsibleUserId : null,
        reviewResponsibleName: status === 'not_achieved' ? reviewResponsibleName || null : null,
        reviewResourcesRequired: status === 'not_achieved' ? reviewResourcesRequired.trim() || null : null,
        reviewStartDate: status === 'not_achieved' ? reviewStartDate || null : null,
        reviewActionStatus: status === 'not_achieved' ? reviewActionStatus : null,
        reviewCloseDate: status === 'not_achieved' ? reviewCloseDate || null : null,
        createdByUserId: user.id
      });
      props.onCreated?.();
      props.onClose();
      resetForm();
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-3xl bg-white rounded-xl shadow-xl border border-surface-200 max-h-[90dvh] overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <p className="text-sm font-semibold text-charcoal">Create Objective</p>
          <button
            type="button"
            onClick={props.onClose}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-surface-100 text-charcoal-500 shrink-0"
            aria-label="Close"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-5">
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-lg p-3">
              <p className="text-sm font-semibold text-critical">Could not create objective</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="md:col-span-2">
              <span className="block text-sm font-medium text-charcoal mb-1.5">Objective Title *</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </label>

            <label className="md:col-span-2">
              <span className="block text-sm font-medium text-charcoal mb-1.5">Description</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="What needs to be achieved"
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </label>

            <label className="md:col-span-2">
              <span className="block text-sm font-medium text-charcoal mb-1.5">Target *</span>
              <input
                value={targetText}
                onChange={(e) => setTargetText(e.target.value)}
                placeholder="Expected outcome"
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </label>

            <div>
              <HrEmployeeSelect
                companyId={props.companyId}
                value={responsibleEmployeeId}
                valueField="id"
                includeUnlinked
                label="Responsible Person *"
                placeholder="Select responsible person"
                onChange={(value, meta) => {
                  setResponsibleEmployeeId(value);
                  setResponsibleUserId(meta.userId ?? null);
                  setResponsibleName(meta.nameSnapshot);
                }}
              />
            </div>

            <label>
              <span className="block text-sm font-medium text-charcoal mb-1.5">Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ModuleTargetCategory | '')}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              >
                <option value="">Select category</option>
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="block text-sm font-medium text-charcoal mb-1.5">Start Date</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </label>

            <label>
              <span className="block text-sm font-medium text-charcoal mb-1.5">Target Date</span>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </label>

            <label>
              <span className="block text-sm font-medium text-charcoal mb-1.5">Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ModuleTargetStatus)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {status === 'not_achieved' && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 space-y-4">
              <p className="text-sm font-semibold text-charcoal">Review for Not Achieved Objective</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="md:col-span-2">
                  <span className="block text-sm font-medium text-charcoal mb-1.5">Reason for not achieving objective</span>
                  <textarea
                    value={reviewReason}
                    onChange={(e) => setReviewReason(e.target.value)}
                    rows={2}
                    className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                  />
                </label>
                <label className="md:col-span-2">
                  <span className="block text-sm font-medium text-charcoal mb-1.5">Corrective Action Required</span>
                  <textarea
                    value={reviewCorrectiveAction}
                    onChange={(e) => setReviewCorrectiveAction(e.target.value)}
                    rows={2}
                    className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                  />
                </label>
                <HrEmployeeSelect
                  companyId={props.companyId}
                  value={reviewResponsibleEmployeeId}
                  valueField="id"
                  includeUnlinked
                  label="Responsible Person"
                  placeholder="Select corrective action owner"
                  onChange={(value, meta) => {
                    setReviewResponsibleEmployeeId(value);
                    setReviewResponsibleUserId(meta.userId ?? null);
                    setReviewResponsibleName(meta.nameSnapshot);
                  }}
                />
                <label>
                  <span className="block text-sm font-medium text-charcoal mb-1.5">Resources Required</span>
                  <input
                    value={reviewResourcesRequired}
                    onChange={(e) => setReviewResourcesRequired(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                  />
                </label>
                <label>
                  <span className="block text-sm font-medium text-charcoal mb-1.5">Start Date</span>
                  <input
                    type="date"
                    value={reviewStartDate}
                    onChange={(e) => setReviewStartDate(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                  />
                </label>
                <label>
                  <span className="block text-sm font-medium text-charcoal mb-1.5">Status</span>
                  <select
                    value={reviewActionStatus}
                    onChange={(e) => setReviewActionStatus(e.target.value as ModuleTargetReviewActionStatus)}
                    className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                  >
                    {ACTION_STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="block text-sm font-medium text-charcoal mb-1.5">Close Date</span>
                  <input
                    type="date"
                    value={reviewCloseDate}
                    onChange={(e) => setReviewCloseDate(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                  />
                </label>
              </div>
            </div>
          )}

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
              Create Objective
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
