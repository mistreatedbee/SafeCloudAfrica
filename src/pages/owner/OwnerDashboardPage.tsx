import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import {
  ShieldCheckIcon,
  TrendingUpIcon,
  BarChart3Icon,
  AlertOctagonIcon,
  ScaleIcon,
  Building2Icon,
  ArrowRightIcon,
} from 'lucide-react';
import { Layout } from '../../components/layout/Layout';
import { ComplianceScore } from '../../components/ui/ComplianceScore';
import { StatCard } from '../../components/ui/StatCard';
import { RiskHeatMap } from '../../components/ui/RiskHeatMap';
import { TrendChart } from '../../components/ui/TrendChart';
import { useTenant } from '../../tenant/TenantContext';
import { useIdentity } from '../../hooks/useIdentity';
import { useAsync } from '../../api/hooks/useAsync';
import { getLicenseInfo } from '../../api/services/licensingService';
import { listIncidents } from '../../api/services/incidentsService';
import { listRisks } from '../../api/services/risksService';
import { listModuleTargets } from '../../api/services/moduleTargetsService';
import { countOverdueCorrectiveActions } from '../../api/services/correctiveActionsService';
import { countExpiringTraining } from '../../api/services/trainingService';
import { listAudits } from '../../api/services/auditsService';
import { listSites } from '../../api/services/sitesService';
import { listDepartments } from '../../api/services/departmentsService';
import { listInspections } from '../../api/services/inspectionsService';
import { FirstWinBanner } from '../../components/onboarding/FirstWinBanner';

export function OwnerDashboardPage() {
  const { activeCompanyId, activeCompany } = useTenant();
  const location = useLocation();
  const { organisationName } = useIdentity();
  const firstName = String(useIdentity().fullName).split(' ')[0];
  const [refreshKey, setRefreshKey] = useState(0);
  const showOnboardingComplete = new URLSearchParams(location.search).get('onboarding') === 'complete';

  const { data: summary, loading, error } = useAsync(
    async () => {
      if (!activeCompanyId) return null;
      const [incidents, risks, moduleTargets, overdueActions, expiringTraining, audits, inspections] = await Promise.all([
        listIncidents({ companyId: activeCompanyId, limit: 2000 }).catch(() => []),
        listRisks({ companyId: activeCompanyId, limit: 2000 }).catch(() => []),
        listModuleTargets({ companyId: activeCompanyId, limit: 2000 }).catch(() => []),
        countOverdueCorrectiveActions(activeCompanyId).catch(() => 0),
        countExpiringTraining(activeCompanyId, 30).catch(() => 0),
        listAudits({ companyId: activeCompanyId, limit: 100 }).catch(() => []),
        listInspections({ companyId: activeCompanyId, limit: 500 }).catch(() => []),
      ]);

      const byModule = new Map<string, { total: number; achieved: number }>();
      for (const t of moduleTargets) {
        const key = String(t.module);
        const entry = byModule.get(key) ?? { total: 0, achieved: 0 };
        entry.total += 1;
        if (t.achieved) entry.achieved += 1;
        byModule.set(key, entry);
      }
      const moduleScoreByKey: Record<string, number> = {};
      for (const [key, v] of byModule.entries()) {
        moduleScoreByKey[key] = v.total === 0 ? 0 : Math.round((v.achieved / v.total) * 100);
      }
      const overallScore = (() => {
        const totals = Array.from(byModule.values()).reduce((acc, v) => acc + v.total, 0);
        const achieved = Array.from(byModule.values()).reduce((acc, v) => acc + v.achieved, 0);
        return totals === 0 ? 0 : Math.round((achieved / totals) * 100);
      })();

      const heatMapData = (() => {
        const map = new Map<string, { likelihood: number; consequence: number; count: number; level: string }>();
        const classify = (rating: number) => {
          if (rating >= 17) return 'critical';
          if (rating >= 10) return 'high';
          if (rating >= 5) return 'medium';
          if (rating >= 2) return 'low';
          return 'minimal';
        };
        for (const r of risks) {
          const likelihood = Math.max(1, Math.min(5, Number((r as any).likelihood ?? 1)));
          const consequence = Math.max(1, Math.min(5, Number((r as any).consequence ?? 1)));
          const rating = Number((r as any).risk_rating ?? (likelihood * consequence));
          const key = `${likelihood}:${consequence}`;
          const prev = map.get(key) ?? { likelihood, consequence, count: 0, level: classify(rating) };
          prev.count += 1;
          const levels = ['minimal', 'low', 'medium', 'high', 'critical'];
          const worst = levels[Math.max(levels.indexOf(prev.level), levels.indexOf(classify(rating)))];
          prev.level = worst;
          map.set(key, prev);
        }
        return Array.from(map.values());
      })();

      const byMonth = new Map<string, { incidents: number; nearMisses: number; lti: number }>();
      for (const i of incidents) {
        const d = new Date(i.occurred_at);
        if (Number.isNaN(d.getTime())) continue;
        const key = `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        const entry = byMonth.get(key) ?? { incidents: 0, nearMisses: 0, lti: 0 };
        entry.incidents += 1;
        if (i.category === 'Near Miss') entry.nearMisses += 1;
        if (String(i.severity).toLowerCase() === 'critical') entry.lti += 1;
        byMonth.set(key, entry);
      }
      const trendData = Array.from(byMonth.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-12)
        .map(([month, v]) => ({ month, ...v }));

      const auditOpen = audits.filter((a: any) => a.status !== 'closed' && a.status !== 'completed').length;

      return {
        overallScore,
        moduleScoreByKey,
        heatMapData,
        trendData,
        overdueActions,
        expiringTraining,
        auditOpen,
        auditTotal: audits.length,
        inspectionOpen: inspections.filter((i) => i.status !== 'completed').length,
        inspectionTotal: inspections.length
      };
    },
    [activeCompanyId, refreshKey]
  );

  const { data: licenseInfo } = useAsync(
    () => (activeCompanyId ? getLicenseInfo(activeCompanyId) : null),
    [activeCompanyId, refreshKey]
  );
  const { data: siteCount } = useAsync(
    async () => {
      if (!activeCompanyId) return 0;
      const rows = await listSites(activeCompanyId, 2000);
      return rows.length;
    },
    [activeCompanyId, refreshKey]
  );
  const { data: departmentCount } = useAsync(
    async () => {
      if (!activeCompanyId) return 0;
      const rows = await listDepartments(activeCompanyId, 2000);
      return rows.length;
    },
    [activeCompanyId, refreshKey]
  );

  const meta = (activeCompany?.metadata ?? {}) as Record<string, any>;
  const onboardingSummary = (meta.onboarding_summary ?? {}) as Record<string, any>;
  const summaryModules: string[] = Array.isArray(onboardingSummary.modules_enabled)
    ? onboardingSummary.modules_enabled
    : [];

  return (
    <Layout title="Owner Dashboard">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        {showOnboardingComplete && (
          <div className="bg-success/5 border border-success/20 rounded-xl p-4">
            <p className="text-sm font-semibold text-success">Organization setup complete</p>
            <p className="text-sm text-charcoal-600 mt-1">Your system is ready.</p>
          </div>
        )}
        <FirstWinBanner persona="owner" />
        <div className="bg-gradient-to-r from-navy to-navy-700 rounded-2xl p-6 text-white">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold mb-1">Hello, {firstName}</h1>
              <p className="text-navy-200">
                Organisation overview for {organisationName}
              </p>
            </div>
            <div className="flex items-center gap-3 bg-white/10 rounded-xl px-4 py-3">
              <ShieldCheckIcon className="w-8 h-8 text-success" />
              <div>
                <p className="text-sm text-navy-200">Compliance score</p>
                <p className="text-2xl font-bold">{summary?.overallScore ?? 0}%</p>
              </div>
            </div>
          </div>
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

        {licenseInfo && (
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm font-semibold text-charcoal">License usage</p>
            <p className="text-sm text-charcoal-500 mt-1">
              {licenseInfo.currentEmployees} / {licenseInfo.employeeLimit} seats
              {' — '}
              <span className={licenseInfo.canAddEmployees ? 'text-success' : 'text-critical'}>
                {Math.max(0, licenseInfo.employeeLimit - licenseInfo.currentEmployees)} remaining
              </span>
            </p>
          </div>
        )}

        <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-charcoal">Organization summary</p>
              <p className="text-sm text-charcoal-500 mt-1">
                Org Name: {activeCompany?.name ?? organisationName}
                {' • '}
                Plan/Seats: {licenseInfo?.type ?? activeCompany?.license_type ?? '-'} / {licenseInfo?.employeeLimit ?? activeCompany?.employee_limit ?? 0}
                {' • '}
                Modules: {summaryModules.length ? summaryModules.join(', ') : 'Not captured'}
                {' • '}
                Sites/Departments: {siteCount ?? 0}/{departmentCount ?? 0}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/settings"
                className="inline-flex items-center justify-center px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50"
              >
                Edit Organization Profile
              </Link>
              <Link
                to="/users"
                className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-teal text-white text-sm font-medium hover:bg-teal-600"
              >
                Manage Users
              </Link>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card flex flex-col items-center">
            <ComplianceScore score={summary?.overallScore ?? 0} size="lg" label="Overall compliance" />
          </div>
          <StatCard
            title="Overdue corrective actions"
            value={summary?.overdueActions ?? 0}
            icon="ClipboardCheck"
            iconColor="#F5A623"
            variant="warning"
            subtitle="Requires attention"
          />
          <StatCard
            title="Expiring training (30 days)"
            value={summary?.expiringTraining ?? 0}
            icon="GraduationCap"
            iconColor="#3498DB"
            variant="warning"
            subtitle="Renewals due"
          />
          <StatCard
            title="Audits (open)"
            value={summary?.auditOpen ?? 0}
            icon="Search"
            iconColor="#2ECC71"
            variant="info"
            subtitle={`${summary?.auditTotal ?? 0} total`}
          />
          <StatCard
            title="Inspections (open)"
            value={summary?.inspectionOpen ?? 0}
            icon="ClipboardCheck"
            iconColor="#0FB9B1"
            variant="info"
            subtitle={`${summary?.inspectionTotal ?? 0} total`}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card">
            <h3 className="font-semibold text-charcoal mb-4 flex items-center gap-2">
              <TrendingUpIcon className="w-5 h-5 text-teal" />
              Incident trends (12 months)
            </h3>
            {loading ? (
              <p className="text-sm text-charcoal-500">Loading…</p>
            ) : (
              <TrendChart
                title=""
                type="line"
                height={260}
                data={summary?.trendData ?? []}
              />
            )}
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card">
            <h3 className="font-semibold text-charcoal mb-4 flex items-center gap-2">
              <AlertOctagonIcon className="w-5 h-5 text-amber-600" />
              Risk heatmap
            </h3>
            {loading ? (
              <p className="text-sm text-charcoal-500">Loading…</p>
            ) : (
              <RiskHeatMap data={summary?.heatMapData ?? []} />
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <a
            href="/reports"
            className="flex items-center justify-between p-5 bg-white rounded-xl border border-surface-300 shadow-card hover:shadow-card-hover transition-all"
          >
            <div className="flex items-center gap-3">
              <BarChart3Icon className="w-8 h-8 text-teal" />
              <span className="font-medium text-charcoal">Reports</span>
            </div>
            <ArrowRightIcon className="w-5 h-5 text-charcoal-400" />
          </a>
          <a
            href="/audits"
            className="flex items-center justify-between p-5 bg-white rounded-xl border border-surface-300 shadow-card hover:shadow-card-hover transition-all"
          >
            <div className="flex items-center gap-3">
              <ScaleIcon className="w-8 h-8 text-navy" />
              <span className="font-medium text-charcoal">Audit status</span>
            </div>
            <ArrowRightIcon className="w-5 h-5 text-charcoal-400" />
          </a>
          <a
            href="/users"
            className="flex items-center justify-between p-5 bg-white rounded-xl border border-surface-300 shadow-card hover:shadow-card-hover transition-all"
          >
            <div className="flex items-center gap-3">
              <Building2Icon className="w-8 h-8 text-charcoal-500" />
              <span className="font-medium text-charcoal">Appoint admins</span>
            </div>
            <ArrowRightIcon className="w-5 h-5 text-charcoal-400" />
          </a>
        </div>
      </motion.div>
    </Layout>
  );
}
