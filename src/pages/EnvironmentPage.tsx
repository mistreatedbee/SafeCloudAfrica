import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  LeafIcon,
  DropletIcon,
  WindIcon,
  TrashIcon,
  TrendingUpIcon,
  AlertTriangleIcon,
  ArrowRightIcon } from
'lucide-react';
import { Layout } from '../components/layout/Layout';
import { ComplianceScore } from '../components/ui/ComplianceScore';
import { StatCard } from '../components/ui/StatCard';
import { ProgressBar } from '../components/ui/ProgressBar';
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import { countActiveEnvironmentAspects, listEnvironmentMonitoring } from '../api/services/environmentService';
import { listModuleTargets } from '../api/services/moduleTargetsService';
import { countInspections } from '../api/services/inspectionsService';

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
export function EnvironmentPage() {
  const navigate = useNavigate();
  const { activeCompanyId } = useTenant();

  const { data: targets } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return await listModuleTargets({ companyId: activeCompanyId, module: 'environment', limit: 10 });
  }, [activeCompanyId]);

  const { data: stats } = useAsync(async () => {
    if (!activeCompanyId) return null;
    const [activeAspects, monitoringDue] = await Promise.all([
      countActiveEnvironmentAspects(activeCompanyId),
      countInspections(activeCompanyId, { module: 'environment', status: 'overdue' })
    ]);
    const t = targets ?? [];
    const getTarget = (name: string) => t.find((x) => x.name.toLowerCase().includes(name.toLowerCase()));
    const waste = getTarget('waste')?.current_value ?? 0;
    const carbon = getTarget('carbon')?.current_value ?? 0;

    const compliance = Math.max(0, Math.min(100, 100 - activeAspects * 1 - monitoringDue * 5));
    return { compliance, activeAspects, monitoringDue, wasteRecycled: waste, carbonReduction: carbon };
  }, [activeCompanyId, targets?.length]);

  const { data: recentMonitoring } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return await listEnvironmentMonitoring(activeCompanyId, 10);
  }, [activeCompanyId]);

  const envStats = stats ?? { compliance: 0, activeAspects: 0, monitoringDue: 0, wasteRecycled: 0, carbonReduction: 0 };

  const environmentalTargets = useMemo(() => {
    return (targets ?? []).map((t) => ({
      name: t.name,
      current: t.current_value,
      target: t.target_value,
      unit: t.unit ?? '',
      achieved: t.achieved
    }));
  }, [targets]);

  return (
    <Layout title="Environmental Management">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-6">

        {/* Module Header */}
        <motion.div
          variants={itemVariants}
          className="bg-gradient-to-r from-success to-success-600 rounded-2xl p-6 text-white">

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-xl">
                <LeafIcon className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Environmental Management</h1>
                <p className="text-green-100">ISO 14001:2015 Aligned</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <ComplianceScore
                score={envStats.compliance}
                size="md"
                showLabel={false} />

              <div className="text-right">
                <p className="text-sm text-green-100">Module Compliance</p>
                <p className="text-3xl font-bold">{envStats.compliance}%</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <motion.div
          variants={itemVariants}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4">

          <StatCard
            title="Active Aspects"
            value={envStats.activeAspects}
            icon="Leaf"
            iconColor="#2ECC71" />

          <StatCard
            title="Monitoring Due"
            value={envStats.monitoringDue}
            icon="Calendar"
            iconColor="#F5A623"
            variant="warning" />

          <StatCard
            title="Waste Recycled"
            value={`${envStats.wasteRecycled}%`}
            icon="Award"
            iconColor="#2ECC71"
            variant="success" />

          <StatCard
            title="Carbon Reduction"
            value={`${envStats.carbonReduction}%`}
            icon="Leaf"
            iconColor="#0FB9B1"
            trend="up"
            trendValue={3} />

        </motion.div>

        {/* Environmental Targets & Monitoring */}
        <motion.div
          variants={itemVariants}
          className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal mb-4 flex items-center gap-2">
              <TrendingUpIcon className="w-5 h-5 text-success" />
              Environmental Targets
            </h3>
            <div className="space-y-4">
              {environmentalTargets.length === 0 && (
                <p className="text-sm text-charcoal-500">No targets configured yet.</p>
              )}
              {environmentalTargets.map((target, index) =>
              <div key={`${target.name}-${index}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-charcoal">
                      {target.name}
                    </span>
                    <span
                    className={`text-sm font-medium ${target.achieved ? 'text-success' : 'text-charcoal-500'}`}>

                      {target.current}
                      {target.unit} / {target.target}
                      {target.unit}
                    </span>
                  </div>
                  <ProgressBar
                  value={target.current / target.target * 100}
                  size="sm"
                  showValue={false}
                  variant={target.achieved ? 'success' : 'default'} />

                </div>
              )}
            </div>
          </div>

          {/* Recent Monitoring */}
          <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-200">
              <h3 className="font-semibold text-charcoal">
                Recent Monitoring Results
              </h3>
            </div>
            <div className="divide-y divide-surface-100">
              {(recentMonitoring ?? []).length === 0 && (
                <div className="px-5 py-3">
                  <p className="text-sm text-charcoal-500">No monitoring records yet.</p>
                </div>
              )}
              {(recentMonitoring ?? []).map((item) =>
              <div
                key={item.id}
                className="px-5 py-3 hover:bg-surface-50 cursor-pointer transition-colors">

                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-charcoal">
                        {item.type}
                      </p>
                      <p className="text-xs text-charcoal-400 mt-0.5">
                        {item.location}
                      </p>
                    </div>
                    <div className="text-right">
                      <span
                      className={`text-sm font-medium ${item.result === 'Within limits' ? 'text-success' : 'text-critical'}`}>

                        {item.result}
                      </span>
                      <p className="text-xs text-charcoal-400 mt-0.5">
                        {new Date(item.measured_at).toLocaleDateString('en-ZA')}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="px-5 py-3 bg-surface-50 border-t border-surface-200">
              <button type="button" onClick={() => navigate('/reports')} className="text-sm font-medium text-success hover:text-success-700 transition-colors">
                View all monitoring →
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
              icon: LeafIcon,
              label: 'Aspects Register',
              color: '#2ECC71'
            },
            {
              icon: DropletIcon,
              label: 'Water Monitoring',
              color: '#3498DB'
            },
            {
              icon: WindIcon,
              label: 'Air Quality',
              color: '#9B59B6'
            },
            {
              icon: TrashIcon,
              label: 'Waste Management',
              color: '#F5A623'
            }].
            map((item, index) =>
            <button
              key={index}
              type="button"
              onClick={() => navigate('/reports')}
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