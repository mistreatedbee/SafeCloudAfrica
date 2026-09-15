import React, { useEffect, useMemo, useState } from 'react';
import { useUser } from '@insforge/react';
import { motion } from 'framer-motion';
import { PlusIcon, TargetIcon } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { ListEmptyState } from '../components/ui/ListEmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { StatCard } from '../components/ui/StatCard';
import { HrEmployeeSelect } from '../components/ui/HrEmployeeSelect';
import { ObjectiveCreateModal } from '../components/general/ObjectiveCreateModal';
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import {
  createModuleTargetNote,
  createModuleTargetReview,
  listModuleTargetNotes,
  listModuleTargetReviews,
  listModuleTargets
} from '../api/services/moduleTargetsService';
import type {
  ModuleTarget,
  ModuleTargetNote,
  ModuleTargetReview,
  ModuleTargetReviewActionStatus,
  ModuleTargetStatus,
  UUID
} from '../api/models/entities';
import type { ModuleKey } from '../api/models/core';
import { toUserFacingError } from '../utils/userFacingMessage';
import { subscribeToLiveDataMutations } from '../api/liveData';
import { listIncidents } from '../api/services/incidentsService';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useIdentity } from '../hooks/useIdentity';
import { useToast } from '../components/ui/ToastProvider';
import { LockIcon, ChevronUpIcon } from 'lucide-react';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

const MODULE_OPTIONS: Array<{ value: ModuleKey; label: string }> = [
  { value: 'safety', label: 'Safety' },
  { value: 'health', label: 'Health' },
  { value: 'environment', label: 'Environment' },
  { value: 'quality', label: 'Quality' },
  { value: 'general', label: 'General' },
  { value: 'hr', label: 'HR' },
  { value: 'legal', label: 'Legal' },
  { value: 'security', label: 'Security' }
];

const STATUS_OPTIONS: Array<{ value: ModuleTargetStatus; label: string }> = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'not_achieved', label: 'Not Achieved' },
  { value: 'achieved', label: 'Achieved' },
  { value: 'closed', label: 'Closed' }
];

const ACTION_STATUS_OPTIONS: Array<{ value: ModuleTargetReviewActionStatus; label: string }> = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' }
];

function statusLabel(status: ModuleTargetStatus | undefined, achieved?: boolean) {
  const normalized = status ?? (achieved ? 'completed' : 'not_started');
  return STATUS_OPTIONS.find((s) => s.value === normalized)?.label ?? 'Not Started';
}

function statusClass(status: ModuleTargetStatus | undefined, achieved?: boolean) {
  const normalized = status ?? (achieved ? 'completed' : 'not_started');
  if (normalized === 'completed' || normalized === 'achieved') return 'bg-success/10 text-success border-success/20';
  if (normalized === 'closed') return 'bg-charcoal/10 text-charcoal border-charcoal/20';
  if (normalized === 'in_progress') return 'bg-warning/10 text-warning border-warning/20';
  if (normalized === 'on_hold') return 'bg-surface-200 text-charcoal-600 border-surface-300';
  if (normalized === 'not_achieved') return 'bg-critical/10 text-critical border-critical/20';
  return 'bg-surface-100 text-charcoal-500 border-surface-200';
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function isOverdue(target: ModuleTarget) {
  const status = target.status ?? (target.achieved ? 'completed' : 'not_started');
  const doneStatuses: ModuleTargetStatus[] = ['completed', 'achieved', 'closed'];
  return Boolean(target.target_date && target.target_date < todayKey() && !doneStatuses.includes(status));
}

function ReviewHistoryList(props: { reviews: ModuleTargetReview[] }) {
  if (props.reviews.length === 0) {
    return <p className="text-xs text-charcoal-400 italic">No reviews yet.</p>;
  }
  return (
    <div className="space-y-2 max-h-56 overflow-y-auto">
      {props.reviews.map((r) => (
        <div key={r.id} className="bg-white border border-surface-200 rounded-lg p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-charcoal-500">{r.review_date}</span>
            <span className="text-xs text-charcoal-400">&middot;</span>
            <span className="text-xs text-charcoal-600">{r.reviewer_name || 'Unknown reviewer'}</span>
            <span className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold ${statusClass(r.status)}`}>
              {statusLabel(r.status)}
            </span>
          </div>
          {(r.notes || r.not_achieved_reason) && (
            <p className="text-xs text-charcoal-600 mt-1.5">
              {r.notes ? (r.notes.length > 160 ? `${r.notes.slice(0, 160)}...` : r.notes) : ''}
              {r.not_achieved_reason && (
                <span className="block text-critical mt-0.5">Reason: {r.not_achieved_reason}</span>
              )}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function ReviewPanel(props: {
  companyId: UUID;
  target: ModuleTarget;
  actorUserId?: UUID;
  actorName?: string | null;
  onSaved: () => void;
  onClose: () => void;
}) {
  const { showSuccess, showError } = useToast();
  const isAchieved = props.target.status === 'achieved';

  const [reviews, setReviews] = useState<ModuleTargetReview[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [status, setStatus] = useState<ModuleTargetStatus>(props.target.status ?? 'not_started');
  const [reviewDate, setReviewDate] = useState(todayKey());
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [correctiveAction, setCorrectiveAction] = useState(props.target.review_corrective_action ?? '');
  const [responsibleEmployeeId, setResponsibleEmployeeId] = useState<UUID | ''>(
    (props.target.review_responsible_employee_id ?? '') as UUID | ''
  );
  const [responsibleUserId, setResponsibleUserId] = useState<UUID | null>(props.target.review_responsible_user_id ?? null);
  const [responsibleName, setResponsibleName] = useState(props.target.review_responsible_name ?? '');
  const [resourcesRequired, setResourcesRequired] = useState(props.target.review_resources_required ?? '');
  const [actionStatus, setActionStatus] = useState<ModuleTargetReviewActionStatus>(
    props.target.review_action_status ?? 'not_started'
  );
  const [closeDate, setCloseDate] = useState(props.target.review_close_date ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoadingHistory(true);
    listModuleTargetReviews({ companyId: props.companyId, moduleTargetId: props.target.id })
      .then(setReviews)
      .catch(() => setReviews([]))
      .finally(() => setLoadingHistory(false));
  }, [props.companyId, props.target.id]);

  const isNotAchieved = status === 'not_achieved';

  async function saveReview() {
    setError(null);
    if (!props.actorUserId) return;
    if (isNotAchieved && !reason.trim()) {
      setError('A reason is required when marking this objective as not achieved.');
      return;
    }
    setSaving(true);
    try {
      const result = await createModuleTargetReview({
        companyId: props.companyId,
        moduleTargetId: props.target.id,
        reviewerUserId: props.actorUserId,
        reviewerName: props.actorName ?? null,
        reviewDate,
        status,
        notes: notes.trim() || null,
        notAchievedReason: isNotAchieved ? reason.trim() : null,
        correctiveAction: correctiveAction.trim() || null,
        responsibleEmployeeId: responsibleEmployeeId || null,
        responsibleUserId,
        responsibleName: responsibleName || null,
        resourcesRequired: resourcesRequired.trim() || null,
        actionStatus,
        closeDate: closeDate || null,
        createdByUserId: props.actorUserId
      });
      setReviews((prev) => [result.review, ...prev]);
      setNotes('');
      setReason('');
      showSuccess(`Review saved — status set to ${statusLabel(status)}.`);
      props.onSaved();
    } catch (err) {
      const message = toUserFacingError(err, 'Unable to save target review.');
      setError(message);
      showError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-surface-300 bg-white p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-charcoal">Review</p>
        <button
          type="button"
          onClick={props.onClose}
          className="inline-flex items-center gap-1 text-xs font-medium text-charcoal-500 hover:text-charcoal"
        >
          <ChevronUpIcon className="w-3.5 h-3.5" /> Collapse
        </button>
      </div>

      {isAchieved ? (
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-3 text-sm text-success">
          <LockIcon className="w-4 h-4" />
          <span>
            Achieved{props.target.completed_at ? ` on ${new Date(props.target.completed_at).toLocaleDateString('en-ZA')}` : ''} — locked, no
            further reviews.
          </span>
        </div>
      ) : (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 space-y-4">
          {error && <p className="text-sm text-critical">{error}</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label>
              <span className="block text-sm font-medium text-charcoal mb-1.5">Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ModuleTargetStatus)}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="block text-sm font-medium text-charcoal mb-1.5">Review Date</span>
              <input
                type="date"
                value={reviewDate}
                onChange={(e) => setReviewDate(e.target.value)}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
              />
            </label>
            <label className="md:col-span-2">
              <span className="block text-sm font-medium text-charcoal mb-1.5">Review Notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="What did you observe in this review?"
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
              />
            </label>
            {isNotAchieved && (
              <label className="md:col-span-2">
                <span className="block text-sm font-medium text-charcoal mb-1.5">
                  Reason for not achieving objective <span className="text-critical">*</span>
                </span>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  required
                  className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
                />
              </label>
            )}
            <label className="md:col-span-2">
              <span className="block text-sm font-medium text-charcoal mb-1.5">Corrective Action Required</span>
              <textarea
                value={correctiveAction}
                onChange={(e) => setCorrectiveAction(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
              />
            </label>
            <HrEmployeeSelect
              companyId={props.companyId}
              value={responsibleEmployeeId}
              valueField="id"
              includeUnlinked
              label="Responsible Person"
              placeholder="Select corrective action owner"
              onChange={(value, meta) => {
                setResponsibleEmployeeId(value);
                setResponsibleUserId(meta.userId ?? null);
                setResponsibleName(meta.nameSnapshot);
              }}
            />
            <label>
              <span className="block text-sm font-medium text-charcoal mb-1.5">Resources Required</span>
              <input
                value={resourcesRequired}
                onChange={(e) => setResourcesRequired(e.target.value)}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
              />
            </label>
            <label>
              <span className="block text-sm font-medium text-charcoal mb-1.5">Corrective Action Status</span>
              <select
                value={actionStatus}
                onChange={(e) => setActionStatus(e.target.value as ModuleTargetReviewActionStatus)}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
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
                value={closeDate}
                onChange={(e) => setCloseDate(e.target.value)}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
              />
            </label>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void saveReview()}
              disabled={saving || (isNotAchieved && !reason.trim())}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60"
            >
              {saving && <LoadingSpinner size={16} />}
              Save Review
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Review History</p>
        {loadingHistory && <p className="text-xs text-charcoal-400">Loading history...</p>}
        {!loadingHistory && <ReviewHistoryList reviews={reviews} />}
      </div>
    </div>
  );
}

function NotesPanel(props: {
  companyId: UUID;
  targetId: UUID;
  actorUserId?: UUID;
  actorName?: string | null;
}) {
  const [notes, setNotes] = useState<ModuleTargetNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  useEffect(() => {
    setLoadingNotes(true);
    listModuleTargetNotes({ companyId: props.companyId, moduleTargetId: props.targetId })
      .then(setNotes)
      .catch(() => setNotes([]))
      .finally(() => setLoadingNotes(false));
  }, [props.companyId, props.targetId]);

  async function addNote() {
    if (!noteText.trim() || !props.actorUserId) return;
    setSubmitting(true);
    setNoteError(null);
    try {
      const created = await createModuleTargetNote({
        companyId: props.companyId,
        moduleTargetId: props.targetId,
        note: noteText.trim(),
        createdByUserId: props.actorUserId,
        createdByName: props.actorName ?? null
      });
      setNotes((prev) => [created, ...prev]);
      setNoteText('');
    } catch (err: unknown) {
      setNoteError(err instanceof Error ? err.message : 'Failed to add note.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Progress Notes</p>
      {noteError && <p className="text-xs text-critical">{noteError}</p>}
      <div className="flex gap-2">
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          rows={2}
          placeholder="Add a progress update..."
          className="flex-1 px-3 py-2 border border-surface-300 rounded-lg text-sm resize-none"
        />
        <button
          type="button"
          onClick={() => void addNote()}
          disabled={submitting || !noteText.trim()}
          className="px-3 py-2 rounded-lg bg-teal text-white text-xs font-semibold hover:bg-teal-600 disabled:opacity-60 self-end"
        >
          {submitting ? '...' : 'Add'}
        </button>
      </div>
      {loadingNotes && <p className="text-xs text-charcoal-400">Loading notes...</p>}
      {!loadingNotes && notes.length === 0 && (
        <p className="text-xs text-charcoal-400 italic">No progress notes yet.</p>
      )}
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {notes.map((n) => (
          <div key={n.id} className="bg-white border border-surface-200 rounded-lg p-3">
            <p className="text-sm text-charcoal">{n.note}</p>
            <p className="text-xs text-charcoal-400 mt-1">
              {n.created_by_name ?? 'Unknown'} &middot; {new Date(n.created_at).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ObjectivesTargetsPage() {
  const { activeCompanyId } = useTenant();
  const { user } = useUser();
  const [refreshKey, setRefreshKey] = useState(0);
  const [moduleFilter, setModuleFilter] = useState<ModuleKey | ''>('');
  const [createModule, setCreateModule] = useState<ModuleKey>('safety');
  const [createOpen, setCreateOpen] = useState(false);
  /** Which objective's review panel is open -- collapsed by default, toggled via the review circle/button. */
  const [expandedReviewId, setExpandedReviewId] = useState<string | null>(null);
  const [expandedNotesId, setExpandedNotesId] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const { fullName } = useIdentity();

  useEffect(() => subscribeToLiveDataMutations(() => setRefreshKey((k) => k + 1)), []);

  const { data, loading, error } = useAsync<ModuleTarget[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listModuleTargets({
        companyId: activeCompanyId,
        module: moduleFilter || undefined,
        limit: 500
      });
    },
    [activeCompanyId, moduleFilter, refreshKey]
  );

  const { data: incidents } = useAsync(
    async () => {
      if (!activeCompanyId) return [];
      const since = new Date();
      since.setMonth(since.getMonth() - 5);
      since.setDate(1);
      const rows = await listIncidents({ companyId: activeCompanyId, limit: 500 });
      return rows.filter((inc) => new Date(inc.occurred_at) >= since);
    },
    [activeCompanyId, refreshKey]
  );

  const incidentTrend = useMemo(() => {
    const buckets = new Map<string, number>();
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      buckets.set(key, 0);
    }
    for (const inc of incidents ?? []) {
      const d = new Date(inc.occurred_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    return Array.from(buckets.entries()).map(([month, count]) => ({
      month: month.slice(5) + '/' + month.slice(2, 4),
      incidents: count
    }));
  }, [incidents]);

  const objectives = data ?? [];
  const doneStatuses: ModuleTargetStatus[] = ['completed', 'achieved', 'closed'];
  const summary = useMemo(() => {
    const total = objectives.length;
    const completed = objectives.filter((o) =>
      doneStatuses.includes((o.status ?? (o.achieved ? 'completed' : 'not_started')) as ModuleTargetStatus)
    ).length;
    const notAchieved = objectives.filter((o) => (o.status ?? '') === 'not_achieved').length;
    const overdue = objectives.filter(isOverdue).length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, notAchieved, overdue, completionRate };
  }, [objectives]);


  return (
    <Layout title="Objectives & Targets">
      {activeCompanyId && (
        <ObjectiveCreateModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          companyId={activeCompanyId}
          module={createModule}
          onCreated={() => setRefreshKey((k) => k + 1)}
        />
      )}

      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
        <motion.div variants={itemVariants} className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-charcoal flex items-center gap-2">
                <TargetIcon className="w-5 h-5 text-teal" />
                Objectives & Targets
              </h2>
              <p className="text-sm text-charcoal-500 mt-2">
                Track practical objectives, responsible people, target dates, and completion review.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={createModule}
                onChange={(e) => setCreateModule(e.target.value as ModuleKey)}
                className="px-3 py-2 border border-surface-300 rounded-lg text-sm"
                aria-label="Module for new objective"
              >
                {MODULE_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                disabled={!activeCompanyId}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60"
              >
                <PlusIcon className="w-4 h-4" />
                Create Objective
              </button>
            </div>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard title="Total Objectives" value={summary.total} icon="ClipboardCheck" iconColor="#0FB9B1" />
          <StatCard title="Completed" value={summary.completed} icon="ClipboardCheck" iconColor="#2ECC71" variant="success" />
          <StatCard title="Not Achieved" value={summary.notAchieved} icon="AlertTriangle" iconColor="#E74C3C" variant="critical" />
          <StatCard title="Overdue" value={summary.overdue} icon="Calendar" iconColor="#F5A623" variant="warning" />
          <StatCard title="Completion Rate" value={`${summary.completionRate}%`} icon="Shield" iconColor="#0A2540" />
        </motion.div>

        <motion.div variants={itemVariants} className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
          <h3 className="font-semibold text-charcoal mb-1">Incident trend (last 6 months)</h3>
          <p className="text-xs text-charcoal-500 mb-4">Track incident volume alongside objective completion — useful for safety/quality target reviews.</p>
          {incidentTrend.every((row) => row.incidents === 0) ? (
            <p className="text-sm text-charcoal-500">No incidents recorded in the last 6 months.</p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={incidentTrend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="incidents" fill="#0FB9B1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </motion.div>

        <motion.div variants={itemVariants} className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h3 className="font-semibold text-charcoal">Objectives List</h3>
            <select
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value as ModuleKey | '')}
              className="px-3 py-2 border border-surface-300 rounded-lg text-sm"
              aria-label="Filter objectives by module"
            >
              <option value="">All modules</option>
              {MODULE_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {pageError && (
            <div className="mx-5 mt-4 bg-critical/5 border border-critical/20 rounded-lg p-3">
              <p className="text-sm text-critical">{pageError}</p>
            </div>
          )}
          {loading && <p className="px-5 py-4 text-sm text-charcoal-500">Loading objectives...</p>}
          {error && (
            <div className="px-5 py-4">
              <p className="text-sm font-semibold text-critical">Unable to load objectives</p>
              <p className="text-sm text-charcoal-500 mt-1">{error.message}</p>
            </div>
          )}

          {!loading && !error && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Objective</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Target</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Responsible Person</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Target Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-200">
                  {objectives.length === 0 && (
                    <ListEmptyState
                      tableColSpan={5}
                      icon={TargetIcon}
                      title="No objectives yet"
                      description="Create an objective, assign a responsible person, and track it to completion."
                      primaryAction={{ kind: 'button', label: 'Create Objective', onClick: () => setCreateOpen(true) }}
                    />
                  )}
                  {objectives.map((objective) => {
                    const normalizedStatus = objective.status ?? (objective.achieved ? 'completed' : 'not_started');
                    const isAchieved = normalizedStatus === 'achieved';
                    return (
                      <React.Fragment key={objective.id}>
                        <tr className={isOverdue(objective) ? 'bg-critical/5' : undefined}>
                          <td className="px-4 py-3 align-top">
                            <p className="text-sm font-medium text-charcoal">{objective.name}</p>
                            <p className="text-xs text-charcoal-400 mt-1 capitalize">
                              {objective.module}
                              {isOverdue(objective) ? ' - Overdue' : ''}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-sm text-charcoal-600 align-top">
                            <span>{objective.target_text || `${objective.target_value}${objective.unit ?? ''}`}</span>
                            {objective.target_value > 0 && (
                              <div className="mt-2">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs text-charcoal-400">Progress</span>
                                  <span className="text-xs font-semibold text-charcoal-600">
                                    {Math.min(100, Math.round((objective.current_value / objective.target_value) * 100))}%
                                  </span>
                                </div>
                                <div className="w-full bg-surface-200 rounded-full h-1.5">
                                  <div
                                    className="bg-teal h-1.5 rounded-full transition-all"
                                    style={{ width: `${Math.min(100, Math.round((objective.current_value / objective.target_value) * 100))}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-charcoal-600 align-top">
                            {objective.responsible_name || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-charcoal-600 align-top">
                            {objective.target_date || '-'}
                          </td>
                          <td className="px-4 py-3 align-top min-w-[210px]">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`px-2 py-1 rounded-full border text-xs font-semibold ${statusClass(objective.status, objective.achieved)}`}>
                                {statusLabel(objective.status, objective.achieved)}
                              </span>
                              {isAchieved ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-success/20 bg-success/5 text-xs font-medium text-success">
                                  <LockIcon className="w-3 h-3" />
                                  {objective.completed_at
                                    ? `Achieved ${new Date(objective.completed_at).toLocaleDateString('en-ZA')}`
                                    : 'Achieved'}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setExpandedReviewId((cur) => (cur === objective.id ? null : objective.id))}
                                  aria-label={expandedReviewId === objective.id ? 'Collapse review' : 'Add review'}
                                  className={`w-7 h-7 inline-flex items-center justify-center rounded-full border text-xs font-semibold ${
                                    expandedReviewId === objective.id
                                      ? 'bg-teal text-white border-teal'
                                      : 'border-surface-300 text-charcoal-500 hover:bg-surface-50'
                                  }`}
                                  title={expandedReviewId === objective.id ? 'Hide review' : 'Add review / view reviews'}
                                >
                                  {expandedReviewId === objective.id ? '−' : '+'}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setExpandedNotesId((cur) => (cur === objective.id ? null : objective.id))}
                                className="px-2 py-1.5 rounded-lg border border-surface-300 text-xs font-medium text-charcoal hover:bg-surface-50"
                              >
                                {expandedNotesId === objective.id ? 'Hide Notes' : 'Notes'}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expandedReviewId === objective.id && activeCompanyId && (
                          <tr>
                            <td colSpan={5} className="px-4 py-4 bg-surface-50">
                              <ReviewPanel
                                companyId={activeCompanyId}
                                target={objective}
                                actorUserId={user?.id}
                                actorName={fullName}
                                onSaved={() => setRefreshKey((k) => k + 1)}
                                onClose={() => setExpandedReviewId(null)}
                              />
                            </td>
                          </tr>
                        )}
                        {expandedNotesId === objective.id && activeCompanyId && (
                          <tr>
                            <td colSpan={5} className="px-4 py-4 bg-surface-50">
                              <NotesPanel
                                companyId={activeCompanyId}
                                targetId={objective.id}
                                actorUserId={user?.id as UUID | undefined}
                                actorName={(user as any)?.user_metadata?.full_name ?? null}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      </motion.div>
    </Layout>
  );
}
