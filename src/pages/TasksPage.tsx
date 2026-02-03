import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
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
import { listTasks } from '../api/services/tasksService';
import type { Task } from '../api/models/entities';
import { TaskCreateModal } from '../components/tasks/TaskCreateModal';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const { user } = useUser();
  const { activeCompanyId, activeRole } = useTenant();
  const canCreate = activeRole === 'admin' || activeRole === 'manager' || activeRole === 'supervisor' || activeRole === 'consultant';
  const isNew = location.pathname.endsWith('/new');
  const [createOpen, setCreateOpen] = useState(isNew);

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

  const taskCounts = {
    all: allTasks.length,
    pending: allTasks.filter((t) => t.status === 'pending').length,
    'in-progress': allTasks.filter((t) => t.status === 'in-progress').length,
    completed: allTasks.filter((t) => t.status === 'completed').length,
    overdue: allTasks.filter((t) => t.status === 'overdue').length
  } as const;
  return (
    <Layout title="Tasks & Corrective Actions">
      {activeCompanyId && user?.id && (
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
          <button
            type="button"
            disabled={!canCreate}
            onClick={() => navigate('/tasks/new')}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <PlusIcon className="w-4 h-4" />
            Create Task
          </button>
        </motion.div>

        {error && (
          <motion.div variants={itemVariants} className="bg-white rounded-xl border border-critical/30 p-4 shadow-card">
            <p className="text-sm font-semibold text-critical">Unable to load tasks</p>
            <p className="text-sm text-charcoal-500 mt-1">{error.message}</p>
          </motion.div>
        )}

        {/* Status Tabs */}
        <motion.div
          variants={itemVariants}
          className="flex gap-2 overflow-x-auto pb-2">

          {(
          ['all', 'pending', 'in-progress', 'completed', 'overdue'] as const).
          map((status) =>
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${statusFilter === status ? 'bg-navy text-white' : 'bg-white border border-surface-300 text-charcoal hover:bg-surface-50'}`}>

              <span className="capitalize">
                {status === 'all' ? 'All Tasks' : status.replace('-', ' ')}
              </span>
              <span
              className={`px-1.5 py-0.5 rounded text-xs ${statusFilter === status ? 'bg-white/20' : 'bg-surface-200'}`}>

                {taskCounts[status]}
              </span>
            </button>
          )}
        </motion.div>

        {/* Tasks List */}
        <motion.div variants={itemVariants} className="space-y-3">
          {loading && (
            <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <p className="text-sm text-charcoal-500">Loading tasks…</p>
            </div>
          )}

          {!loading && filteredTasks.length === 0 && (
            <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <p className="text-sm text-charcoal-500">No tasks found.</p>
            </div>
          )}

          {filteredTasks.map((task) =>
          <div
            key={task.id}
            className="bg-white rounded-xl border border-surface-300 p-4 shadow-card hover:shadow-card-hover transition-all cursor-pointer">

              <div className="flex items-start gap-4">
                <div
                className={`p-2 rounded-lg ${task.status === 'completed' ? 'bg-success-50' : task.status === 'overdue' ? 'bg-critical-50' : 'bg-surface-100'}`}>

                  <ClipboardCheckIcon
                  className={`w-5 h-5 ${task.status === 'completed' ? 'text-success' : task.status === 'overdue' ? 'text-critical' : 'text-charcoal-400'}`} />

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
                    className={`flex items-center gap-1.5 ${priorityColors[task.priority as keyof typeof priorityColors]}`}>

                      <FlagIcon className="w-4 h-4" />
                      <span className="capitalize">{task.priority}</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </Layout>);

}