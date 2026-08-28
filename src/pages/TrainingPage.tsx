import React, { useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toUserFacingError } from '../utils/userFacingMessage';
import { drawPdfCoverWithLogo } from '../api/services/reportExportService';
import { useIdentity } from '../hooks/useIdentity';
import { insforge } from '../api/insforge/client';
import { motion } from 'framer-motion';
import {
  GraduationCapIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  UsersIcon,
  BarChart3Icon,
  UserIcon
} from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { useTenant } from '../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../api/hooks/useAsync';
import {
  cancelTrainingRecord,
  countExpiringTraining,
  deleteTrainingRecord,
  listExpiringSoonTraining,
  listTrainingCourses,
  listTrainingRecords,
  listTrainingProviders
} from '../api/services/trainingService';
import type { TrainingCourse, TrainingRecord, TrainingRecordStatus } from '../api/models/entities';
import { TrainingAddModal } from '../components/training/TrainingAddModal';
import { TrainingScheduleModal } from '../components/training/TrainingScheduleModal';
import { TrainingCompleteModal } from '../components/training/TrainingCompleteModal';
import { TrainingMatrixSetupTab } from '../components/training/TrainingMatrixSetupTab';
import { TrainingReportsTab } from '../components/training/TrainingReportsTab';
import { listCompanyMemberships } from '../api/services/tenantService';
import { listUserProfiles } from '../api/services/profilesService';
import { listHrEmployees, getHrEmployeeByUserId, findHrEmployeeByEmail, linkHrEmployeeToUser, type HrEmployee } from '../api/services/hrService';
import type { CompanyMembership } from '../api/models/entities';
import { downloadBlob, downloadDocumentFile, openBlobInNewTab } from '../api/services/documentsStorageService';
import { downloadStyledExcelWorkbook, type ExcelSheetSpec } from '../api/services/excelExportService';
import { HrEmployeeSelect } from '../components/ui/HrEmployeeSelect';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { useToast } from '../components/ui/ToastProvider';
import { Link } from 'react-router-dom';

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
type TrainingTab = 'matrix' | 'employees' | 'reports' | 'my';

export function TrainingPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TrainingTab>('employees');
  const { user } = useUser();
  const { activeCompanyId, activeRole, activeCompany } = useTenant();
  const { fullName, organisationName } = useIdentity();
  const canManage =
    activeRole === 'owner' ||
    activeRole === 'admin' ||
    activeRole === 'manager' ||
    activeRole === 'supervisor' ||
    activeRole === 'consultant';
  const canManageMatrix = activeRole === 'owner' || activeRole === 'admin' || activeRole === 'manager';
  const isEmployee = activeRole === 'employee';
  const canAddTraining = Boolean(activeCompanyId && user?.id && (canManage || activeRole === 'employee'));

  const [addOpen, setAddOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TrainingRecordStatus | ''>('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [scheduleRecord, setScheduleRecord] = useState<TrainingRecord | null>(null);
  const [completeRecord, setCompleteRecord] = useState<TrainingRecord | null>(null);
  const [recordsRefresh, setRecordsRefresh] = useState(0);
  const [actionLoadingRecordId, setActionLoadingRecordId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const { data: courses } = useAsync<TrainingCourse[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listTrainingCourses(activeCompanyId);
    },
    [activeCompanyId]
  );

  const { data: records } = useAsync<TrainingRecord[]>(
    async () => {
      if (!activeCompanyId) return [];
      const userId = activeRole === 'employee' ? (user?.id ?? undefined) : undefined;
      const employeeId = activeRole === 'employee' ? undefined : selectedEmployeeId ? selectedEmployeeId : undefined;
      const status = statusFilter || undefined;
      return await listTrainingRecords(activeCompanyId, {
        userId,
        employeeId: employeeId as any,
        status: status ? [status] : undefined,
        limit: 1000
      });
    },
    [activeCompanyId, activeRole, user?.id, selectedEmployeeId, statusFilter, recordsRefresh]
  );

  const { data: profiles } = useAsync(
    async () => (activeCompanyId ? listUserProfiles(activeCompanyId) : []),
    [activeCompanyId]
  );
  const { data: employees } = useAsync<HrEmployee[]>(
    async () => (activeCompanyId ? listHrEmployees(activeCompanyId) : []),
    [activeCompanyId]
  );
  const employeeById = useMemo(() => new Map((employees ?? []).map((e) => [e.id, e])), [employees]);
  const employeeName = (e: HrEmployee) => `${e.last_name ?? ''}, ${e.first_name ?? ''}`.replace(/^,\s*|,\s*$/g, '').trim() || e.email || e.employee_no;
  // Not gated on canManage -- provider names are reference data every user needs to read
  // their own training (e.g. "My Training" shows the provider for each course).
  const { data: providers } = useAsync(
    async () => (activeCompanyId ? listTrainingProviders(activeCompanyId) : []),
    [activeCompanyId]
  );
  const providerById = useMemo(() => new Map((providers ?? []).map((p) => [p.id, p])), [providers]);
  const profileByUserId = useMemo(() => new Map((profiles ?? []).map((p) => [p.user_id, p])), [profiles]);

  // "My Training" needs the current user's own hr_employees row -- training_records is
  // keyed primarily by employee_id now (most employees have no platform login at all, see
  // training_records_hr_employee_link_2026_08_20.sql), so filtering by user_id alone (the
  // previous behaviour) silently returned nothing for almost every real employee.
  //
  // Two-tier resolution:
  //   Tier 1: hr_employees.user_id = this user's id (the normal, already-linked case).
  //   Tier 2: no linked row found -- try an email match against unlinked hr_employees rows.
  //     Exactly one match is auto-linked silently (a toast confirms it) so the user never
  //     has to go find an admin for what's an unambiguous match; more than one match is left
  //     for an admin to resolve deliberately rather than guessing.
  // Manual linking (the "Link my account now" flow below) bumps linkVersion to force this to
  // refetch and pick up the row it just linked.
  const [linkVersion, setLinkVersion] = useState(0);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const { showSuccess } = useToast();
  const { data: myEmployee } = useAsync<HrEmployee | null>(
    async () => {
      if (!activeCompanyId || !user?.id) return null;
      const tier1 = await getHrEmployeeByUserId(activeCompanyId, user.id as any).catch(() => null);
      if (tier1) return tier1;
      if (!user.email) return null;
      const candidates = await findHrEmployeeByEmail(activeCompanyId, user.email).catch(() => []);
      if (candidates.length !== 1) return null;
      try {
        const linked = await linkHrEmployeeToUser(activeCompanyId, candidates[0].id, user.id as any);
        showSuccess(`We linked your account to ${employeeName(linked)}'s profile.`);
        return linked;
      } catch {
        return null;
      }
    },
    [activeCompanyId, user?.id, user?.email, linkVersion]
  );

  const { data: myRecords, loading: myRecordsLoading } = useAsync<TrainingRecord[]>(
    async () => {
      if (!activeCompanyId || !user?.id) return [];
      // Tier 3: some older records were linked by raw user_id rather than via an HR
      // employee row at all (e.g. training assigned directly to a platform login before
      // employee_id linking existed). Always check this alongside the employee-linked set
      // and de-duplicate by id, rather than only falling back to it when no employee is
      // resolved -- an employee CAN be linked today while older stray user_id-linked
      // records from before that link existed still exist and would otherwise be missed.
      const [byEmployee, byUser] = await Promise.all([
        myEmployee?.id ? listTrainingRecords(activeCompanyId, { employeeId: myEmployee.id, limit: 500 }) : Promise.resolve([]),
        listTrainingRecords(activeCompanyId, { userId: user.id as any, limit: 500 })
      ]);
      const byId = new Map<string, TrainingRecord>();
      for (const r of [...byEmployee, ...byUser]) byId.set(r.id, r);
      return Array.from(byId.values());
    },
    [activeCompanyId, user?.id, myEmployee?.id, recordsRefresh]
  );

  const { data: myExpiringSoon } = useAsync<TrainingRecord[]>(
    async () => {
      if (!activeCompanyId || !user?.id) return [];
      return await listExpiringSoonTraining(activeCompanyId, 60, {
        employeeId: myEmployee?.id as any,
        userId: myEmployee?.id ? undefined : (user.id as any)
      });
    },
    [activeCompanyId, user?.id, myEmployee?.id, recordsRefresh]
  );

  const { data: memberships } = useAsync<CompanyMembership[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listCompanyMemberships(activeCompanyId);
    },
    [activeCompanyId]
  );

  const { data: expiringSoon } = useAsync<number>(
    async () => {
      if (!activeCompanyId) return 0;
      return await countExpiringTraining(activeCompanyId, 30);
    },
    [activeCompanyId]
  );

  const now = Date.now();
  const all = records ?? [];
  const outstanding = all.filter((r) => r.status === 'REQUIRED' || r.status === 'OVERDUE' || r.status === 'SCHEDULED').length;
  const expired = all.filter((r) => {
    if (r.status === 'EXPIRED' || r.status === 'OVERDUE') return true;
    return Boolean(r.expires_at && new Date(r.expires_at).getTime() < now);
  }).length;
  const nonCompliant = new Set(
    all
      .filter((r) => {
        if (r.status === 'REQUIRED' || r.status === 'OVERDUE' || r.status === 'SCHEDULED' || r.status === 'EXPIRED') return true;
        return Boolean(r.expires_at && new Date(r.expires_at).getTime() < now);
      })
      .map((r) => r.id)
  ).size;
  const compliance = all.length > 0 ? Math.round(((all.length - nonCompliant) / all.length) * 100) : 0;

  const courseById = useMemo(() => new Map((courses ?? []).map((c) => [c.id, c])), [courses]);

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = all.map((r) => ({
      ...r,
      courseName: courseById.get(r.course_id)?.name ?? `Course ${String(r.course_id).slice(0, 8)}`
    }));
    if (!q) return list;
    return list.filter((r) => {
      const emp = r.employee_id ? employeeById.get(r.employee_id) : null;
      const empName = emp ? employeeName(emp).toLowerCase() : '';
      return (
        r.courseName.toLowerCase().includes(q) ||
        empName.includes(q) ||
        (emp?.employee_no ?? '').toLowerCase().includes(q) ||
        String(r.user_id ?? '').includes(q)
      );
    });
  }, [all, courseById, employeeById, searchQuery]);

  // Grouped by HR employee job title (falling back to platform-user role for any
  // legacy record that's only ever been linked via user_id, and "Unassigned" when
  // neither resolves) rather than purely by company_memberships role, since most real
  // trainees are HR employees with no platform login/membership row at all.
  const matrix = useMemo(() => {
    const nowMs = Date.now();
    type GroupAgg = { members: Set<string>; total: number; expired: number; expiring: number };
    const byGroup = new Map<string, GroupAgg>();

    const groupLabelForRecord = (r: TrainingRecord): string => {
      const emp = r.employee_id ? employeeById.get(r.employee_id) : null;
      if (emp) return emp.job_title?.trim() || 'No job title';
      if (r.user_id) {
        const role = (memberships ?? []).find((m) => m.user_id === r.user_id)?.role;
        if (role) return `Role: ${role}`;
      }
      return 'Unassigned';
    };

    for (const r of all) {
      const label = groupLabelForRecord(r);
      const agg = byGroup.get(label) ?? { members: new Set<string>(), total: 0, expired: 0, expiring: 0 };
      agg.members.add(String(r.employee_id ?? r.user_id ?? r.id));
      agg.total += 1;
      if (r.expires_at) {
        const t = new Date(r.expires_at).getTime();
        if (Number.isFinite(t)) {
          if (t < nowMs) agg.expired += 1;
          else if (t < nowMs + 1000 * 60 * 60 * 24 * 30) agg.expiring += 1;
        }
      }
      byGroup.set(label, agg);
    }

    const rows = Array.from(byGroup.entries()).map(([role, agg]) => {
      const valid = agg.total - agg.expired;
      const compliancePct = agg.total === 0 ? 0 : Math.round((valid / agg.total) * 100);
      return { role, users: agg.members.size, total: agg.total, expired: agg.expired, expiring: agg.expiring, compliancePct };
    });
    rows.sort((a, b) => b.users - a.users);
    return rows;
  }, [all, employeeById, memberships]);

  const allTabs: { id: TrainingTab; label: string; icon: React.ComponentType<any>; show: boolean }[] = [
    { id: 'matrix', label: 'Matrix Setup', icon: SettingsIcon, show: canManageMatrix },
    { id: 'employees', label: 'Employee Training', icon: UsersIcon, show: canManage },
    { id: 'reports', label: 'Reports & Costs', icon: BarChart3Icon, show: canManageMatrix },
    { id: 'my', label: 'My Training', icon: UserIcon, show: true }
  ];
  const tabs = allTabs.filter((t) => t.show);

  const effectiveTab = isEmployee ? 'my' : activeTab;
  const setEffectiveTab = (t: TrainingTab) => setActiveTab(t);

  return (
    <Layout title="Training & Competency">
      {activeCompanyId && user?.id && (
        <TrainingAddModal
          open={addOpen}
          onClose={() => setAddOpen(false)}
          companyId={activeCompanyId}
          createdByUserId={user.id}
          defaultUserId={activeRole === 'employee' ? user.id : undefined}
          courses={courses ?? []}
          onAdded={() => {
            setRecordsRefresh((r) => r + 1);
            setActionError(null);
            setActionSuccess('Saved successfully.');
            setAddOpen(false);
          }}
        />
      )}
      <div className="flex flex-wrap gap-2 border-b border-surface-200 mb-4">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setEffectiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium border-b-2 -mb-px transition-colors ${
              effectiveTab === t.id
                ? 'border-teal text-teal bg-white'
                : 'border-transparent text-charcoal-500 hover:text-charcoal hover:bg-surface-50'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {effectiveTab === 'matrix' && canManageMatrix && activeCompanyId && user?.id && (
        <TrainingMatrixSetupTab companyId={activeCompanyId} createdByUserId={user.id} />
      )}

      {effectiveTab === 'employees' && (
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-6">

        {/* Stats */}
        <motion.div
          variants={itemVariants}
          className="grid grid-cols-2 md:grid-cols-4 gap-4">

          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Overall Compliance</p>
            <p className="text-2xl font-bold text-success mt-1">{compliance}%</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Outstanding</p>
            <p className="text-2xl font-bold text-warning mt-1">{outstanding}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Expired</p>
            <p className="text-2xl font-bold text-critical mt-1">{expired}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Expiring Soon</p>
            <p className="text-2xl font-bold text-teal mt-1">{expiringSoon ?? 0}</p>
          </div>
        </motion.div>

        {/* Training Matrix */}
        <motion.div variants={itemVariants}>
          <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
              <h3 className="font-semibold text-charcoal flex items-center gap-2">
                <GraduationCapIcon className="w-5 h-5 text-teal" />
                Training Compliance by Job Title
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface-50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Job Title</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Users</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Records</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Expiring</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Expired</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Compliance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {matrix.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-4 text-sm text-charcoal-500">
                        No workforce data yet.
                      </td>
                    </tr>
                  )}
                  {matrix.map((r) => (
                    <tr key={r.role} className="hover:bg-surface-50 transition-colors">
                      <td className="px-5 py-4 text-sm font-medium text-charcoal">{r.role}</td>
                      <td className="px-5 py-4 text-sm text-charcoal-500">{r.users}</td>
                      <td className="px-5 py-4 text-sm text-charcoal-500">{r.total}</td>
                      <td className="px-5 py-4 text-sm text-warning">{r.expiring}</td>
                      <td className="px-5 py-4 text-sm text-critical">{r.expired}</td>
                      <td className="px-5 py-4 text-sm text-charcoal-500">{r.compliancePct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>

        {/* Training Records */}
        <motion.div variants={itemVariants}>
          {scheduleRecord && (
            <TrainingScheduleModal
              open={!!scheduleRecord}
              onClose={() => setScheduleRecord(null)}
              companyId={activeCompanyId!}
              record={scheduleRecord}
              providers={providers ?? []}
              onSaved={() => {
                setRecordsRefresh((r) => r + 1);
                setActionError(null);
                setActionSuccess('Saved successfully.');
              }}
            />
          )}
          {completeRecord && (
            <TrainingCompleteModal
              open={!!completeRecord}
              onClose={() => setCompleteRecord(null)}
              companyId={activeCompanyId!}
              record={completeRecord}
              course={courseById.get(completeRecord.course_id) ?? null}
              onSaved={() => {
                setRecordsRefresh((r) => r + 1);
                setActionError(null);
                setActionSuccess('Saved successfully.');
              }}
            />
          )}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-lg font-semibold text-charcoal">
              Training Records
            </h2>
            <button
              type="button"
              disabled={!canAddTraining}
              onClick={() => {
                setActionError(null);
                setActionSuccess(null);
                setAddOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <PlusIcon className="w-4 h-4" />
              Add Training
            </button>
          </div>
          {!canAddTraining && (
            <div className="mb-4 bg-warning/10 border border-warning/30 rounded-lg p-3">
              <p className="text-sm text-warning">
                You do not currently have permission to add training records in this workspace.
              </p>
            </div>
          )}
          {actionError && (
            <div className="mb-4 bg-critical/5 border border-critical/20 rounded-lg p-3">
              <p className="text-sm text-critical">{actionError}</p>
            </div>
          )}
          {actionSuccess && (
            <div className="mb-4 bg-success/10 border border-success/30 rounded-lg p-3">
              <p className="text-sm text-success">{actionSuccess}</p>
            </div>
          )}
          {canManage && (
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-charcoal-500 mb-1">Employee</label>
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  className="px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal min-w-[180px]"
                >
                  <option value="">All employees</option>
                  {(employees ?? []).map((e) => (
                    <option key={e.id} value={e.id}>
                      {employeeName(e)} — {e.employee_no}
                    </option>
                  ))}
                </select>
              </div>
              <div>
              <label className="block text-xs font-medium text-charcoal-500 mb-1">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as TrainingRecordStatus | '')}
                  className="px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                >
                  <option value="">All</option>
                  <option value="REQUIRED">Required</option>
                  <option value="SCHEDULED">Scheduled</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="OVERDUE">Overdue</option>
                  <option value="EXPIRED">Expired</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
            </div>
          )}
          <div className="relative mb-4 max-w-md">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-400" />
            <input
              type="search"
              placeholder="Search training records..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>
          <div className="space-y-3">
            {filteredRecords.length === 0 && (
              <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
                <p className="text-sm text-charcoal-500">No training records yet.</p>
              </div>
            )}
            {filteredRecords.map((r: TrainingRecord & { courseName?: string }) => {
              const statusBadge =
                r.status === 'COMPLETED'
                  ? 'bg-success/15 text-success'
                  : r.status === 'EXPIRED' || r.status === 'OVERDUE'
                    ? 'bg-critical/15 text-critical'
                    : r.status === 'SCHEDULED'
                      ? 'bg-warning/15 text-warning'
                : r.status === 'CANCELLED'
                  ? 'bg-surface-200 text-charcoal-400 line-through'
                      : 'bg-surface-200 text-charcoal-600';
              const canSchedule = canManage && (r.status === 'REQUIRED' || r.status === 'OVERDUE');
              const canComplete =
                canManage && (r.status === 'REQUIRED' || r.status === 'SCHEDULED' || r.status === 'OVERDUE');
              const canCancel =
                canManage && (r.status === 'REQUIRED' || r.status === 'SCHEDULED' || r.status === 'OVERDUE');
              const canDelete = canManage;
              const actionIsLoading = actionLoadingRecordId === r.id;
              const linkedEmployee = r.employee_id ? employeeById.get(r.employee_id) : null;
              const linkedProfile = r.user_id ? profileByUserId.get(r.user_id) : null;
              const userName =
                (linkedEmployee && employeeName(linkedEmployee)) ||
                (linkedProfile && (linkedProfile.full_name || linkedProfile.email)) ||
                (r.user_id ? String(r.user_id).slice(0, 8) : 'Unknown employee');
              const uploaderProfile = profileByUserId.get(r.created_by_user_id);
              const uploaderName =
                uploaderProfile?.full_name || uploaderProfile?.email || String(r.created_by_user_id).slice(0, 8);
              const uploadDateSource = r.updated_at || r.completed_at || r.created_at;
              return (
                <div key={r.id} className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-charcoal">{r.courseName}</p>
                      {canManage && (
                        <p className="text-xs mt-1">
                          {linkedEmployee ? (
                            <Link to={`/dashboard/hr/employees/${linkedEmployee.id}`} className="text-teal hover:underline">
                              {employeeName(linkedEmployee)} — {linkedEmployee.employee_no}
                            </Link>
                          ) : r.user_id ? (
                            <span className="text-warning">⚠ {userName} — not linked to HR profile</span>
                          ) : (
                            <span className="text-critical font-medium">Unknown employee</span>
                          )}
                        </p>
                      )}
                      <p className="text-sm text-charcoal-500 mt-1">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusBadge}`}>
                          {r.status}
                        </span>
                        {r.completed_at ? ` • Completed: ${new Date(r.completed_at).toLocaleDateString('en-ZA')}` : ''}
                        {r.arranged_at ? ` • Arranged: ${new Date(r.arranged_at).toLocaleDateString('en-ZA')}` : ''}
                        {r.expires_at ? ` • Expires: ${new Date(r.expires_at).toLocaleDateString('en-ZA')}` : ''}
                        {r.cost != null ? ` • Cost: ZAR ${Number(r.cost).toLocaleString()}` : ''}
                      </p>
                      {r.certificate_bucket && r.certificate_key && (
                        <p className="text-xs text-charcoal-500 mt-1">
                          Certificate: {r.certificate_key.split('/').pop() ?? 'certificate'}
                          {uploadDateSource
                            ? ` • Uploaded: ${new Date(uploadDateSource).toLocaleDateString('en-ZA')}`
                            : ''}
                          {uploaderName ? ` • Uploaded by: ${uploaderName}` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {canSchedule && (
                      <button
                        type="button"
                        onClick={() => setScheduleRecord(r)}
                        className="px-3 py-2 rounded-lg border border-teal text-teal text-sm font-medium hover:bg-teal/10"
                      >
                        Schedule
                      </button>
                    )}
                    {canComplete && (
                      <button
                        type="button"
                        onClick={() => setCompleteRecord(r)}
                        className="px-3 py-2 rounded-lg bg-teal text-white text-sm font-medium hover:bg-teal-600"
                      >
                        Mark completed
                      </button>
                    )}
                    {r.certificate_bucket && r.certificate_key && (
                      <>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const blob = await downloadDocumentFile({
                                bucket: r.certificate_bucket!,
                                key: r.certificate_key!
                              });
                              openBlobInNewTab(blob);
                            } catch (err) {
                              setActionError(toUserFacingError(err, 'Could not open certificate. Please try again or contact support.'));
                            }
                          }}
                          className="px-3 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50"
                        >
                          Open certificate
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const blob = await downloadDocumentFile({
                                bucket: r.certificate_bucket!,
                                key: r.certificate_key!
                              });
                              downloadBlob(blob, r.certificate_key!.split('/').pop() ?? 'certificate');
                            } catch (err) {
                              setActionError(toUserFacingError(err, 'Could not download certificate. Please try again or contact support.'));
                            }
                          }}
                          className="px-3 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50"
                        >
                          Download
                        </button>
                      </>
                    )}
                    {canCancel && (
                      <button
                        type="button"
                        disabled={actionIsLoading}
                        onClick={async () => {
                          // eslint-disable-next-line no-alert
                          const confirmed = window.confirm(
                            'Are you sure you want to cancel this training record? It will be marked as cancelled but kept for history.'
                          );
                          if (!confirmed) return;
                          try {
                            setActionLoadingRecordId(r.id);
                            setActionError(null);
                            setActionSuccess(null);
                            await cancelTrainingRecord({ companyId: activeCompanyId!, recordId: r.id });
                            setRecordsRefresh((prev) => prev + 1);
                            setActionSuccess('Saved successfully.');
                          } catch (err) {
                            setActionError(toUserFacingError(err, 'Could not cancel training record. Please try again or contact support.'));
                          } finally {
                            setActionLoadingRecordId(null);
                          }
                        }}
                        className="px-3 py-2 rounded-lg border border-critical/40 text-critical text-sm font-medium hover:bg-critical/5 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {actionIsLoading ? 'Cancelling...' : 'Cancel record'}
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        disabled={actionIsLoading}
                        onClick={async () => {
                          const confirmed = window.confirm(
                            'Delete this training record permanently? This cannot be undone.'
                          );
                          if (!confirmed || !activeCompanyId || !user?.id) return;
                          try {
                            setActionLoadingRecordId(r.id);
                            setActionError(null);
                            setActionSuccess(null);
                            await deleteTrainingRecord({
                              companyId: activeCompanyId,
                              recordId: r.id,
                              actorUserId: user.id
                            });
                            setRecordsRefresh((prev) => prev + 1);
                            setActionSuccess('Saved successfully.');
                          } catch (err) {
                            setActionError(toUserFacingError(err, 'Could not delete training record. Please try again or contact support.'));
                          } finally {
                            setActionLoadingRecordId(null);
                          }
                        }}
                        className="px-3 py-2 rounded-lg border border-critical/40 text-critical text-sm font-medium hover:bg-critical/5 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {actionIsLoading ? 'Deleting...' : 'Delete record'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      </motion.div>
      )}

      {effectiveTab === 'reports' && canManageMatrix && activeCompanyId && (
        <TrainingReportsTab companyId={activeCompanyId} />
      )}

      {effectiveTab === 'my' && (() => {
        const myWithCourse = (myRecords ?? []).map((r) => ({
          ...r,
          courseName: courseById.get(r.course_id)?.name ?? `Course ${String(r.course_id).slice(0, 8)}`,
          providerName: r.provider_id ? providerById.get(r.provider_id)?.name ?? null : null
        }));
        const myFiltered = searchQuery.trim()
          ? myWithCourse.filter((r) => r.courseName.toLowerCase().includes(searchQuery.trim().toLowerCase()))
          : myWithCourse;
        const myName = myEmployee ? employeeName(myEmployee) : (fullName || 'Me');

        function myTrainingBadge(r: TrainingRecord) {
          const now = Date.now();
          if (r.expires_at) {
            const expiresMs = new Date(r.expires_at).getTime();
            if (expiresMs < now) {
              const daysAgo = Math.floor((now - expiresMs) / (1000 * 60 * 60 * 24));
              return { label: `Expired ${daysAgo} day${daysAgo === 1 ? '' : 's'} ago`, cls: 'bg-critical/15 text-critical' };
            }
            if (expiresMs <= now + 60 * 24 * 60 * 60 * 1000) {
              const daysLeft = Math.ceil((expiresMs - now) / (1000 * 60 * 60 * 24));
              return { label: `Expiring soon (${daysLeft}d)`, cls: 'bg-warning/15 text-warning' };
            }
          }
          if (r.status === 'COMPLETED') return { label: 'Completed', cls: 'bg-success/15 text-success' };
          return { label: r.status, cls: 'bg-surface-100 text-charcoal-600' };
        }

        // Short, fixed-vocabulary status text for the PDF/Excel exports (Completed /
        // Expiring soon / Expired / In progress) -- distinct from myTrainingBadge()'s
        // richer on-screen label (which includes day counts), per the export spec.
        function exportStatusLabel(r: TrainingRecord): string {
          const now = Date.now();
          if (r.expires_at) {
            const expiresMs = new Date(r.expires_at).getTime();
            if (expiresMs < now) return 'Expired';
            if (expiresMs <= now + 60 * 24 * 60 * 60 * 1000) return 'Expiring soon';
          }
          if (r.status === 'COMPLETED') return 'Completed';
          return 'In progress';
        }

        const totalTrainingCost = myWithCourse.reduce((sum, r) => sum + (r.cost != null ? Number(r.cost) : 0), 0);
        const completedCount = myWithCourse.filter((r) => exportStatusLabel(r) === 'Completed').length;

        function buildMyTrainingExportRows(): Array<[string, string, string, string, number | string, string]> {
          return myWithCourse.map((r) => [
            r.courseName,
            r.providerName ?? '-',
            r.completed_at ? new Date(r.completed_at).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '-',
            r.expires_at ? new Date(r.expires_at).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : 'No expiry',
            r.cost != null ? Number(r.cost) : '-',
            exportStatusLabel(r)
          ]);
        }

        async function exportMyTrainingExcel() {
          const generatedAt = new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
          const sheet: ExcelSheetSpec = {
            name: 'My Training',
            titleLines: [`${organisationName} — Training Record`, `Employee: ${myName}`, `Generated: ${generatedAt} by ${fullName}`],
            columns: [
              { header: 'Course', width: 30 },
              { header: 'Provider', width: 22 },
              { header: 'Completed Date', width: 16 },
              { header: 'Expiry Date', width: 16 },
              { header: 'Cost (ZAR)', width: 14, numberFormat: '#,##0.00' },
              { header: 'Status', width: 16 }
            ],
            rows: buildMyTrainingExportRows(),
            totalsRow: ['TOTAL', '', '', `${completedCount} of ${myWithCourse.length} completed`, totalTrainingCost, '']
          };
          const safeName = myName.replace(/[^a-z0-9]+/gi, '_');
          await downloadStyledExcelWorkbook([sheet], `SCA_TrainingRecord_${safeName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
        }

        async function downloadMyTrainingPdf() {
          const logoMeta = (activeCompany?.metadata ?? {}) as Record<string, unknown>;
          const logoBucket = logoMeta.logo_bucket as string | undefined;
          const logoKey = logoMeta.logo_key as string | undefined;
          let logoUrl: string | null = null;
          if (logoBucket && logoKey) {
            try {
              logoUrl = insforge.storage.from(logoBucket).getPublicUrl(logoKey);
            } catch {
              logoUrl = null;
            }
          }
          const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
          const y = await drawPdfCoverWithLogo(doc, {
            title: 'Training Record',
            subtitle: myName,
            companyName: organisationName,
            generatedBy: fullName,
            logoUrl
          });
          function formatZarPdf(n: number): string {
            const [intPart, dec] = n.toFixed(2).split('.');
            return `${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${dec}`;
          }
          autoTable(doc, {
            startY: y,
            head: [['Course', 'Provider', 'Completed Date', 'Expiry Date', 'Cost (ZAR)', 'Status']],
            body: myWithCourse.length > 0
              ? myWithCourse.map((r) => [
                  r.courseName,
                  r.providerName ?? '-',
                  r.completed_at ? new Date(r.completed_at).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
                  r.expires_at ? new Date(r.expires_at).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : 'No expiry',
                  r.cost != null ? formatZarPdf(Number(r.cost)) : '—',
                  exportStatusLabel(r)
                ])
              : [['No training records', '', '', '', '', '']],
            foot: myWithCourse.length > 0
              ? [[
                  { content: `Total training cost: ZAR ${formatZarPdf(totalTrainingCost)}`, colSpan: 3 },
                  { content: `Total courses: ${myWithCourse.length}`, colSpan: 1 },
                  { content: `Compliance: ${completedCount} of ${myWithCourse.length} required courses completed`, colSpan: 2 }
                ]]
              : undefined,
            footStyles: { fillColor: [225, 245, 238], textColor: [30, 41, 59], fontStyle: 'bold' },
            styles: { fontSize: 8, cellPadding: 5 },
            headStyles: { fillColor: [11, 158, 117], textColor: 255 },
            alternateRowStyles: { fillColor: [248, 250, 252] }
          });
          const safeName = myName.replace(/[^a-z0-9]+/gi, '_');
          doc.save(`SCA_MyTraining_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`);
        }

        return (
          <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-lg font-semibold text-charcoal">My Training</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void downloadMyTrainingPdf()}
                  className="px-3 py-2 rounded-lg border border-teal text-teal text-sm font-medium hover:bg-teal-50"
                >
                  Download my training record
                </button>
                <button
                  type="button"
                  onClick={() => void exportMyTrainingExcel()}
                  className="px-3 py-2 rounded-lg border border-teal text-teal text-sm font-medium hover:bg-teal-50"
                >
                  Export Excel
                </button>
              </div>
            </div>

            {(myExpiringSoon ?? []).length > 0 && (
              <div className="bg-warning/10 border border-warning/30 rounded-xl p-4">
                <p className="text-sm font-semibold text-charcoal">Your upcoming expirations</p>
                <ul className="mt-1 space-y-1">
                  {(myExpiringSoon ?? []).map((r) => (
                    <li key={r.id} className="text-sm text-charcoal-600">
                      {courseById.get(r.course_id)?.name ?? 'Course'} — expires {r.expires_at ? new Date(r.expires_at).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!myEmployee && !myRecordsLoading && (myRecords ?? []).length === 0 ? (
              <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card space-y-3">
                <div>
                  <p className="text-sm font-semibold text-charcoal">Your account is not yet linked to an employee profile.</p>
                  <p className="text-sm text-charcoal-500 mt-1">
                    To see your training records, an HR administrator needs to link your user account to your employee record in HR Settings.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    to="/dashboard/hr/settings"
                    className="px-3 py-2 rounded-lg bg-teal text-white text-sm font-medium hover:bg-teal-600"
                  >
                    Go to HR Settings
                  </Link>
                  {(activeRole === 'admin' || activeRole === 'owner') && (
                    <button
                      type="button"
                      onClick={() => setLinkModalOpen(true)}
                      className="px-3 py-2 rounded-lg border border-teal text-teal text-sm font-medium hover:bg-teal-50"
                    >
                      Link my account now
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {myRecordsLoading ? (
                  <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
                    <p className="text-sm text-charcoal-500">Loading…</p>
                  </div>
                ) : myFiltered.length === 0 ? (
                  <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
                    <p className="text-sm text-charcoal-500">No training records for you yet.</p>
                  </div>
                ) : (
                  myFiltered.map((r) => {
                    const badge = myTrainingBadge(r);
                    return (
                      <div key={r.id} className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <p className="text-sm font-semibold text-charcoal">{r.courseName}</p>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>{badge.label}</span>
                        </div>
                        <p className="text-sm text-charcoal-500 mt-1">
                          {r.providerName ? `Provider: ${r.providerName} • ` : ''}
                          {r.completed_at ? `Completed: ${new Date(r.completed_at).toLocaleDateString('en-ZA')}` : 'Not yet completed'}
                          {r.expires_at ? ` • Expires: ${new Date(r.expires_at).toLocaleDateString('en-ZA')}` : ''}
                        </p>
                        {r.certificate_bucket && r.certificate_key && (
                          <div className="mt-3 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const blob = await downloadDocumentFile({ bucket: r.certificate_bucket!, key: r.certificate_key! });
                                  openBlobInNewTab(blob);
                                } catch (err) {
                                  alert(toUserFacingError(err, 'Could not open certificate. Please try again.'));
                                }
                              }}
                              className="px-3 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50"
                            >
                              Open certificate
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const blob = await downloadDocumentFile({ bucket: r.certificate_bucket!, key: r.certificate_key! });
                                  downloadBlob(blob, r.certificate_key!.split('/').pop() ?? 'certificate');
                                } catch (err) {
                                  alert(toUserFacingError(err, 'Could not download certificate. Please try again.'));
                                }
                              }}
                              className="px-3 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50"
                            >
                              Download
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {linkModalOpen && (
              <LinkMyAccountModal
                companyId={activeCompanyId}
                userId={user?.id as any}
                onClose={() => setLinkModalOpen(false)}
                onLinked={(linked) => {
                  showSuccess(`Linked your account to ${employeeName(linked)}'s profile.`);
                  setLinkModalOpen(false);
                  setLinkVersion((v) => v + 1);
                }}
              />
            )}
          </motion.div>
        );
      })()}
    </Layout>);

}

function LinkMyAccountModal(props: {
  companyId: string | null;
  userId: string;
  onClose: () => void;
  onLinked: (employee: HrEmployee) => void;
}) {
  const [employeeId, setEmployeeId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    if (!props.companyId || !employeeId) return;
    setSaving(true);
    setError(null);
    try {
      const linked = await linkHrEmployeeToUser(props.companyId, employeeId as any, props.userId);
      props.onLinked(linked);
    } catch (err) {
      setError(toUserFacingError(err, 'Could not link your account right now. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-surface-200 p-5">
        <p className="text-sm font-semibold text-charcoal">Link my account</p>
        <p className="text-sm text-charcoal-500 mt-1">Select your employee record:</p>
        {error && (
          <div className="mt-3 bg-critical/5 border border-critical/20 rounded-xl p-3">
            <p className="text-sm text-charcoal-600">{error}</p>
          </div>
        )}
        <div className="mt-3">
          <HrEmployeeSelect
            companyId={props.companyId as any}
            value={employeeId as any}
            valueField="id"
            includeUnlinked
            onChange={(selected) => setEmployeeId(selected || '')}
            placeholder="Search HR employees..."
          />
        </div>
        <div className="flex items-center justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={props.onClose}
            className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={!employeeId || saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60"
          >
            {saving && <LoadingSpinner size={16} />}
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
