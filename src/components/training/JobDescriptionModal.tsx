import React, { useState } from 'react';
import { XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { JobDescription, UUID } from '../../api/models/entities';
import { createJobDescription, updateJobDescription } from '../../api/services/trainingService';
import { listDepartments } from '../../api/services/departmentsService';
import { useAsync } from '../../api/hooks/useAsync';

export function JobDescriptionModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  initial?: JobDescription | null;
  onSaved?: () => void;
}) {
  const [title, setTitle] = useState(props.initial?.title ?? '');
  const [departmentId, setDepartmentId] = useState<string>(props.initial?.department_id ? String(props.initial.department_id) : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: departments } = useAsync(() => listDepartments(props.companyId), [props.companyId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setError(null);
    try {
      setLoading(true);
      if (props.initial) {
        await updateJobDescription({
          companyId: props.companyId,
          jobDescriptionId: props.initial.id,
          title: title.trim(),
          departmentId: departmentId ? (departmentId as UUID) : null
        });
      } else {
        await createJobDescription({
          companyId: props.companyId,
          title: title.trim(),
          departmentId: departmentId ? (departmentId as UUID) : null
        });
      }
      props.onSaved?.();
      props.onClose();
    } catch (err: unknown) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90dvh] overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <p className="text-sm font-semibold text-charcoal">
            {props.initial ? 'Edit job description' : 'Add job description'}
          </p>
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
              <p className="text-sm text-critical">{error}</p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Safety Officer, Operator"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Department (optional)</label>
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            >
              <option value="">None</option>
              {(departments ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={props.onClose} className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60"
            >
              {loading && <LoadingSpinner size={16} />}
              {props.initial ? 'Save' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
