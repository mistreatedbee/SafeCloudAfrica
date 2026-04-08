import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ClipboardCheckIcon,
  PlusIcon,
  SearchIcon,
  CalendarIcon,
  UserIcon,
  FlagIcon,
  AlertTriangleIcon,
  BarChart3Icon,
  TargetIcon
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { Layout } from '../components/layout/Layout';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useUser } from '@insforge/react';
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import {
  listTasks,
  listTasksWithFilters,
  getTaskMetricsSummary,
  acceptTask,
  startTask,
  markAwaitingEvidence,
  submitForReview,
  approveTask,
  closeTask
} from '../api/services/tasksService';
import type { Task } from '../api/models/entities';
import type { CorrectiveAction } from '../api/services/correctiveActionsService';
import { TaskCreateModal } from '../components/tasks/TaskCreateModal';
import { listCorrectiveActions, closeCorrectiveAction, deleteCorrectiveAction } from '../api/services/correctiveActionsService';
import { toCsv, downloadTextFile } from '../utils/csv';
import { useIdentity } from '../hooks/useIdentity';
import { TASK_CATEGORY_LABELS, TASK_TIME_STATUS_LABELS, TASK_SOURCE_ENTITY_LABELS } from '../api/constants/taskLabels';
import { getMyProfile } from '../api/services/profilesService';

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
  const [taskScope, setTaskScope] = useState<'my' | 'team'>('my');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [refreshKey, setRefreshKey] = useState(0);
  const { user } = useUser();
  const { activeCompanyId, activeRole } = useTenant();
  const { fullName, organisationName } = useIdentity();
  const canCreate = activeRole === 'admin' || activeRole === 'manager' || activeRole === 'supervisor' || activeRole === 'consultant';
  const isNew = location.pathname.endsWith('/new');
  const [createOpen, setCreateOpen] = useState(isNew);
  const view = (params.get('view') || 'tasks') as 'tasks' | 'capa';
  const [taskSubView, setTaskSubView] = useState<'list' | 'gantt' | 'resource' | 'time'>('list');
  const canManageCapa = activeRole === 'admin' || activeRole === 'manager' || activeRole === 'supervisor' || activeRole === 'consultant' || activeRole === 'auditor';

  useEffect(() => {
    setCreateOpen(isNew);
  }, [isNew]);

  const hasFilters = statusFilter !== 'all' || priorityFilter !== 'all' || riskFilter !== 'all' || categoryFilter !== 'all' || searchQuery.trim().length > 0;

  const { data: myProfile } = useAsync(
    async () => {
      if (!activeCompanyId || !user?.id || taskScope !== 'team' || activeRole !== 'supervisor') return null;
      return await getMyProfile(activeCompanyId, user.id);
    },
    [activeCompanyId, user?.id, taskScope, activeRole]
  );

  const { data: tasksData, loading, error } = useAsync<Task[]>(
    async () => {
      if (!activeCompanyId) return [];
      if (hasFilters || taskScope === 'team') {
        return await listTasksWithFilters({
          companyId: activeCompanyId,
          assigneeUserId: taskScope === 'my' && user?.id ? user.id : undefined,
          departmentId: taskScope === 'team' && activeRole === 'supervisor' && (myProfile as any)?.department_id ? (myProfile as any).department_id : undefined,
          status: statusFilter !== 'all' ? (statusFilter as Task['status']) : undefined,
          priority: priorityFilter !== 'all' ? (priorityFilter as Task['priority']) : undefined,
          riskLevel: riskFilter !== 'all' ? (riskFilter as Task['risk_level']) : undefined,
          category: categoryFilter !== 'all' ? (categoryFilter as Task['category']) : undefined,
          search: searchQuery.trim() || undefined,
          limit: 300
        });
      }
      return await listTasks({
        companyId: activeCompanyId,
        assigneeUserId: taskScope === 'my' ? user?.id : undefined,
        limit: 300
      });
    },
    [activeCompanyId, taskScope, user?.id, refreshKey, statusFilter, priorityFilter, riskFilter, categoryFilter, searchQuery, hasFilters, activeRole, myProfile]
  );

  const { data: metrics, loading: metricsLoading } = useAsync(
    async () => (activeCompanyId ? getTaskMetricsSummary({ companyId: activeCompanyId }) : null),
    [activeCompanyId, refreshKey]
  );

  const allTasks = tasksData ?? [];
  const filteredTasks = allTasks.filter((task) => {
    const matchesSearch = !searchQuery.trim() || task.title.toLowerCase().includes(searchQuery.toLowerCase()) || (task.description ?? '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter;
    const matchesRisk = riskFilter === 'all' || task.risk_level === riskFilter;
    const matchesCategory = categoryFilter === 'all' || task.category === categoryFilter;
    return matchesSearch && matchesStatus && matchesPriority && matchesRisk && matchesCategory;
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
    try {
      await closeCorrectiveAction(id as any, activeCompanyId, user.id as any);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Unable to close CAPA.');
    }
  }

  async function onDeleteCapa(id: string) {
    if (!activeCompanyId || !user?.id) return;
    const confirmed = window.confirm('Delete this CAPA? This cannot be undone.');
    if (!confirmed) return;
    try {
      await deleteCorrectiveAction(id as any, activeCompanyId, user.id as any);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Unable to delete CAPA.');
    }
  }

  async function handleAcceptTask(task: Task) {
    if (!activeCompanyId || !user?.id) return;
    await acceptTask({ companyId: activeCompanyId, taskId: task.id, actorUserId: user.id });
    setRefreshKey((k) => k + 1);
  }
  async function handleStartTask(task: Task) {
    if (!activeCompanyId || !user?.id) return;
    await startTask({ companyId: activeCompanyId, taskId: task.id, actorUserId: user.id });
    setRefreshKey((k) => k + 1);
  }
  async function handleMarkAwaitingEvidence(task: Task) {
    if (!activeCompanyId || !user?.id) return;
    await markAwaitingEvidence({ companyId: activeCompanyId, taskId: task.id, actorUserId: user.id });
    setRefreshKey((k) => k + 1);
  }
  async function handleSubmitForReview(task: Task) {
    if (!activeCompanyId || !user?.id) return;
    await submitForReview({ companyId: activeCompanyId, taskId: task.id, actorUserId: user.id });
    setRefreshKey((k) => k + 1);
  }
  async function handleApproveTask(task: Task) {
    if (!activeCompanyId || !user?.id) return;
    await approveTask({ companyId: activeCompanyId, taskId: task.id, actorUserId: user.id });
    setRefreshKey((k) => k + 1);
  }
  async function handleCloseTask(task: Task) {
    if (!activeCompanyId || !user?.id) return;
    try {
      await closeTask({ companyId: activeCompanyId, taskId: task.id, actorUserId: user.id });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Cannot close: missing evidence or approvals.');
    }
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
        description: task.description ?? '',
        module: task.module,
        category: task.category ?? '',
        status: task.status,
        priority: task.priority,
        risk_level: task.risk_level ?? '',
        time_status_indicator: task.time_status_indicator ?? '',
        site_id: task.site_id ?? '',
        site_name_text: task.site_name_text ?? '',
        department_id: task.department_id ?? '',
        department_name_text: task.department_name_text ?? '',
        task_owner_user_id: task.task_owner_user_id ?? '',
        assignee_user_id: task.assignee_user_id ?? '',
        allocated_by_user_id: task.allocated_by_user_id ?? '',
        planned_start_date: task.planned_start_date ?? '',
        planned_completion_date: task.planned_completion_date ?? '',
        due_at: task.due_at ?? '',
        estimated_hours: task.estimated_hours ?? '',
        actual_start_at: task.actual_start_at ?? '',
        actual_completion_at: task.actual_completion_at ?? '',
        time_spent_minutes: task.time_spent_minutes ?? '',
        time_delay_minutes: task.time_delay_minutes ?? '',
        delay_reason: task.delay_reason ?? '',
        source_entity_type: task.source_entity_type ?? '',
        source_entity_id: task.source_entity_id ?? '',
        closure_date: task.closure_date ?? '',
        final_status: task.final_status ?? '',
        lessons_learned: task.lessons_learned ?? '',
        effectiveness_checked: task.effectiveness_checked ?? '',
        effectiveness_notes: task.effectiveness_notes ?? '',
        created_at: task.created_at,
        updated_at: task.updated_at,
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

  function exportCapaClosureReport() {
    const metaLines = [
      `Organisation: ${organisationName}`,
      `Report: CAPA Closure (tasks with category=capa, status closed/approved)`,
      `Generated by: ${fullName}`,
      `Generated at: ${new Date().toISOString()}`,
      '',
    ];
    const today = new Date().toISOString().slice(0, 10);
    const safeOrg = organisationName.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'safecloudafrica';
    const capaTasks = allTasks.filter((t) => t.category === 'capa' && (t.status === 'closed' || t.status === 'approved'));
    if (capaTasks.length === 0) {
      alert('No CAPA tasks with status closed or approved to export.');
      return;
    }
    const rows = capaTasks.map((task) => ({
      task_id: task.id,
      title: task.title,
      category: 'capa',
      status: task.status,
      priority: task.priority,
      risk_level: task.risk_level ?? '',
      assignee_user_id: task.assignee_user_id ?? '',
      planned_start_date: task.planned_start_date ?? '',
      planned_completion_date: task.planned_completion_date ?? '',
      due_at: task.due_at ?? '',
      actual_completion_at: task.actual_completion_at ?? '',
      closure_date: task.closure_date ?? '',
      time_spent_minutes: task.time_spent_minutes ?? '',
      source_entity_type: task.source_entity_type ?? '',
      source_entity_id: task.source_entity_id ?? '',
      effectiveness_checked: task.effectiveness_checked ?? '',
      lessons_learned: task.lessons_learned ?? '',
      created_at: task.created_at,
    }));
    const csvBody = toCsv(rows);
    const content = `${metaLines.join('\r\n')}\r\n${csvBody}`;
    downloadTextFile(`${safeOrg}-capa-closure-${today}.csv`, content, 'text/csv;charset=utf-8');
  }

  return (
    <Layout title="Tasks & Corrective Actions">
      {canCreate && activeCompanyId && user?.id && (
        <TaskCreateModal
          open={createOpen}
          onClose={() => {
            setCreateOpen(false);
            if (isNew) navigate('/dashboard/management/tasks', { replace: true });
          }}
          companyId={activeCompanyId}
          createdByUserId={user.id}
          defaultModule="safety"
          onCreated={() => navigate('/dashboard/management/tasks', { replace: true })}
        />
      )}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-6">

        <motion.div variants={itemVariants} className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate('/dashboard/management/tasks')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${view === 'tasks' ? 'bg-navy text-white' : 'bg-white border border-surface-300 text-charcoal hover:bg-surface-50'}`}
          >
            Tasks
          </button>
          <button
            type="button"
            onClick={() => navigate('/dashboard/management/tasks?view=capa')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${view === 'capa' ? 'bg-navy text-white' : 'bg-white border border-surface-300 text-charcoal hover:bg-surface-50'}`}
          >
            CAPA
          </button>
        </motion.div>

        {view === 'tasks' && (
          <motion.div variants={itemVariants} className="flex flex-wrap gap-2">
            {(['list', 'gantt', 'resource', 'time'] as const).map((sub) => (
              <button
                key={sub}
                type="button"
                onClick={() => setTaskSubView(sub)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize ${taskSubView === sub ? 'bg-teal text-white' : 'bg-white border border-surface-300 text-charcoal hover:bg-surface-50'}`}
              >
                {sub === 'list' ? 'List' : sub === 'gantt' ? 'Project Gantt' : sub === 'resource' ? 'Resource planning' : 'Time analytics'}
              </button>
            ))}
          </motion.div>
        )}

        {view === 'tasks' && metrics && !metricsLoading && (
          <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <p className="text-xs font-medium text-charcoal-500 uppercase tracking-wide">Completion rate</p>
              <p className="text-2xl font-bold text-charcoal mt-1">{Math.round(metrics.taskCompletionRate * 100)}%</p>
            </div>
            <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <p className="text-xs font-medium text-charcoal-500 uppercase tracking-wide">Overdue</p>
              <p className="text-2xl font-bold text-critical mt-1">{metrics.overdueCount}</p>
            </div>
            <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <p className="text-xs font-medium text-charcoal-500 uppercase tracking-wide">High risk open</p>
              <p className="text-2xl font-bold text-warning mt-1">{metrics.highRiskOpenCount}</p>
            </div>
            <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <p className="text-xs font-medium text-charcoal-500 uppercase tracking-wide">CAPA closure</p>
              <p className="text-2xl font-bold text-teal mt-1">{Math.round(metrics.capaClosureRate * 100)}%</p>
            </div>
            <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <p className="text-xs font-medium text-charcoal-500 uppercase tracking-wide">Backlog</p>
              <p className="text-2xl font-bold text-charcoal mt-1">{metrics.taskBacklogCount}</p>
            </div>
            <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <p className="text-xs font-medium text-charcoal-500 uppercase tracking-wide">KPI score</p>
              <p className="text-2xl font-bold text-navy mt-1">{metrics.kpiScore}</p>
            </div>
          </motion.div>
        )}

        {view === 'tasks' && metrics && !metricsLoading && (metrics.overdueCount > 0 || metrics.highRiskOpenCount > 0) && (
          <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <p className="text-sm font-semibold text-charcoal mb-3">Status distribution</p>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Overdue', value: metrics.overdueCount, color: 'var(--color-critical)' },
                        { name: 'High risk open', value: metrics.highRiskOpenCount, color: 'var(--color-warning)' },
                        { name: 'Backlog other', value: Math.max(0, metrics.taskBacklogCount - metrics.overdueCount - metrics.highRiskOpenCount), color: 'var(--color-surface-300)' }
                      ].filter((d) => d.value > 0)}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={60}
                      paddingAngle={2}
                      dataKey="value"
                      nameKey="name"
                    >
                      {(entry: { color: string }) => <Cell fill={entry.color} />}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <p className="text-sm font-semibold text-charcoal mb-3">Department summary</p>
              <div className="h-48 overflow-auto">
                {metrics.byDepartment.slice(0, 5).map((d) => (
                  <div key={String(d.departmentId)} className="flex justify-between text-sm py-1 border-b border-surface-200 last:border-0">
                    <span className="text-charcoal-600">{d.departmentId ? shortId(d.departmentId) : 'Unassigned'}</span>
                    <span className="font-medium">{d.closed}/{d.total} closed, {d.overdue} overdue</span>
                  </div>
                ))}
                {metrics.byDepartment.length === 0 && <p className="text-sm text-charcoal-500">No department data</p>}
              </div>
            </div>
          </motion.div>
        )}

        {/* Header */}
        <motion.div
          variants={itemVariants}
          className="flex flex-col sm:flex-row gap-4 justify-between">

          <div className="flex flex-1 flex-wrap gap-3">
            {view === 'tasks' && (
              <div className="flex rounded-lg border border-surface-300 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setTaskScope('my')}
                  className={`px-3 py-2 text-sm font-medium ${taskScope === 'my' ? 'bg-navy text-white' : 'bg-white text-charcoal hover:bg-surface-50'}`}
                >
                  My Tasks
                </button>
                <button
                  type="button"
                  onClick={() => setTaskScope('team')}
                  className={`px-3 py-2 text-sm font-medium ${taskScope === 'team' ? 'bg-navy text-white' : 'bg-white text-charcoal hover:bg-surface-50'}`}
                >
                  Team Tasks
                </button>
              </div>
            )}
            <div className="relative flex-1 max-w-md min-w-[200px]">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-400" />
              <input
                type="search"
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            {view === 'tasks' && (
              <>
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className="px-3 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:ring-2 focus:ring-teal"
                >
                  <option value="all">All priority</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
                <select
                  value={riskFilter}
                  onChange={(e) => setRiskFilter(e.target.value)}
                  className="px-3 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:ring-2 focus:ring-teal"
                >
                  <option value="all">All risk</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="px-3 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:ring-2 focus:ring-teal max-w-[180px]"
                >
                  <option value="all">All categories</option>
                  {(Object.keys(TASK_CATEGORY_LABELS) as (keyof typeof TASK_CATEGORY_LABELS)[]).map((k) => (
                    <option key={k} value={k}>{TASK_CATEGORY_LABELS[k]}</option>
                  ))}
                </select>
              </>
            )}
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
                onClick={exportCapaClosureReport}
                disabled={!activeCompanyId}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-surface-300 text-charcoal rounded-lg text-sm font-medium hover:bg-surface-50"
              >
                Export CAPA closure
              </button>
            )}
            {view === 'tasks' && (
              <button
                type="button"
                disabled={!canCreate}
                onClick={() => navigate('/dashboard/management/tasks/new')}
                className="flex items-center justify-center gap-2 px-5 py-2.5 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <PlusIcon className="w-4 h-4" />
                Create Task
              </button>
            )}
            {view === 'capa' && (
              <button
                type="button"
                disabled={!canManageCapa}
                onClick={() => navigate('/dashboard/management/capa/new')}
                className="flex items-center justify-center gap-2 px-5 py-2.5 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <PlusIcon className="w-4 h-4" />
                Create CAPA
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

        {/* Tasks: List / Gantt / Resource / Time */}
        <motion.div variants={itemVariants} className="space-y-3">
          {view === 'tasks' && taskSubView === 'gantt' && (() => {
            const projectTasks = filteredTasks.filter((t) => t.category === 'project_task');
            const tasksWithDates = projectTasks
              .map((t) => {
                const start = t.planned_start_date || t.created_at;
                const end = t.due_at || t.planned_completion_date || t.created_at;
                const startMs = start ? new Date(start).getTime() : 0;
                const endMs = end ? new Date(end).getTime() : startMs + 86400000;
                return { task: t, startMs, endMs };
              })
              .filter((x) => x.startMs > 0 || x.endMs > 0);
            const minMs = tasksWithDates.length ? Math.min(...tasksWithDates.map((x) => x.startMs)) : Date.now();
            const maxMs = tasksWithDates.length ? Math.max(...tasksWithDates.map((x) => x.endMs)) : Date.now() + 86400000 * 30;
            const range = maxMs - minMs || 1;
            return (
              <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
                <h3 className="text-sm font-semibold text-charcoal mb-4">Project Gantt (category: project task)</h3>
                {tasksWithDates.length === 0 ? (
                  <p className="text-sm text-charcoal-500">No project tasks with dates.</p>
                ) : (
                  <div className="space-y-3">
                    <div className="overflow-x-auto">
                      <div className="min-w-[600px]">
                        {tasksWithDates.map(({ task, startMs, endMs }) => {
                          const left = ((startMs - minMs) / range) * 100;
                          const width = ((endMs - startMs) / range) * 100;
                          return (
                            <div key={task.id} className="flex items-center gap-3 py-1.5 border-b border-surface-100 last:border-0">
                              <div className="w-48 shrink-0 truncate text-sm text-charcoal" title={task.title}>
                                {task.title.slice(0, 28)}{task.title.length > 28 ? '…' : ''}
                              </div>
                              <div className="flex-1 h-6 bg-surface-100 rounded relative">
                                <div
                                  className="absolute h-full bg-teal rounded"
                                  style={{ left: `${left}%`, width: `${Math.max(width, 2)}%` }}
                                />
                              </div>
                              <span className="text-xs text-charcoal-500 shrink-0">{formatDateZA(task.due_at)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {view === 'tasks' && taskSubView === 'resource' && metrics && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
                <h3 className="text-sm font-semibold text-charcoal mb-3">By department</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={metrics.byDepartment.slice(0, 10).map((d) => ({
                      name: d.departmentId ? shortId(d.departmentId) : 'Unassigned',
                      total: d.total,
                      closed: d.closed,
                      overdue: d.overdue
                    }))} margin={{ top: 8, right: 8, left: 8, bottom: 24 }}>
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="total" fill="var(--color-surface-300)" name="Total" radius={4} />
                      <Bar dataKey="closed" fill="var(--color-success)" name="Closed" radius={4} />
                      <Bar dataKey="overdue" fill="var(--color-critical)" name="Overdue" radius={4} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
                <h3 className="text-sm font-semibold text-charcoal mb-3">By assignee</h3>
                <div className="max-h-64 overflow-auto space-y-2">
                  {metrics.byAssignee.slice(0, 12).map((a) => (
                    <div key={String(a.assigneeUserId)} className="flex justify-between text-sm py-1 border-b border-surface-100 last:border-0">
                      <span className="text-charcoal-600 truncate">{a.assigneeUserId ? shortId(a.assigneeUserId) : 'Unassigned'}</span>
                      <span className="font-medium shrink-0">{a.closed}/{a.total} closed, {a.overdue} overdue</span>
                    </div>
                  ))}
                  {metrics.byAssignee.length === 0 && <p className="text-sm text-charcoal-500">No assignee data.</p>}
                </div>
              </div>
            </div>
          )}

          {view === 'tasks' && taskSubView === 'time' && metrics && (
            <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <h3 className="text-sm font-semibold text-charcoal mb-3">Time analytics</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-3 rounded-lg bg-surface-50">
                  <p className="text-xs font-medium text-charcoal-500">Time utilization (actual / estimated)</p>
                  <p className="text-xl font-bold text-charcoal mt-1">
                    {metrics.timeUtilizationRatio != null ? `${(metrics.timeUtilizationRatio * 100).toFixed(0)}%` : '—'}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-surface-50">
                  <p className="text-xs font-medium text-charcoal-500">Average closure time</p>
                  <p className="text-xl font-bold text-charcoal mt-1">
                    {metrics.averageClosureTimeDays != null ? `${metrics.averageClosureTimeDays.toFixed(1)} days` : '—'}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-surface-50">
                  <p className="text-xs font-medium text-charcoal-500">Completion rate</p>
                  <p className="text-xl font-bold text-charcoal mt-1">{Math.round(metrics.taskCompletionRate * 100)}%</p>
                </div>
              </div>
            </div>
          )}

          {view === 'tasks' && taskSubView === 'list' && loading && (
            <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <p className="text-sm text-charcoal-500">Loading tasks…</p>
            </div>
          )}

          {view === 'tasks' && taskSubView === 'list' && !loading && filteredTasks.length === 0 && (
            <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <p className="text-sm text-charcoal-500">No tasks found.</p>
            </div>
          )}

          {view === 'tasks' && taskSubView === 'list' &&
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
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => navigate(`/tasks/${task.id}`)}
                          className="text-left font-medium text-charcoal hover:text-teal hover:underline truncate block"
                        >
                          {task.title}
                        </button>
                        <p className="text-sm text-charcoal-400 mt-0.5">
                          TSK-{shortId(task.id)} • {task.category ? TASK_CATEGORY_LABELS[task.category as keyof typeof TASK_CATEGORY_LABELS] : task.module}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <StatusBadge status={task.status as any} size="sm" />
                      </div>
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
                      {task.risk_level && (
                        <span
                          className={`flex items-center gap-1.5 ${
                            task.risk_level === 'critical' ? 'text-critical' : task.risk_level === 'high' ? 'text-warning' : 'text-charcoal-500'
                          }`}
                        >
                          <AlertTriangleIcon className="w-4 h-4" />
                          <span className="capitalize">{task.risk_level}</span>
                        </span>
                      )}
                      {task.time_status_indicator && (
                        <span className="rounded px-1.5 py-0.5 text-xs bg-surface-100 text-charcoal-600">
                          {TASK_TIME_STATUS_LABELS[task.time_status_indicator] ?? task.time_status_indicator}
                        </span>
                      )}
                      {task.source_entity_type && (
                        <span className="rounded px-1.5 py-0.5 text-xs bg-teal-50 text-teal-700">
                          {TASK_SOURCE_ENTITY_LABELS[task.source_entity_type] ?? task.source_entity_type}
                        </span>
                      )}
                    </div>
                    {activeCompanyId && user?.id && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {task.status === 'assigned' && task.assignee_user_id === user.id && (
                          <button
                            type="button"
                            onClick={() => handleAcceptTask(task)}
                            className="px-3 py-1.5 rounded-lg bg-teal text-white text-xs font-medium hover:bg-teal-600"
                          >
                            Accept task
                          </button>
                        )}
                        {['accepted', 'reopened'].includes(task.status) && (
                          <button
                            type="button"
                            onClick={() => handleStartTask(task)}
                            className="px-3 py-1.5 rounded-lg bg-surface-100 text-xs font-medium text-charcoal hover:bg-surface-200"
                          >
                            Mark in progress
                          </button>
                        )}
                        {task.status === 'in-progress' && (
                          <button
                            type="button"
                            onClick={() => handleMarkAwaitingEvidence(task)}
                            className="px-3 py-1.5 rounded-lg bg-surface-100 text-xs font-medium text-charcoal hover:bg-surface-200"
                          >
                            Awaiting evidence
                          </button>
                        )}
                        {task.status === 'awaiting-evidence' && (
                          <button
                            type="button"
                            onClick={() => handleSubmitForReview(task)}
                            className="px-3 py-1.5 rounded-lg bg-surface-100 text-xs font-medium text-charcoal hover:bg-surface-200"
                          >
                            Send for review
                          </button>
                        )}
                        {task.status === 'under-review' && (
                          <button
                            type="button"
                            onClick={() => handleApproveTask(task)}
                            className="px-3 py-1.5 rounded-lg bg-surface-100 text-xs font-medium text-charcoal hover:bg-surface-200"
                          >
                            Approve
                          </button>
                        )}
                        {task.status === 'approved' && (
                          <button
                            type="button"
                            onClick={() => handleCloseTask(task)}
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
                  <button
                    type="button"
                    onClick={() => navigate(`/dashboard/management/capa/${capa.id}`)}
                    className="font-medium text-charcoal hover:text-teal hover:underline text-left"
                  >
                    {capa.title}
                  </button>
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
                  <button
                    type="button"
                    disabled={!canManageCapa || !activeCompanyId || !user?.id}
                    onClick={() => onDeleteCapa(capa.id)}
                    className="px-3 py-1.5 rounded-lg border border-critical/30 text-critical text-xs font-semibold hover:bg-critical/5 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </Layout>);

}
