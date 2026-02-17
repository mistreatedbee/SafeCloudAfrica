import React, { useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { ModuleKey, Severity, UUID } from '../../api/models/core';
import { createTask } from '../../api/services/tasksService';

export function TaskCreateModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  createdByUserId: UUID;
  defaultModule?: ModuleKey;
  onCreated?: () => void;
}) {
  const [module, setModule] = useState<ModuleKey>(props.defaultModule ?? 'safety');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Severity>('medium');
  const [category, setCategory] = useState<
    | 'audit_action'
    | 'capa'
    | 'inspection'
    | 'ppe_issue'
    | 'safety_action'
    | 'env_action'
    | 'quality_action'
    | 'project_task'
    | 'maintenance'
    | 'training'
    | 'kpi_follow_up'
    | ''
  >('');
  const [riskLevel, setRiskLevel] = useState<'low' | 'medium' | 'high' | 'critical' | ''>('');
  const [plannedStartDate, setPlannedStartDate] = useState('');
  const [plannedCompletionDate, setPlannedCompletionDate] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => title.trim().length > 2, [title]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      setLoading(true);
      await createTask({
        companyId: props.companyId,
        module,
        title: title.trim(),
        description: description.trim() || undefined,
        category: (category || undefined) as any,
        riskLevel: (riskLevel || undefined) as any,
        priority,
        plannedStartDate: plannedStartDate || undefined,
        plannedCompletionDate: plannedCompletionDate || undefined,
        estimatedHours: estimatedHours ? Number(estimatedHours) || undefined : undefined,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        createdByUserId: props.createdByUserId
      });
      props.onCreated?.();
      props.onClose();
      setTitle('');
      setDescription('');
      setPriority('medium');
      setCategory('');
      setRiskLevel('');
      setPlannedStartDate('');
      setPlannedCompletionDate('');
      setEstimatedHours('');
      setDueAt('');
      setModule(props.defaultModule ?? 'safety');
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-xl mx-4 bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <div>
            <p className="text-sm font-semibold text-charcoal">Create task</p>
            <p className="text-xs text-charcoal-500 mt-0.5">Tasks are company-wide and appear immediately.</p>
          </div>
          <button type="button" onClick={props.onClose} className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-500">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
              <p className="text-sm font-semibold text-critical">Could not create task</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}

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
              <label className="block text-sm font-medium text-charcoal mb-1.5">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Severity)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Category (optional)</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                <option value="">Not specified</option>
                <option value="audit_action">Audit action</option>
                <option value="capa">Corrective / preventive action</option>
                <option value="inspection">Inspection</option>
                <option value="ppe_issue">PPE issue</option>
                <option value="safety_action">Safety action</option>
                <option value="env_action">Environmental action</option>
                <option value="quality_action">Quality action</option>
                <option value="project_task">Project task</option>
                <option value="maintenance">Maintenance</option>
                <option value="training">Training</option>
                <option value="kpi_follow_up">KPI follow-up</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Risk level (optional)</label>
              <select
                value={riskLevel}
                onChange={(e) => setRiskLevel(e.target.value as any)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                <option value="">Not specified</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Planned start (optional)</label>
              <input
                type="date"
                value={plannedStartDate}
                onChange={(e) => setPlannedStartDate(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Planned completion (optional)</label>
              <input
                type="date"
                value={plannedCompletionDate}
                onChange={(e) => setPlannedCompletionDate(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Estimated hours (optional)</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Monthly safety inspection"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="What needs to be done and by when…"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Due date (optional)</label>
            <input
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
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
              Create task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

