import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  CalendarIcon,
  UserIcon,
  FlagIcon,
  AlertTriangleIcon,
  MessageSquareIcon,
  ClockIcon,
  FileCheckIcon,
  LinkIcon,
  PlayIcon,
  SquareIcon,
  PlusIcon
} from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useTenant } from '../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../api/hooks/useAsync';
import {
  getTaskById,
  acceptTask,
  startTask,
  markAwaitingEvidence,
  submitForReview,
  approveTask,
  closeTask,
  addTaskComment,
  addTaskProgressUpdate,
  listTaskTimeLogs,
  listTaskEvidence,
  startTimeEntry,
  stopTimeEntry,
  logTaskTimeIncrement,
  requestTaskSupervisorApproval,
  requestTaskManagerApproval,
  requestTaskAuditorVerification,
  setTaskEffectivenessCheck
} from '../api/services/tasksService';
import { listActivityLogsByEntity } from '../api/services/activityLogService';
import { listApprovals, decideApproval } from '../api/services/approvalsService';
import { EvidenceModal } from '../components/evidence/EvidenceModal';
import { TASK_CATEGORY_LABELS, TASK_TIME_STATUS_LABELS, TASK_SOURCE_ENTITY_LABELS } from '../api/constants/taskLabels';
import type { Task, Approval, ActivityLog, EvidenceAttachment, TaskTimeLog, UUID } from '../api/models/entities';

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

function formatDateZA(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${formatDateZA(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const priorityColors: Record<string, string> = {
  critical: 'text-critical',
  high: 'text-warning',
  medium: 'text-teal',
  low: 'text-charcoal-400'
};

const TASK_APPROVAL_TYPES = ['task_supervisor_review', 'task_manager_approval', 'task_auditor_verification'] as const;
const APPROVAL_LABELS: Record<string, string> = {
  task_supervisor_review: 'Supervisor review',
  task_manager_approval: 'Manager approval',
  task_auditor_verification: 'Auditor verification'
};

export function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const canManageTasks = activeRole === 'admin' || activeRole === 'manager' || activeRole === 'supervisor' || activeRole === 'consultant' || activeRole === 'auditor';
  const [refreshKey, setRefreshKey] = useState(0);
  const [evidenceModalOpen, setEvidenceModalOpen] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [progressNote, setProgressNote] = useState('');
  const [progressPercent, setProgressPercent] = useState<number | ''>('');
  const [manualMinutes, setManualMinutes] = useState('');
  const [effectivenessChecked, setEffectivenessChecked] = useState(false);
  const [effectivenessNotes, setEffectivenessNotes] = useState('');

  const { data: task, loading: taskLoading } = useAsync<Task | null>(
    async () => (activeCompanyId && taskId ? getTaskById(activeCompanyId, taskId as UUID) : null),
    [activeCompanyId, taskId, refreshKey]
  );

  const { data: activityLogs } = useAsync<ActivityLog[]>(
    async () =>
      activeCompanyId && taskId
        ? listActivityLogsByEntity({ companyId: activeCompanyId, entityType: 'task', entityId: taskId as UUID, limit: 100 })
        : [],
    [activeCompanyId, taskId, refreshKey]
  );

  const { data: evidenceList } = useAsync<EvidenceAttachment[]>(
    async () => (activeCompanyId && taskId ? listTaskEvidence(activeCompanyId, taskId as UUID) : []),
    [activeCompanyId, taskId, refreshKey]
  );

  const { data: timeLogs } = useAsync<TaskTimeLog[]>(
    async () => (activeCompanyId && taskId ? listTaskTimeLogs(activeCompanyId, taskId as UUID) : []),
    [activeCompanyId, taskId, refreshKey]
  );

  const { data: allApprovals } = useAsync<Approval[]>(
    async () => (activeCompanyId ? listApprovals(activeCompanyId) : []),
    [activeCompanyId, refreshKey]
  );

  const taskApprovals = (allApprovals ?? []).filter(
    (a) => a.entity_id === taskId && TASK_APPROVAL_TYPES.includes(a.entity_type as any)
  );

  const activeTimeEntry = (timeLogs ?? []).find((l) => l.started_at && !l.ended_at);

  async function refresh() {
    setRefreshKey((k) => k + 1);
  }

  async function handleAccept() {
    if (!activeCompanyId || !taskId || !user?.id) return;
    await acceptTask({ companyId: activeCompanyId, taskId: taskId as UUID, actorUserId: user.id });
    refresh();
  }
  async function handleStart() {
    if (!activeCompanyId || !taskId || !user?.id) return;
    await startTask({ companyId: activeCompanyId, taskId: taskId as UUID, actorUserId: user.id });
    refresh();
  }
  async function handleAwaitingEvidence() {
    if (!activeCompanyId || !taskId || !user?.id) return;
    await markAwaitingEvidence({ companyId: activeCompanyId, taskId: taskId as UUID, actorUserId: user.id });
    refresh();
  }
  async function handleSubmitForReview() {
    if (!activeCompanyId || !taskId || !user?.id) return;
    try {
      await submitForReview({ companyId: activeCompanyId, taskId: taskId as UUID, actorUserId: user.id });
      refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Submit failed');
    }
  }
  async function handleApprove() {
    if (!activeCompanyId || !taskId || !user?.id) return;
    await approveTask({ companyId: activeCompanyId, taskId: taskId as UUID, actorUserId: user.id });
    refresh();
  }
  async function handleClose() {
    if (!activeCompanyId || !taskId || !user?.id) return;
    try {
      await closeTask({ companyId: activeCompanyId, taskId: taskId as UUID, actorUserId: user.id });
      refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Cannot close');
    }
  }

  async function onAddComment() {
    if (!activeCompanyId || !taskId || !user?.id || !commentText.trim()) return;
    await addTaskComment({ companyId: activeCompanyId, taskId: taskId as UUID, actorUserId: user.id, text: commentText.trim() });
    setCommentText('');
    refresh();
  }

  async function onAddProgressUpdate() {
    if (!activeCompanyId || !taskId || !user?.id || !progressNote.trim()) return;
    await addTaskProgressUpdate({
      companyId: activeCompanyId,
      taskId: taskId as UUID,
      actorUserId: user.id,
      note: progressNote.trim(),
      percentComplete: progressPercent === '' ? undefined : Number(progressPercent)
    });
    setProgressNote('');
    setProgressPercent('');
    refresh();
  }

  async function onStartTime() {
    if (!activeCompanyId || !taskId || !user?.id) return;
    await startTimeEntry({ companyId: activeCompanyId, taskId: taskId as UUID, createdByUserId: user.id });
    refresh();
  }

  async function onStopTime(logId: UUID) {
    if (!activeCompanyId || !taskId || !user?.id) return;
    await stopTimeEntry({ companyId: activeCompanyId, timeLogId: logId, taskId: taskId as UUID, actorUserId: user.id });
    refresh();
  }

  async function onAddManualMinutes() {
    const mins = Number(manualMinutes);
    if (!activeCompanyId || !taskId || !user?.id || !Number.isFinite(mins) || mins <= 0) return;
    await logTaskTimeIncrement({ companyId: activeCompanyId, taskId: taskId as UUID, minutes: mins, createdByUserId: user.id });
    setManualMinutes('');
    refresh();
  }

  async function onSetEffectivenessCheck() {
    if (!activeCompanyId || !taskId || !user?.id) return;
    await setTaskEffectivenessCheck({
      companyId: activeCompanyId,
      taskId: taskId as UUID,
      actorUserId: user.id,
      checked: effectivenessChecked,
      notes: effectivenessNotes || undefined
    });
    refresh();
  }

  async function onDecideApproval(approvalId: UUID, decision: 'approved' | 'rejected') {
    if (!activeCompanyId || !user?.id) return;
    await decideApproval({ companyId: activeCompanyId, approvalId, actorUserId: user.id, decision });
    refresh();
  }

  function sourceLink(): { label: string; path: string } | null {
    if (!task?.source_entity_type || !task?.source_entity_id) return null;
    const type = String(task.source_entity_type);
    const id = task.source_entity_id;
    if (type === 'ncr') return { label: 'NCR', path: `/dashboard/management/ncrs?highlight=${id}` };
    if (type === 'incident') return { label: 'Incident', path: `/incidents?highlight=${id}` };
    if (type === 'audit_finding' || type === 'audit') return { label: 'Audit finding', path: `/audits?highlight=${id}` };
    if (type === 'inspection_run_item') return { label: 'Inspection', path: `/inspections?highlight=${id}` };
    if (type === 'ppe_issue_tracker') return { label: 'PPE issue', path: `/ppe?highlight=${id}` };
    if (type === 'program_audit_finding') return { label: 'Program audit', path: `/audits?highlight=${id}` };
    return { label: TASK_SOURCE_ENTITY_LABELS[type] ?? type, path: '#' };
  }

  const link = sourceLink();

  if (taskLoading || !taskId) {
    return (
      <Layout>
        <div className="p-6">
          <p className="text-charcoal-500">Loading task…</p>
        </div>
      </Layout>
    );
  }

  if (!task) {
    return (
      <Layout>
        <div className="p-6">
          <p className="text-charcoal-500">Task not found.</p>
          <button type="button" onClick={() => navigate('/dashboard/management/tasks')} className="mt-2 text-teal hover:underline">
            Back to tasks
          </button>
        </div>
      </Layout>
    );
  }

  const isAssignee = user?.id === task.assignee_user_id;
  const comments = (task.comments as { timestamp: string; user_id: string; text: string }[] | null) ?? [];
  const progressUpdates = (task.progress_updates as { timestamp: string; user_id: string; note: string; percent_complete?: number }[] | null) ?? [];

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/dashboard/management/tasks')}
            className="p-2 rounded-lg border border-surface-300 text-charcoal hover:bg-surface-50"
          >
            <ArrowLeftIcon className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold text-charcoal truncate">{task.title}</h1>
            <p className="text-sm text-charcoal-500 mt-0.5">
              TSK-{shortId(task.id)} • {task.category ? TASK_CATEGORY_LABELS[task.category as keyof typeof TASK_CATEGORY_LABELS] : task.module}
            </p>
          </div>
          <StatusBadge status={task.status as any} size="sm" />
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-4 text-sm text-charcoal-600">
          <span className="flex items-center gap-1.5">
            <CalendarIcon className="w-4 h-4" />
            Due {formatDateZA(task.due_at)}
          </span>
          <span className="flex items-center gap-1.5">
            <UserIcon className="w-4 h-4" />
            Assignee: {task.assignee_user_id ? `User ${shortId(task.assignee_user_id)}` : 'Unassigned'}
          </span>
          <span className={`flex items-center gap-1.5 ${priorityColors[task.priority as string] ?? ''}`}>
            <FlagIcon className="w-4 h-4" />
            {task.priority}
          </span>
          {task.risk_level && (
            <span className="flex items-center gap-1.5">
              <AlertTriangleIcon className="w-4 h-4" />
              {task.risk_level}
            </span>
          )}
          {task.time_status_indicator && (
            <span className="rounded px-2 py-0.5 bg-surface-100 text-charcoal-700">
              {TASK_TIME_STATUS_LABELS[task.time_status_indicator] ?? task.time_status_indicator}
            </span>
          )}
        </div>

        {/* Workflow actions */}
        {activeCompanyId && user?.id && (
          <div className="flex flex-wrap gap-2">
            {task.status === 'assigned' && isAssignee && (
              <button
                type="button"
                onClick={() => void handleAccept()}
                className="px-3 py-1.5 rounded-lg bg-teal text-white text-sm font-medium hover:bg-teal-600"
              >
                Accept task
              </button>
            )}
            {['accepted', 'reopened'].includes(task.status) && (
              <button
                type="button"
                onClick={() => void handleStart()}
                className="px-3 py-1.5 rounded-lg bg-surface-200 text-charcoal text-sm font-medium hover:bg-surface-300"
              >
                Mark in progress
              </button>
            )}
            {task.status === 'in-progress' && (
              <button
                type="button"
                onClick={() => void handleAwaitingEvidence()}
                className="px-3 py-1.5 rounded-lg bg-surface-200 text-charcoal text-sm font-medium hover:bg-surface-300"
              >
                Awaiting evidence
              </button>
            )}
            {task.status === 'awaiting-evidence' && (
              <button
                type="button"
                onClick={() => void handleSubmitForReview()}
                className="px-3 py-1.5 rounded-lg bg-surface-200 text-charcoal text-sm font-medium hover:bg-surface-300"
              >
                Send for review
              </button>
            )}
                        {task.status === 'under-review' && canManageTasks && (
                          <button
                            type="button"
                            onClick={() => void handleApprove()}
                            className="px-3 py-1.5 rounded-lg bg-surface-200 text-charcoal text-sm font-medium hover:bg-surface-300"
                          >
                            Approve
                          </button>
                        )}
                        {task.status === 'approved' && canManageTasks && (
                          <button
                            type="button"
                            onClick={() => void handleClose()}
                            className="px-3 py-1.5 rounded-lg bg-success text-white text-sm font-medium hover:bg-success-600"
                          >
                            Close task
                          </button>
                        )}
          </div>
        )}

        {task.description && (
          <div className="bg-white rounded-xl border border-surface-300 p-4">
            <h2 className="text-sm font-semibold text-charcoal mb-2">Description</h2>
            <p className="text-sm text-charcoal-600 whitespace-pre-wrap">{task.description}</p>
          </div>
        )}

        {/* Timeline */}
        <div className="bg-white rounded-xl border border-surface-300 p-4">
          <h2 className="text-sm font-semibold text-charcoal mb-3">Activity timeline</h2>
          <ul className="space-y-2 max-h-64 overflow-y-auto">
            {(activityLogs ?? []).map((log) => (
              <li key={log.id} className="flex gap-2 text-sm">
                <span className="text-charcoal-400 shrink-0">{formatDateTime(log.created_at)}</span>
                <span className="text-charcoal-600">
                  User {shortId(log.actor_user_id)} — {log.action}
                </span>
              </li>
            ))}
            {(activityLogs ?? []).length === 0 && <li className="text-charcoal-500 text-sm">No activity yet.</li>}
          </ul>
        </div>

        {/* Evidence */}
        <div className="bg-white rounded-xl border border-surface-300 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-charcoal">Evidence</h2>
            <button
              type="button"
              onClick={() => setEvidenceModalOpen(true)}
              className="text-sm text-teal font-medium hover:underline"
            >
              Add evidence
            </button>
          </div>
          <ul className="space-y-1">
            {(evidenceList ?? []).map((e) => (
              <li key={e.id} className="text-sm text-charcoal-600 flex items-center gap-2">
                <FileCheckIcon className="w-4 h-4 text-charcoal-400" />
                {e.title ?? e.storage_key}
              </li>
            ))}
            {(evidenceList ?? []).length === 0 && <li className="text-charcoal-500 text-sm">No evidence attached.</li>}
          </ul>
        </div>

        {activeCompanyId && taskId && user?.id && (
          <EvidenceModal
            open={evidenceModalOpen}
            onClose={() => setEvidenceModalOpen(false)}
            companyId={activeCompanyId}
            actorUserId={user.id}
            entityType="task"
            entityId={taskId as UUID}
            title="Task evidence"
          />
        )}

        {/* Comments */}
        <div className="bg-white rounded-xl border border-surface-300 p-4">
          <h2 className="text-sm font-semibold text-charcoal mb-3 flex items-center gap-2">
            <MessageSquareIcon className="w-4 h-4" />
            Comments
          </h2>
          <div className="space-y-2 mb-3">
            {comments.slice(0, 20).map((c, i) => (
              <div key={i} className="text-sm pl-3 border-l-2 border-surface-200">
                <span className="text-charcoal-400">{formatDateTime(c.timestamp)} • User {shortId(c.user_id)}</span>
                <p className="text-charcoal-700 mt-0.5">{c.text}</p>
              </div>
            ))}
            {comments.length === 0 && <p className="text-charcoal-500 text-sm">No comments yet.</p>}
          </div>
          {activeCompanyId && user?.id && (
            <div className="flex gap-2">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Add a comment..."
                className="flex-1 px-3 py-2 border border-surface-300 rounded-lg text-sm"
              />
              <button
                type="button"
                onClick={() => void onAddComment()}
                disabled={!commentText.trim()}
                className="px-3 py-2 rounded-lg bg-teal text-white text-sm font-medium hover:bg-teal-600 disabled:opacity-60"
              >
                Post
              </button>
            </div>
          )}
        </div>

        {/* Progress updates */}
        <div className="bg-white rounded-xl border border-surface-300 p-4">
          <h2 className="text-sm font-semibold text-charcoal mb-3">Progress updates</h2>
          <ul className="space-y-2 mb-3">
            {progressUpdates.slice(0, 10).map((p, i) => (
              <li key={i} className="text-sm">
                <span className="text-charcoal-400">{formatDateTime(p.timestamp)}</span>
                {p.percent_complete != null && (
                  <span className="ml-2 rounded px-1.5 py-0.5 bg-teal/10 text-teal">{p.percent_complete}%</span>
                )}
                <p className="text-charcoal-700 mt-0.5">{p.note}</p>
              </li>
            ))}
            {progressUpdates.length === 0 && <p className="text-charcoal-500 text-sm">No progress updates yet.</p>}
          </ul>
          {activeCompanyId && user?.id && (
            <div className="flex flex-wrap gap-2 items-end">
              <input
                type="text"
                value={progressNote}
                onChange={(e) => setProgressNote(e.target.value)}
                placeholder="Progress note..."
                className="flex-1 min-w-[200px] px-3 py-2 border border-surface-300 rounded-lg text-sm"
              />
              <input
                type="number"
                min={0}
                max={100}
                value={progressPercent}
                onChange={(e) => setProgressPercent(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="%"
                className="w-16 px-2 py-2 border border-surface-300 rounded-lg text-sm"
              />
              <button
                type="button"
                onClick={() => void onAddProgressUpdate()}
                disabled={!progressNote.trim()}
                className="px-3 py-2 rounded-lg bg-teal text-white text-sm font-medium hover:bg-teal-600 disabled:opacity-60"
              >
                Add update
              </button>
            </div>
          )}
        </div>

        {/* Time tracking */}
        <div className="bg-white rounded-xl border border-surface-300 p-4">
          <h2 className="text-sm font-semibold text-charcoal mb-3 flex items-center gap-2">
            <ClockIcon className="w-4 h-4" />
            Time
          </h2>
          <p className="text-sm text-charcoal-600 mb-3">
            Estimated: {task.estimated_hours ?? '—'} h • Spent: {task.time_spent_minutes != null ? `${Math.round(task.time_spent_minutes / 60 * 10) / 10} h` : '0 h'}
          </p>
          {activeTimeEntry ? (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm text-teal">Timer running</span>
              <button
                type="button"
                onClick={() => activeTimeEntry && void onStopTime(activeTimeEntry.id)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-critical text-white text-sm font-medium"
              >
                <SquareIcon className="w-4 h-4" />
                Stop
              </button>
            </div>
          ) : (
            activeCompanyId &&
            user?.id && (
              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => void onStartTime()}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal text-white text-sm font-medium"
                >
                  <PlayIcon className="w-4 h-4" />
                  Start timer
                </button>
                <input
                  type="number"
                  min={1}
                  value={manualMinutes}
                  onChange={(e) => setManualMinutes(e.target.value)}
                  placeholder="Minutes"
                  className="w-24 px-2 py-1.5 border border-surface-300 rounded-lg text-sm"
                />
                <button
                  type="button"
                  onClick={() => void onAddManualMinutes()}
                  disabled={!manualMinutes || Number(manualMinutes) <= 0}
                  className="px-3 py-1.5 rounded-lg bg-surface-200 text-charcoal text-sm font-medium"
                >
                  Add time
                </button>
              </div>
            )
          )}
          <ul className="text-sm text-charcoal-600 space-y-1">
            {(timeLogs ?? []).slice(0, 10).map((log) => (
              <li key={log.id}>
                {log.minutes != null ? `${log.minutes} min` : 'In progress'} — {formatDateTime(log.started_at ?? log.created_at)}
              </li>
            ))}
          </ul>
        </div>

        {/* Approvals */}
        <div className="bg-white rounded-xl border border-surface-300 p-4">
          <h2 className="text-sm font-semibold text-charcoal mb-3">Approvals & sign-offs</h2>
          <ul className="space-y-2">
            {taskApprovals.map((a) => (
              <li key={a.id} className="flex items-center justify-between text-sm">
                <span>
                  {APPROVAL_LABELS[a.entity_type] ?? a.entity_type} — {a.status}
                </span>
                {a.status === 'pending' && a.approver_user_id === user?.id && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void onDecideApproval(a.id, 'rejected')}
                      className="px-2 py-1 rounded bg-surface-200 text-charcoal text-xs"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDecideApproval(a.id, 'approved')}
                      className="px-2 py-1 rounded bg-teal text-white text-xs"
                    >
                      Approve
                    </button>
                  </div>
                )}
              </li>
            ))}
            {taskApprovals.length === 0 && <p className="text-charcoal-500 text-sm">No approval requests yet.</p>}
          </ul>
        </div>

        {/* Effectiveness check (for closure) — managers/supervisors only */}
        {task.status !== 'closed' && canManageTasks && (
          <div className="bg-white rounded-xl border border-surface-300 p-4">
            <h2 className="text-sm font-semibold text-charcoal mb-3">Effectiveness check</h2>
            <div className="flex flex-wrap gap-3 items-start">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={effectivenessChecked}
                  onChange={(e) => setEffectivenessChecked(e.target.checked)}
                />
                <span className="text-sm">Effectiveness verified</span>
              </label>
              <input
                type="text"
                value={effectivenessNotes}
                onChange={(e) => setEffectivenessNotes(e.target.value)}
                placeholder="Notes (optional)"
                className="flex-1 min-w-[200px] px-3 py-2 border border-surface-300 rounded-lg text-sm"
              />
              <button
                type="button"
                onClick={() => void onSetEffectivenessCheck()}
                className="px-3 py-2 rounded-lg bg-teal text-white text-sm font-medium"
              >
                Save effectiveness check
              </button>
            </div>
          </div>
        )}

        {/* Linked source */}
        {link && (
          <div className="bg-white rounded-xl border border-surface-300 p-4">
            <h2 className="text-sm font-semibold text-charcoal mb-2 flex items-center gap-2">
              <LinkIcon className="w-4 h-4" />
              Linked from
            </h2>
            <button
              type="button"
              onClick={() => navigate(link.path)}
              className="text-teal font-medium hover:underline"
            >
              {link.label} — View source
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}

