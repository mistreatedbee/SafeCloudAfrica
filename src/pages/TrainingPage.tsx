import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  GraduationCapIcon,
  PlusIcon,
  SearchIcon } from
'lucide-react';
import { Layout } from '../components/layout/Layout';
import { useTenant } from '../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../api/hooks/useAsync';
import { countExpiringTraining, listTrainingCourses, listTrainingRecords } from '../api/services/trainingService';
import type { TrainingCourse, TrainingRecord } from '../api/models/entities';
import { TrainingAddModal } from '../components/training/TrainingAddModal';
import { listCompanyMemberships } from '../api/services/tenantService';
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
export function TrainingPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const { user } = useUser();
  const { activeCompanyId, activeRole } = useTenant();
  const canManage = activeRole === 'admin' || activeRole === 'manager' || activeRole === 'supervisor' || activeRole === 'consultant';

  const [addOpen, setAddOpen] = useState(false);

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
      return await listTrainingRecords(activeCompanyId, { userId, limit: 1000 });
    },
    [activeCompanyId, activeRole, user?.id]
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
          onAdded={() => setAddOpen(false)}
        />
      )}
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
          <div className="flex items-center justify-between mb-4">
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
            {filteredRecords.map((r: any) => (
              <div key={r.id} className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
                <p className="text-sm font-semibold text-charcoal">{r.courseName}</p>
                <p className="text-sm text-charcoal-500 mt-1">
                  User: {String(r.user_id).slice(0, 8)} • Completed: {new Date(r.completed_at).toLocaleDateString('en-ZA')}
                  {r.expires_at ? ` • Expires: ${new Date(r.expires_at).toLocaleDateString('en-ZA')}` : ''}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!r.certificate_bucket || !r.certificate_key}
                    onClick={async () => {
                      if (!r.certificate_bucket || !r.certificate_key) return;
                      const blob = await downloadDocumentFile({ bucket: r.certificate_bucket, key: r.certificate_key });
                      openBlobInNewTab(blob);
                    }}
                    className="px-3 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    Open certificate
                  </button>
                  <button
                    type="button"
                    disabled={!r.certificate_bucket || !r.certificate_key}
                    onClick={async () => {
                      if (!r.certificate_bucket || !r.certificate_key) return;
                      const blob = await downloadDocumentFile({ bucket: r.certificate_bucket, key: r.certificate_key });
                      const filename = r.certificate_key.split('/').pop() ?? 'certificate';
                      downloadBlob(blob, filename);
                    }}
                    className="px-3 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    Download
                  </button>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </Layout>);

}