import React, { useMemo, useState } from 'react';
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
import type { CompanyMembership } from '../api/models/entities';
import { downloadBlob, downloadDocumentFile, openBlobInNewTab } from '../api/services/documentsStorageService';

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
  const { activeCompanyId, activeRole } = useTenant();
  const canManage = activeRole === 'admin' || activeRole === 'manager' || activeRole === 'supervisor' || activeRole === 'consultant';
  const canManageMatrix = activeRole === 'admin' || activeRole === 'manager';
  const isEmployee = activeRole === 'employee';

  const [addOpen, setAddOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TrainingRecordStatus | ''>('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [scheduleRecord, setScheduleRecord] = useState<TrainingRecord | null>(null);
  const [completeRecord, setCompleteRecord] = useState<TrainingRecord | null>(null);
  const [recordsRefresh, setRecordsRefresh] = useState(0);

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
      const userId =
        activeRole === 'employee' ? (user?.id ?? undefined) : selectedEmployeeId ? selectedEmployeeId : undefined;
      const status = statusFilter || undefined;
      return await listTrainingRecords(activeCompanyId, {
        userId,
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
  const { data: providers } = useAsync(
    async () => (activeCompanyId && canManage ? listTrainingProviders(activeCompanyId) : []),
    [activeCompanyId, canManage]
  );
  const profileByUserId = useMemo(() => new Map((profiles ?? []).map((p) => [p.user_id, p])), [profiles]);

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
  const expired = all.filter((r) => r.expires_at && new Date(r.expires_at).getTime() < now).length;
  const validCount = all.length - expired;
  const compliance = all.length > 0 ? Math.round((validCount / all.length) * 100) : 0;

  const courseById = useMemo(() => new Map((courses ?? []).map((c) => [c.id, c])), [courses]);

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = all.map((r) => ({
      ...r,
      courseName: courseById.get(r.course_id)?.name ?? `Course ${String(r.course_id).slice(0, 8)}`
    }));
    if (!q) return list;
    return list.filter((r) => r.courseName.toLowerCase().includes(q) || String(r.user_id).includes(q));
  }, [all, courseById, searchQuery]);

  const matrix = useMemo(() => {
    const members = memberships ?? [];
    const byRole = new Map<string, UUID[]>();
    for (const m of members) {
      const key = String(m.role);
      const arr = byRole.get(key) ?? [];
      arr.push(m.user_id);
      byRole.set(key, arr);
    }
    const nowMs = Date.now();
    const recordsByUser = new Map<string, TrainingRecord[]>();
    for (const r of all) {
      const k = String(r.user_id);
      const arr = recordsByUser.get(k) ?? [];
      arr.push(r);
      recordsByUser.set(k, arr);
    }
    const rows = Array.from(byRole.entries()).map(([role, userIds]) => {
      let expired = 0;
      let expiring = 0;
      let total = 0;
      for (const uid of userIds) {
        const recs = recordsByUser.get(String(uid)) ?? [];
        for (const r of recs) {
          total += 1;
          if (r.expires_at) {
            const t = new Date(r.expires_at).getTime();
            if (Number.isFinite(t)) {
              if (t < nowMs) expired += 1;
              else if (t < nowMs + 1000 * 60 * 60 * 24 * 30) expiring += 1;
            }
          }
        }
      }
      const valid = total - expired;
      const compliancePct = total === 0 ? 0 : Math.round((valid / total) * 100);
      return { role, users: userIds.length, total, expired, expiring, compliancePct };
    });
    rows.sort((a, b) => b.users - a.users);
    return rows;
  }, [all, memberships]);

  const tabs: { id: TrainingTab; label: string; icon: React.ComponentType<{ className?: string }>; show: boolean }[] = [
    { id: 'matrix', label: 'Matrix Setup', icon: SettingsIcon, show: canManageMatrix },
    { id: 'employees', label: 'Employee Training', icon: UsersIcon, show: canManage },
    { id: 'reports', label: 'Reports & Costs', icon: BarChart3Icon, show: canManageMatrix },
    { id: 'my', label: 'My Training', icon: UserIcon, show: true }
  ].filter((t) => t.show);

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
            <p className="text-sm text-charcoal-500">Expiring Soon</p>
            <p className="text-2xl font-bold text-warning mt-1">{expiringSoon ?? 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Expired</p>
            <p className="text-2xl font-bold text-critical mt-1">{expired}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Active Courses</p>
            <p className="text-2xl font-bold text-teal mt-1">{(courses ?? []).length}</p>
          </div>
        </motion.div>

        {/* Training Matrix */}
        <motion.div variants={itemVariants}>
          <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
              <h3 className="font-semibold text-charcoal flex items-center gap-2">
                <GraduationCapIcon className="w-5 h-5 text-teal" />
                Training Matrix by Role
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface-50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Role</th>
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
              onSaved={() => setRecordsRefresh((r) => r + 1)}
            />
          )}
          {completeRecord && (
            <TrainingCompleteModal
              open={!!completeRecord}
              onClose={() => setCompleteRecord(null)}
              companyId={activeCompanyId!}
              record={completeRecord}
              course={courseById.get(completeRecord.course_id) ?? null}
              onSaved={() => setRecordsRefresh((r) => r + 1)}
            />
          )}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-lg font-semibold text-charcoal">
              Training Records
            </h2>
            <button
              type="button"
              disabled={!activeCompanyId || !user?.id || (!canManage && activeRole !== 'employee')}
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <PlusIcon className="w-4 h-4" />
              Add Training
            </button>
          </div>
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
                  {(profiles ?? []).map((p) => (
                    <option key={p.user_id} value={p.user_id}>
                      {p.full_name || p.email || String(p.user_id).slice(0, 8)}
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
              const userName = profileByUserId.get(r.user_id)?.full_name || profileByUserId.get(r.user_id)?.email || String(r.user_id).slice(0, 8);
              const uploaderProfile = profileByUserId.get(r.created_by_user_id);
              const uploaderName =
                uploaderProfile?.full_name || uploaderProfile?.email || String(r.created_by_user_id).slice(0, 8);
              const uploadDateSource = r.updated_at || r.completed_at || r.created_at;
              return (
                <div key={r.id} className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-charcoal">{r.courseName}</p>
                      <p className="text-sm text-charcoal-500 mt-1">
                        {canManage && <span>{userName} • </span>}
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
                              // eslint-disable-next-line no-alert
                              alert('Could not open certificate. Please try again or contact support.');
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
                              // eslint-disable-next-line no-alert
                              alert('Could not download certificate. Please try again or contact support.');
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
                        onClick={async () => {
                          // eslint-disable-next-line no-alert
                          const confirmed = window.confirm(
                            'Are you sure you want to cancel this training record? It will be marked as cancelled but kept for history.'
                          );
                          if (!confirmed) return;
                          try {
                            await cancelTrainingRecord({ companyId: activeCompanyId!, recordId: r.id });
                            setRecordsRefresh((prev) => prev + 1);
                          } catch (err) {
                            // eslint-disable-next-line no-alert
                            alert('Could not cancel training record. Please try again or contact support.');
                          }
                        }}
                        className="px-3 py-2 rounded-lg border border-critical/40 text-critical text-sm font-medium hover:bg-critical/5"
                      >
                        Cancel record
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={async () => {
                          const confirmed = window.confirm(
                            'Delete this training record permanently? This cannot be undone.'
                          );
                          if (!confirmed || !activeCompanyId || !user?.id) return;
                          try {
                            await deleteTrainingRecord({
                              companyId: activeCompanyId,
                              recordId: r.id,
                              actorUserId: user.id
                            });
                            setRecordsRefresh((prev) => prev + 1);
                          } catch (err) {
                            alert('Could not delete training record. Please try again or contact support.');
                          }
                        }}
                        className="px-3 py-2 rounded-lg border border-critical/40 text-critical text-sm font-medium hover:bg-critical/5"
                      >
                        Delete record
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
        const myRecords = (records ?? []).filter((r) => r.user_id === user?.id);
        const myWithCourse = myRecords.map((r) => ({
          ...r,
          courseName: courseById.get(r.course_id)?.name ?? `Course ${String(r.course_id).slice(0, 8)}`
        }));
        const myFiltered = searchQuery.trim()
          ? myWithCourse.filter(
              (r) =>
                r.courseName.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
                String(r.user_id).includes(searchQuery)
            )
          : myWithCourse;
        return (
          <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
            <h2 className="text-lg font-semibold text-charcoal">My Training</h2>
            <div className="space-y-3">
              {myFiltered.length === 0 ? (
                <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
                  <p className="text-sm text-charcoal-500">No training records for you yet.</p>
                </div>
              ) : (
                myFiltered.map((r: TrainingRecord & { courseName?: string }) => (
                  <div key={r.id} className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
                    <p className="text-sm font-semibold text-charcoal">{r.courseName ?? 'Course'}</p>
                    <p className="text-sm text-charcoal-500 mt-1">
                      Status: <span className="font-medium">{r.status}</span>
                      {r.completed_at ? ` • Completed: ${new Date(r.completed_at).toLocaleDateString('en-ZA')}` : ''}
                      {r.expires_at ? ` • Expires: ${new Date(r.expires_at).toLocaleDateString('en-ZA')}` : ''}
                    </p>
                    {r.certificate_bucket && r.certificate_key && (
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            const blob = await downloadDocumentFile({ bucket: r.certificate_bucket!, key: r.certificate_key! });
                            openBlobInNewTab(blob);
                          }}
                          className="px-3 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50"
                        >
                          Open certificate
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const blob = await downloadDocumentFile({ bucket: r.certificate_bucket!, key: r.certificate_key! });
                            downloadBlob(blob, r.certificate_key!.split('/').pop() ?? 'certificate');
                          }}
                          className="px-3 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50"
                        >
                          Download
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        );
      })()}
    </Layout>);

}
