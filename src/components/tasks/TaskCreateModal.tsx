import React, { useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { ModuleKey, Severity, UUID } from '../../api/models/core';
import { createTask, listTasksWithFilters, countTasksByAssignee } from '../../api/services/tasksService';
import { UserMultiSelect } from '../ui/UserMultiSelect';
import { useAsync } from '../../api/hooks/useAsync';
import { listUserProfiles } from '../../api/services/profilesService';
import { listCompanyMemberships } from '../../api/services/tenantService';
import type { UserProfile } from '../../api/models/entities';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TASK_SOURCE_ENTITY_LABELS } from '../../api/constants/taskLabels';

const SOURCE_ENTITY_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'None' },
  { value: 'ncr', label: TASK_SOURCE_ENTITY_LABELS.ncr ?? 'NCR' },
  { value: 'incident', label: TASK_SOURCE_ENTITY_LABELS.incident ?? 'Incident' },
  { value: 'audit_finding', label: TASK_SOURCE_ENTITY_LABELS.audit_finding ?? 'Audit finding' },
  { value: 'inspection_run_item', label: TASK_SOURCE_ENTITY_LABELS.inspection_run_item ?? 'Inspection item' },
  { value: 'ppe_issue_tracker', label: TASK_SOURCE_ENTITY_LABELS.ppe_issue_tracker ?? 'PPE issue' },
  { value: 'program_audit_finding', label: 'Program audit finding' }
];

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
  const [assigneeUserId, setAssigneeUserId] = useState<UUID | ''>('');
  const [taskOwnerUserId, setTaskOwnerUserId] = useState<UUID | ''>('');
  const [supportingTeamUserIds, setSupportingTeamUserIds] = useState<UUID[]>([]);
  const [sourceEntityType, setSourceEntityType] = useState('');
  const [sourceEntityId, setSourceEntityId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: companyUsers } = useAsync<{ userId: UUID; name: string }[]>(
    async () => {
      if (!props.companyId) return [];
      const [profiles, memberships] = await Promise.all([
        listUserProfiles(props.companyId),
        listCompanyMemberships(props.companyId)
      ]);
      const profileMap = new Map<string, UserProfile>();
      (profiles ?? []).forEach((p) => profileMap.set(p.user_id, p));
      return (memberships ?? []).map((m) => ({
        userId: m.user_id,
        name: profileMap.get(m.user_id)?.full_name ?? `User ${m.user_id.slice(0, 8)}`
      })).sort((a, b) => a.name.localeCompare(b.name));
    },
    [props.companyId]
  );

  const { data: assigneeTasks } = useAsync(
    async () => {
      if (!props.companyId || !assigneeUserId) return [];
      return listTasksWithFilters({
        companyId: props.companyId,
        assigneeUserId: assigneeUserId as UUID,
        limit: 200
      });
    },
    [props.companyId, assigneeUserId]
  );

  const { data: assigneeOpenCount } = useAsync(
    async () => {
      if (!props.companyId || !assigneeUserId) return 0;
      return countTasksByAssignee(props.companyId, assigneeUserId as UUID, true);
    },
    [props.companyId, assigneeUserId]
  );

  const workloadChartData = useMemo(() => {
    const tasks = assigneeTasks ?? [];
    const estimated = tasks.reduce((s, t) => s + (t.estimated_hours ?? 0), 0);
    const spent = tasks.reduce((s, t) => s + (t.time_spent_minutes ?? 0) / 60, 0);
    return [
      { name: 'Estimated (h)', value: Math.round(estimated * 10) / 10, fill: 'var(--color-teal)' },
      { name: 'Spent (h)', value: Math.round(spent * 10) / 10, fill: 'var(--color-charcoal-400)' }
    ].filter((d) => d.value > 0);
  }, [assigneeTasks]);

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
        assigneeUserId: assigneeUserId || undefined,
        taskOwnerUserId: taskOwnerUserId || undefined,
        allocatedByUserId: props.createdByUserId,
        supportingTeamUserIds: supportingTeamUserIds.length ? supportingTeamUserIds : undefined,
        sourceEntityType: sourceEntityType || undefined,
        sourceEntityId: sourceEntityId.trim() ? (sourceEntityId.trim() as UUID) : undefined,
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
      setAssigneeUserId('');
      setTaskOwnerUserId('');
      setSupportingTeamUserIds([]);
      setSourceEntityType('');
      setSourceEntityId('');
      setModule(props.defaultModule ?? 'safety');
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <div>
            <p className="text-sm font-semibold text-charcoal">Create task</p>
            <p className="text-xs text-charcoal-500 mt-0.5">Allocation wizard — assign and plan.</p>
          </div>
          <button type="button" onClick={props.onClose} className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-500">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 flex flex-col lg:flex-row gap-6">
          <div className="flex-1 min-w-0 space-y-4">
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

          <div className="border-t border-surface-200 pt-4">
            <p className="text-sm font-medium text-charcoal mb-2">Assignment</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-charcoal-500 mb-1">Assignee</label>
                <select
                  value={assigneeUserId}
                  onChange={(e) => setAssigneeUserId((e.target.value || '') as UUID | '')}
                  className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm"
                >
                  <option value="">Unassigned</option>
                  {(companyUsers ?? []).map((u) => (
                    <option key={u.userId} value={u.userId}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-charcoal-500 mb-1">Task owner</label>
                <select
                  value={taskOwnerUserId}
                  onChange={(e) => setTaskOwnerUserId((e.target.value || '') as UUID | '')}
                  className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm"
                >
                  <option value="">Not set</option>
                  {(companyUsers ?? []).map((u) => (
                    <option key={u.userId} value={u.userId}>{u.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-xs font-medium text-charcoal-500 mb-1">Supporting team</label>
              <UserMultiSelect
                companyId={props.companyId}
                selectedUserIds={supportingTeamUserIds}
                onChange={(ids) => setSupportingTeamUserIds(ids)}
                placeholder="Select supporting team..."
                allowExternalEmails={false}
              />
            </div>
          </div>

          <div className="border-t border-surface-200 pt-4">
            <p className="text-sm font-medium text-charcoal mb-2">Link to source (optional)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-charcoal-500 mb-1">Source type</label>
                <select
                  value={sourceEntityType}
                  onChange={(e) => setSourceEntityType(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm"
                >
                  {SOURCE_ENTITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-charcoal-500 mb-1">Source ID (UUID)</label>
                <input
                  type="text"
                  value={sourceEntityId}
                  onChange={(e) => setSourceEntityId(e.target.value)}
                  placeholder="e.g. record ID"
                  className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm"
                />
              </div>
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
              Create task
            </button>
          </div>
          </div>

          {assigneeUserId && (
            <div className="w-full lg:w-72 shrink-0 bg-surface-50 rounded-xl border border-surface-200 p-4 h-fit">
              <p className="text-sm font-semibold text-charcoal mb-2">Workload — assignee</p>
              <p className="text-xs text-charcoal-500 mb-2">
                Open tasks: <strong>{assigneeOpenCount ?? 0}</strong>
              </p>
              {workloadChartData.length > 0 ? (
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={workloadChartData} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="value" radius={4}>
                        {workloadChartData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-xs text-charcoal-500">No time data for this assignee yet.</p>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
