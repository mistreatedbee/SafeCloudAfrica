import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ClipboardCheckIcon,
  PlusIcon,
  SearchIcon,
  CalendarIcon,
  UserIcon,
  FlagIcon } from
'lucide-react';
import { Layout } from '../components/layout/Layout';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useUser } from '@insforge/react';
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import { listTasks, updateTaskStatus } from '../api/services/tasksService';
import type { Task } from '../api/models/entities';
import type { CorrectiveAction } from '../api/services/correctiveActionsService';
import { TaskCreateModal } from '../components/tasks/TaskCreateModal';
import { listCorrectiveActions, completeCorrectiveAction } from '../api/services/correctiveActionsService';
import { toCsv, downloadTextFile } from '../utils/csv';
import { useIdentity } from '../hooks/useIdentity';

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

const priorityColors = {
  critical: 'text-critical',
  high: 'text-warning',
  medium: 'text-teal',
  low: 'text-charcoal-400'
};
const containerVariants = {
  hidden: {
    opacity: 0
  },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
};
const itemVariants = {
  hidden: {
    opacity: 0,
    y: 20
  },
  visible: {
    opacity: 1,
    y: 0
  }
};
export function TasksPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [refreshKey, setRefreshKey] = useState(0);
  const { user } = useUser();
  const { activeCompanyId, activeRole } = useTenant();
  const { fullName, organisationName } = useIdentity();
  const canCreate = activeRole === 'admin' || activeRole === 'manager' || activeRole === 'supervisor' || activeRole === 'consultant';
  const isNew = location.pathname.endsWith('/new');
  const [createOpen, setCreateOpen] = useState(isNew);
  const view = (params.get('view') || 'tasks') as 'tasks' | 'capa';
  const canManageCapa = activeRole === 'admin' || activeRole === 'manager' || activeRole === 'supervisor' || activeRole === 'consultant' || activeRole === 'auditor';

  useEffect(() => {
    setCreateOpen(isNew);
  }, [isNew]);

  const { data, loading, error } = useAsync<Task[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listTasks({
        companyId: activeCompanyId,
        assigneeUserId: activeRole === 'employee' ? user?.id : undefined,
        limit: 200
      });
    },
    [activeCompanyId, activeRole, user?.id]
  );

  const allTasks = data ?? [];
  const filteredTasks = allTasks.filter((task) => {
    const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const taskCounts: Record<string, number> = {
    all: allTasks.length,
    draft: allTasks.filter((t) => t.status === 'draft').length,
    assigned: allTasks.filter((t) => t.status === 'assigned').length,
    accepted: allTasks.filter((t) => t.status === 'accepted').length,
    'in-progress': allTasks.filter((t) => t.status === 'in-progress').length,
    'awaiting-evidence': allTasks.filter((t) => t.status === 'awaiting-evidence').length,
    'under-review': allTasks.filter((t) => t.status === 'under-review').length,
    approved: allTasks.filter((t) => t.status === 'approved').length,
    closed: allTasks.filter((t) => t.status === 'closed').length,
    reopened: allTasks.filter((t) => t.status === 'reopened').length,
    overdue: allTasks.filter((t) => t.status === 'overdue').length
  };

  const { data: capaData, loading: capaLoading, error: capaError } = useAsync<CorrectiveAction[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listCorrectiveActions({
        companyId: activeCompanyId,
        assignedToUserId: activeRole === 'employee' ? (user?.id as any) : undefined,
        limit: 300
      });
    },
    [activeCompanyId, activeRole, user?.id, view, refreshKey]
  );

  const allCapas = capaData ?? [];
  const filteredCapas = allCapas.filter((c) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      c.title.toLowerCase().includes(q) ||
      String(c.description ?? '').toLowerCase().includes(q) ||
      String((c as any).source_entity_type ?? '').toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  async function onCloseCapa(id: string) {
    if (!activeCompanyId || !user?.id) return;
    await completeCorrectiveAction(id as any, activeCompanyId, 'Closed via CAPA view', user.id as any);
    setRefreshKey((k) => k + 1);
  }

  async function handleTaskStatusChange(task: Task, nextStatus: Task['status']) {
    if (!activeCompanyId || !user?.id) return;
    await updateTaskStatus({
      companyId: activeCompanyId,
      taskId: task.id as any,
      status: nextStatus,
      actorUserId: user.id as any
    });
    setRefreshKey((k) => k + 1);
  }

  function handleExportCsv() {
    if (!activeCompanyId) return;

    const metaLines = [
      `Company: ${organisationName}`,
      `Generated by: ${fullName}`,
      `Generated at: ${new Date().toISOString()}`,
      '',
    ];

    const today = new Date().toISOString().slice(0, 10);
    const safeOrg = organisationName.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'safecloudafrica';

    if (view === 'tasks') {
      if (filteredTasks.length === 0) return;
      const rows = filteredTasks.map((task) => ({
        task_id: task.id,
        title: task.title,
        module: task.module,
        status: task.status,
        priority: task.priority,
        assignee_user_id: task.assignee_user_id ?? '',
        due_at: task.due_at ?? '',
        created_at: task.created_at,
      }));
      const csvBody = toCsv(rows);
      const content = `${metaLines.join('\r\n')}\r\n${csvBody}`;
      const filename = `${safeOrg}-tasks-${today}.csv`;
      downloadTextFile(filename, content, 'text/csv;charset=utf-8');
      return;
    }

    if (filteredCapas.length === 0) return;
    const rows = filteredCapas.map((capa) => ({
      capa_id: capa.id,
      title: capa.title,
      status: capa.status,
      source_type: capa.source_type,
      assigned_to_user_id: capa.assigned_to_user_id ?? '',
      due_date: (capa as any).due_date ?? '',
      created_at: capa.created_at,
    }));
    const csvBody = toCsv(rows);
    const content = `${metaLines.join('\r\n')}\r\n${csvBody}`;
    const filename = `${safeOrg}-capa-${today}.csv`;
    downloadTextFile(filename, content, 'text/csv;charset=utf-8');
  }

  return (
    <Layout title="Tasks & Corrective Actions">
      {canCreate && activeCompanyId && user?.id && (
        <TaskCreateModal
          open={createOpen}
          onClose={() => {
            setCreateOpen(false);
            if (isNew) navigate('/tasks', { replace: true });
          }}
          companyId={activeCompanyId}
          createdByUserId={user.id}
          defaultModule="safety"
          onCreated={() => navigate('/tasks', { replace: true })}
        />
      )}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-6">

        <motion.div variants={itemVariants} className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate('/tasks')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${view === 'tasks' ? 'bg-navy text-white' : 'bg-white border border-surface-300 text-charcoal hover:bg-surface-50'}`}
          >
            Tasks
          </button>
          <button
            type="button"
            onClick={() => navigate('/tasks?view=capa')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${view === 'capa' ? 'bg-navy text-white' : 'bg-white border border-surface-300 text-charcoal hover:bg-surface-50'}`}
          >
            CAPA
          </button>
        </motion.div>

        {/* Header */}
        <motion.div
          variants={itemVariants}
          className="flex flex-col sm:flex-row gap-4 justify-between">

          <div className="flex flex-1 gap-3">
            <div className="relative flex-1 max-w-md">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-400" />
              <input
                type="search"
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={
                !activeCompanyId ||
                (view === 'tasks' ? filteredTasks.length === 0 : filteredCapas.length === 0)
              }
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-navy text-white rounded-lg text-sm font-medium hover:bg-navy-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Export CSV
            </button>
            {view === 'tasks' && (
              <button
                type="button"
                disabled={!canCreate}
                onClick={() => navigate('/tasks/new')}
                className="flex items-center justify-center gap-2 px-5 py-2.5 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <PlusIcon className="w-4 h-4" />
                Create Task
              </button>
            )}
          </div>
        </motion.div>

        {view === 'tasks' && error && (
          <motion.div variants={itemVariants} className="bg-white rounded-xl border border-critical/30 p-4 shadow-card">
            <p className="text-sm font-semibold text-critical">Unable to load tasks</p>
            <p className="text-sm text-charcoal-500 mt-1">{error.message}</p>
          </motion.div>
        )}

        {view === 'capa' && capaError && (
          <motion.div variants={itemVariants} className="bg-white rounded-xl border border-critical/30 p-4 shadow-card">
            <p className="text-sm font-semibold text-critical">Unable to load CAPA</p>
            <p className="text-sm text-charcoal-500 mt-1">{capaError.message}</p>
          </motion.div>
        )}

        {/* Status Tabs */}
        <motion.div
          variants={itemVariants}
          className="flex gap-2 overflow-x-auto pb-2">

          {view === 'tasks' && (
            ([
              'all',
              'draft',
              'assigned',
              'accepted',
              'in-progress',
              'awaiting-evidence',
              'under-review',
              'approved',
              'closed',
              'reopened',
              'overdue'
            ] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  statusFilter === status
                    ? 'bg-navy text-white'
                    : 'bg-white border border-surface-300 text-charcoal hover:bg-surface-50'
                }`}
              >
                <span className="capitalize">
                  {status === 'all' ? 'All Tasks' : status.replace('-', ' ')}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-xs ${
                    statusFilter === status ? 'bg-white/20' : 'bg-surface-200'
                  }`}
                >
                  {taskCounts[status] ?? 0}
                </span>
              </button>
            ))
          )}

          {view === 'capa' && (
            (['all', 'open', 'assigned', 'in-progress', 'completed', 'verified', 'closed'] as const).map((status) =>
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${statusFilter === status ? 'bg-navy text-white' : 'bg-white border border-surface-300 text-charcoal hover:bg-surface-50'}`}>
                <span className="capitalize">
                  {status === 'all' ? 'All CAPA' : status.replace('-', ' ')}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-xs ${statusFilter === status ? 'bg-white/20' : 'bg-surface-200'}`}>
                  {status === 'all' ? allCapas.length : allCapas.filter((c) => c.status === status).length}
                </span>
              </button>
            )
          )}
        </motion.div>

        {/* Tasks List */}
        <motion.div variants={itemVariants} className="space-y-3">
          {view === 'tasks' && loading && (
            <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <p className="text-sm text-charcoal-500">Loading tasks…</p>
            </div>
          )}

          {view === 'tasks' && !loading && filteredTasks.length === 0 && (
            <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <p className="text-sm text-charcoal-500">No tasks found.</p>
            </div>
          )}

          {view === 'tasks' &&
            filteredTasks.map((task) => (
              <div
                key={task.id}
                className="bg-white rounded-xl border border-surface-300 p-4 shadow-card hover:shadow-card-hover transition-all"
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`p-2 rounded-lg ${
                      task.status === 'closed'
                        ? 'bg-success-50'
                        : task.status === 'overdue'
                          ? 'bg-critical-50'
                          : 'bg-surface-100'
                    }`}
                  >
                    <ClipboardCheckIcon
                      className={`w-5 h-5 ${
                        task.status === 'closed'
                          ? 'text-success'
                          : task.status === 'overdue'
                            ? 'text-critical'
                            : 'text-charcoal-400'
                      }`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-charcoal">{task.title}</p>
                        <p className="text-sm text-charcoal-400 mt-0.5">
                          TSK-{shortId(task.id)} • {task.module}
                        </p>
                      </div>
                      <StatusBadge status={task.status as any} size="sm" />
                    </div>
                    <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-charcoal-500">
                      <span className="flex items-center gap-1.5">
                        <CalendarIcon className="w-4 h-4" />
                        {formatDateZA(task.due_at)}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <UserIcon className="w-4 h-4" />
                        {task.assignee_user_id ? `User ${shortId(task.assignee_user_id)}` : 'Unassigned'}
                      </span>
                      <span
                        className={`flex items-center gap-1.5 ${
                          priorityColors[task.priority as keyof typeof priorityColors]
                        }`}
                      >
                        <FlagIcon className="w-4 h-4" />
                        <span className="capitalize">{task.priority}</span>
                      </span>
                    </div>
                    {activeCompanyId && user?.id && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {task.status === 'draft' && (
                          <button
                            type="button"
                            onClick={() => handleTaskStatusChange(task, 'assigned')}
                            className="px-3 py-1.5 rounded-lg bg-surface-100 text-xs font-medium text-charcoal hover:bg-surface-200"
                          >
                            Mark as assigned
                          </button>
                        )}
                        {task.status === 'assigned' && task.assignee_user_id === user.id && (
                          <button
                            type="button"
                            onClick={() => handleTaskStatusChange(task, 'accepted')}
                            className="px-3 py-1.5 rounded-lg bg-teal text-white text-xs font-medium hover:bg-teal-600"
                          >
                            Accept task
                          </button>
                        )}
                        {['accepted', 'reopened'].includes(task.status) && (
                          <button
                            type="button"
                            onClick={() => handleTaskStatusChange(task, 'in-progress')}
                            className="px-3 py-1.5 rounded-lg bg-surface-100 text-xs font-medium text-charcoal hover:bg-surface-200"
                          >
                            Mark in progress
                          </button>
                        )}
                        {task.status === 'in-progress' && (
                          <button
                            type="button"
                            onClick={() => handleTaskStatusChange(task, 'awaiting-evidence')}
                            className="px-3 py-1.5 rounded-lg bg-surface-100 text-xs font-medium text-charcoal hover:bg-surface-200"
                          >
                            Awaiting evidence
                          </button>
                        )}
                        {task.status === 'awaiting-evidence' && (
                          <button
                            type="button"
                            onClick={() => handleTaskStatusChange(task, 'under-review')}
                            className="px-3 py-1.5 rounded-lg bg-surface-100 text-xs font-medium text-charcoal hover:bg-surface-200"
                          >
                            Send for review
                          </button>
                        )}
                        {task.status === 'under-review' && (
                          <button
                            type="button"
                            onClick={() => handleTaskStatusChange(task, 'approved')}
                            className="px-3 py-1.5 rounded-lg bg-surface-100 text-xs font-medium text-charcoal hover:bg-surface-200"
                          >
                            Approve
                          </button>
                        )}
                        {['approved', 'in-progress'].includes(task.status) && (
                          <button
                            type="button"
                            onClick={() => handleTaskStatusChange(task, 'closed')}
                            className="px-3 py-1.5 rounded-lg bg-success text-white text-xs font-medium hover:bg-success-600"
                          >
                            Close task
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

          {view === 'capa' && capaLoading && (
            <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <p className="text-sm text-charcoal-500">Loading CAPA…</p>
            </div>
          )}

          {view === 'capa' && !capaLoading && filteredCapas.length === 0 && (
            <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <p className="text-sm text-charcoal-500">No corrective actions found.</p>
            </div>
          )}

          {view === 'capa' && filteredCapas.map((capa) => (
            <div key={capa.id} className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-charcoal">{capa.title}</p>
                  <p className="text-xs text-charcoal-400 mt-0.5">
                    CAPA • Source: {capa.source_type}
                  </p>
                  <p className="text-sm text-charcoal-500 mt-2 whitespace-pre-wrap">{capa.description ?? ''}</p>
                  <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-charcoal-500">
                    <span className="flex items-center gap-1.5">
                      <CalendarIcon className="w-4 h-4" />
                      {formatDateZA((capa as any).due_date as any)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <UserIcon className="w-4 h-4" />
                      {capa.assigned_to_user_id ? `User ${shortId(capa.assigned_to_user_id)}` : 'Unassigned'}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge status={capa.status as any} size="sm" />
                  {capa.status !== 'closed' && (
                    <button
                      type="button"
                      disabled={!canManageCapa || !activeCompanyId || !user?.id}
                      onClick={() => onCloseCapa(capa.id)}
                      className="px-3 py-1.5 rounded-lg bg-success text-white text-xs font-semibold hover:bg-success-600 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      Close
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </Layout>);

}