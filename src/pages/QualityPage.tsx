import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useUser } from '@insforge/react';
import {
  AwardIcon,
  ClipboardCheckIcon,
  FileTextIcon,
  TrendingUpIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  ArrowRightIcon } from
'lucide-react';
import { Layout } from '../components/layout/Layout';
import { ComplianceScore } from '../components/ui/ComplianceScore';
import { StatCard } from '../components/ui/StatCard';
import { StatusBadge } from '../components/ui/StatusBadge';
import { ProgressBar } from '../components/ui/ProgressBar';
import { ListEmptyState } from '../components/ui/ListEmptyState';
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import { countOpenQualityNcrs, listQualityNcrs } from '../api/services/qualityNcrsService';
import { countOpenCorrectiveActions } from '../api/services/correctiveActionsService';
import { countTasksByStatus } from '../api/services/tasksService';
import { countIncidentsByStatusForModule } from '../api/services/incidentsService';
import { getCustomerComplaintSummary } from '../api/services/customerComplaintsService';
import type { UUID } from '../api/models/core';

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
export function QualityPage() {
  const navigate = useNavigate();
  const { user } = useUser();
  const { activeCompanyId, activeRole } = useTenant();

  const { data: summary, loading: summaryLoading } = useAsync(async () => {
    if (!activeCompanyId || !user?.id) return null;
    const [openNcrs, pendingCapas, openQualityIncidents, totalTasks, completedTasks, allNcrs, complaintSummary] = await Promise.all([
      countOpenQualityNcrs(activeCompanyId),
      countOpenCorrectiveActions(activeCompanyId, { module: 'quality' }),
      countIncidentsByStatusForModule(activeCompanyId, 'quality', 'open'),
      countTasksByStatus(activeCompanyId, { module: 'quality' }),
      countTasksByStatus(activeCompanyId, { module: 'quality', status: 'closed' }),
      listQualityNcrs({ companyId: activeCompanyId, limit: 500 }),
      getCustomerComplaintSummary({
        companyId: activeCompanyId,
        actorRole: activeRole ?? null,
        actorUserId: user.id as UUID,
        dateFrom: new Date(new Date().setMonth(new Date().getMonth() - 3)).toISOString().slice(0, 10),
        dateTo: new Date().toISOString().slice(0, 10)
      })
    ]);

    const efficiency = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const compliance = Math.max(0, Math.min(100, 100 - openNcrs * 4 - pendingCapas * 2 - openQualityIncidents * 2));

    const totalNcrs = allNcrs.length;
    const highRiskNcrs = allNcrs.filter((n: any) =>
      ['high', 'critical'].includes(String(n.severity).toLowerCase()) ||
      ['high', 'critical'].includes(String((n as any).risk_rating ?? '').toLowerCase())
    ).length;
    const repeatNcrs = allNcrs.filter((n: any) => (n as any).repeat_finding).length;
    const overdueNcrs = allNcrs.filter((n: any) => String(n.status) === 'overdue').length;
    const closedNcrs = allNcrs.filter((n: any) => String(n.status) === 'closed').length;
    const closureRate = totalNcrs > 0 ? Math.round((closedNcrs / totalNcrs) * 100) : 0;

    return {
      compliance,
      openNcrs,
      pendingCapas,
      customerComplaints: complaintSummary.total,
      processEfficiency: efficiency,
      totalTasks,
      completedTasks,
      totalNcrs,
      highRiskNcrs,
      repeatNcrs,
      overdueNcrs,
      closureRate
    };
  }, [activeCompanyId, activeRole, user?.id]);

  const { data: recentNcrs } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return await listQualityNcrs({ companyId: activeCompanyId, limit: 5 });
  }, [activeCompanyId]);

  const qualityStats = summary ?? {
    compliance: 0,
    openNcrs: 0,
    pendingCapas: 0,
    customerComplaints: 0,
    processEfficiency: 0,
    totalTasks: 0,
    completedTasks: 0,
    totalNcrs: 0,
    highRiskNcrs: 0,
    repeatNcrs: 0,
    overdueNcrs: 0,
    closureRate: 0
  };

  const qualityMetrics = useMemo(() => {
    const completionRate = qualityStats.totalTasks > 0 ? Math.round((qualityStats.completedTasks / qualityStats.totalTasks) * 100) : 0;
    return [
      { name: 'Task completion rate', value: completionRate, target: 90 },
      { name: 'Open NCRs (lower is better)', value: qualityStats.openNcrs, target: 0, unit: '', inverse: true },
      { name: 'Open quality incidents (lower is better)', value: qualityStats.customerComplaints, target: 0, unit: '', inverse: true },
      { name: 'Process efficiency', value: qualityStats.processEfficiency, target: 90, unit: '%' },
      { name: 'NCR closure rate', value: qualityStats.closureRate, target: 95, unit: '%' },
      { name: 'High-risk NCRs (lower is better)', value: qualityStats.highRiskNcrs, target: 0, unit: '', inverse: true },
      { name: 'Repeat findings (lower is better)', value: qualityStats.repeatNcrs, target: 0, unit: '', inverse: true },
      { name: 'Overdue NCRs (lower is better)', value: qualityStats.overdueNcrs, target: 0, unit: '', inverse: true }
    ] as Array<{ name: string; value: number; target: number; unit?: string; inverse?: boolean }>;
  }, [
    qualityStats.completedTasks,
    qualityStats.customerComplaints,
    qualityStats.openNcrs,
    qualityStats.processEfficiency,
    qualityStats.totalTasks,
    qualityStats.closureRate,
    qualityStats.highRiskNcrs,
    qualityStats.repeatNcrs,
    qualityStats.overdueNcrs
  ]);

  return (
    <Layout title="Quality Management">
      {summaryLoading && (
        <div className="text-center py-4 text-sm text-charcoal-500">Loading quality data...</div>
      )}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-6">

        {/* Module Header */}
        <motion.div
          variants={itemVariants}
          className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-2xl p-6 text-white">

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-xl">
                <AwardIcon className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Quality Management</h1>
                <p className="text-blue-100">ISO 9001:2015 Aligned</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <ComplianceScore
                score={qualityStats.compliance}
                size="md"
                showLabel={false} />

              <div className="text-right">
                <p className="text-sm text-blue-100">Module Compliance</p>
                <p className="text-3xl font-bold">{qualityStats.compliance}%</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <motion.div
          variants={itemVariants}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4">

          <StatCard
            title="Open NCRs"
            value={qualityStats.openNcrs}
            icon="AlertTriangle"
            iconColor="#E74C3C"
            variant="critical" />

          <StatCard
            title="Pending CAPAs"
            value={qualityStats.pendingCapas}
            icon="ClipboardCheck"
            iconColor="#F5A623"
            variant="warning" />

          <StatCard
            title="Customer Complaints"
            value={qualityStats.customerComplaints}
            icon="AlertTriangle"
            iconColor="#F5A623" />

          <StatCard
            title="Process Efficiency"
            value={`${qualityStats.processEfficiency}%`}
            icon="Award"
            iconColor="#2ECC71"
            variant="success" />

        </motion.div>

        {/* Quality Metrics */}
        <motion.div
          variants={itemVariants}
          className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal mb-4 flex items-center gap-2">
              <TrendingUpIcon className="w-5 h-5 text-blue-500" />
              Quality Metrics
            </h3>
            <div className="space-y-4">
              {qualityMetrics.map((metric, index) => {
                const isOnTarget = metric.inverse ?
                metric.value <= metric.target :
                metric.value >= metric.target;
                return (
                  <div key={index}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-charcoal">
                        {metric.name}
                      </span>
                      <span
                        className={`text-sm font-medium ${isOnTarget ? 'text-success' : 'text-warning'}`}>

                        {metric.value}
                        {metric.unit || '%'} / {metric.target}
                        {metric.unit || '%'}
                      </span>
                    </div>
                    <ProgressBar
                      value={
                      metric.inverse ?
                      metric.value === 0 ? 100 : metric.target / metric.value * 100 :
                      metric.value / metric.target * 100
                      }
                      max={100}
                      size="sm"
                      showValue={false}
                      variant={isOnTarget ? 'success' : 'warning'} />

                  </div>);

              })}
            </div>
          </div>

          {/* Recent NCRs */}
          <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
              <h3 className="font-semibold text-charcoal flex items-center gap-2">
                <AlertCircleIcon className="w-5 h-5 text-critical" />
                Recent Non-Conformances
              </h3>
            </div>
            <div className="divide-y divide-surface-100">
              {(recentNcrs ?? []).length === 0 && (
                <div className="px-3 py-2">
                  <ListEmptyState
                    embedded
                    icon={AlertCircleIcon}
                    title="No recent non-conformances"
                    description="When NCRs are logged for your organisation, the latest ones will appear here."
                    primaryAction={{ kind: 'link', to: '/dashboard/management/ncrs', label: 'Open NCR register' }}
                  />
                </div>
              )}
              {(recentNcrs ?? []).map((ncr) =>
              <div
                key={ncr.id}
                className="px-5 py-3 hover:bg-surface-50 cursor-pointer transition-colors">

                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-blue-500">
                        {String((ncr as any).nc_number ?? `NCR-${String(ncr.id).slice(0, 8)}`)}
                      </p>
                      <p className="text-sm text-charcoal mt-0.5">
                        {ncr.title}
                      </p>
                      <p className="text-xs text-charcoal-400 mt-0.5">
                        {new Date((((ncr as any).date_identified ?? (ncr as any).occurrence_date ?? ncr.created_at) as any)).toLocaleDateString('en-ZA')}
                      </p>
                    </div>
                    <StatusBadge status={ncr.status as any} size="sm" />
                  </div>
                </div>
              )}
            </div>
            <div className="px-5 py-3 bg-surface-50 border-t border-surface-200">
              <button type="button" onClick={() => navigate('/dashboard/management/ncrs')} className="text-sm font-medium text-blue-500 hover:text-blue-700 transition-colors">
                View all NCRs →
              </button>
            </div>
          </div>
        </motion.div>

        {/* Quick Access */}
        <motion.div variants={itemVariants}>
          <h2 className="text-lg font-semibold text-charcoal mb-4">
            Quick Access
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
            {
              icon: ClipboardCheckIcon,
              label: 'Quality Audit',
              color: '#3498DB'
            },
            {
              icon: FileTextIcon,
              label: 'Document Control',
              color: '#0FB9B1'
            },
            {
              icon: AlertCircleIcon,
              label: 'Customer Complaints',
              color: '#F5A623'
            },
            {
              icon: AlertCircleIcon,
              label: 'Internal & External Issues',
              color: '#3498DB'
            },
            {
              icon: CheckCircleIcon,
              label: 'CAPA Management',
              color: '#2ECC71'
            }].
            map((item, index) =>
            <button
              key={index}
              type="button"
              onClick={() => {
                if (item.label === 'Quality Audit') navigate('/audits/new');
                if (item.label === 'Document Control') navigate('/documents');
                if (item.label === 'Customer Complaints') navigate('/dashboard/quality/complaints');
                if (item.label === 'Internal & External Issues') navigate('/dashboard/quality/issues');
                if (item.label === 'CAPA Management') navigate('/dashboard/management/tasks?view=capa');
              }}
              className="flex flex-col items-center gap-3 p-5 bg-white rounded-xl border border-surface-300 shadow-card hover:shadow-card-hover transition-all active:scale-[0.98]">

                <div
                className="p-3 rounded-lg"
                style={{
                  backgroundColor: `${item.color}15`
                }}>

                  <item.icon
                  className="w-6 h-6"
                  style={{
                    color: item.color
                  }} />

                </div>
                <span className="text-sm font-medium text-charcoal">
                  {item.label}
                </span>
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </Layout>);

}
