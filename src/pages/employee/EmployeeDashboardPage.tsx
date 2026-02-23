import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  UserIcon,
  ClipboardCheckIcon,
  GraduationCapIcon,
  AlertTriangleIcon,
  HardHatIcon,
  FileTextIcon,
  ArrowRightIcon,
} from 'lucide-react';
import { Layout } from '../../components/layout/Layout';
import { StatCard } from '../../components/ui/StatCard';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useIdentity } from '../../hooks/useIdentity';
import { useAsync } from '../../api/hooks/useAsync';
import { countMyPendingTasks, listTasks } from '../../api/services/tasksService';
import { countMyIncidents } from '../../api/services/incidentsService';
import { countExpiringTrainingForUser } from '../../api/services/trainingService';

export function EmployeeDashboardPage() {
  const { activeCompanyId } = useTenant();
  const { user } = useUser();
  const { fullName, organisationName } = useIdentity();
  const firstName = String(fullName).split(' ')[0];
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: summary, loading, error } = useAsync(
    async () => {
      if (!activeCompanyId || !user?.id) return null;
      const [myPendingTasks, myIncidents, expiringTraining] = await Promise.all([
        countMyPendingTasks(activeCompanyId, user.id).catch(() => 0),
        countMyIncidents(activeCompanyId, user.id).catch(() => 0),
        countExpiringTrainingForUser(activeCompanyId, user.id, 30).catch(() => 0),
      ]);
      const tasks = await listTasks({
        companyId: activeCompanyId,
        assigneeUserId: user.id,
        limit: 5,
      }).catch(() => []);
      return { myPendingTasks, myIncidents, expiringTraining, tasks };
    },
    [activeCompanyId, user?.id, refreshKey]
  );

  return (
    <Layout title="My Dashboard">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        <div className="bg-gradient-to-r from-navy to-navy-700 rounded-2xl p-6 text-white">
          <h1 className="text-2xl font-bold mb-1">Hello, {firstName}</h1>
          <p className="text-navy-200">
            Your overview at {organisationName}
          </p>
        </div>

        {error && (
          <div className="bg-white rounded-xl border border-critical/30 p-4 shadow-card">
            <p className="text-sm font-semibold text-critical">Unable to load dashboard</p>
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="mt-2 text-sm text-teal font-medium"
            >
              Try again
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            title="My pending tasks"
            value={summary?.myPendingTasks ?? 0}
            icon="ClipboardCheck"
            iconColor="#0FB9B1"
            variant="info"
            subtitle="Assigned to you"
          />
          <StatCard
            title="My incidents"
            value={summary?.myIncidents ?? 0}
            icon="AlertTriangle"
            iconColor="#E74C3C"
            variant="critical"
            subtitle="Reported by you"
          />
          <StatCard
            title="Training expiring (30 days)"
            value={summary?.expiringTraining ?? 0}
            icon="GraduationCap"
            iconColor="#3498DB"
            variant="warning"
            subtitle="Renewals due"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <a
            href="/profile"
            className="flex items-center justify-between p-5 bg-white rounded-xl border border-surface-300 shadow-card hover:shadow-card-hover transition-all"
          >
            <div className="flex items-center gap-3">
              <UserIcon className="w-8 h-8 text-teal" />
              <span className="font-medium text-charcoal">My profile</span>
            </div>
            <ArrowRightIcon className="w-5 h-5 text-charcoal-400" />
          </a>
          <a
            href="/tasks"
            className="flex items-center justify-between p-5 bg-white rounded-xl border border-surface-300 shadow-card hover:shadow-card-hover transition-all"
          >
            <div className="flex items-center gap-3">
              <ClipboardCheckIcon className="w-8 h-8 text-navy" />
              <span className="font-medium text-charcoal">My tasks</span>
            </div>
            <ArrowRightIcon className="w-5 h-5 text-charcoal-400" />
          </a>
          <a
            href="/training"
            className="flex items-center justify-between p-5 bg-white rounded-xl border border-surface-300 shadow-card hover:shadow-card-hover transition-all"
          >
            <div className="flex items-center gap-3">
              <GraduationCapIcon className="w-8 h-8 text-amber-600" />
              <span className="font-medium text-charcoal">Training & certificates</span>
            </div>
            <ArrowRightIcon className="w-5 h-5 text-charcoal-400" />
          </a>
          <a
            href="/incidents"
            className="flex items-center justify-between p-5 bg-white rounded-xl border border-surface-300 shadow-card hover:shadow-card-hover transition-all"
          >
            <div className="flex items-center gap-3">
              <AlertTriangleIcon className="w-8 h-8 text-critical" />
              <span className="font-medium text-charcoal">Report incident</span>
            </div>
            <ArrowRightIcon className="w-5 h-5 text-charcoal-400" />
          </a>
          <a
            href="/ppe"
            className="flex items-center justify-between p-5 bg-white rounded-xl border border-surface-300 shadow-card hover:shadow-card-hover transition-all"
          >
            <div className="flex items-center gap-3">
              <HardHatIcon className="w-8 h-8 text-charcoal-600" />
              <span className="font-medium text-charcoal">My PPE</span>
            </div>
            <ArrowRightIcon className="w-5 h-5 text-charcoal-400" />
          </a>
          <a
            href="/documents"
            className="flex items-center justify-between p-5 bg-white rounded-xl border border-surface-300 shadow-card hover:shadow-card-hover transition-all"
          >
            <div className="flex items-center gap-3">
              <FileTextIcon className="w-8 h-8 text-charcoal-500" />
              <span className="font-medium text-charcoal">Policies & documents</span>
            </div>
            <ArrowRightIcon className="w-5 h-5 text-charcoal-400" />
          </a>
        </div>
      </motion.div>
    </Layout>
  );
}
