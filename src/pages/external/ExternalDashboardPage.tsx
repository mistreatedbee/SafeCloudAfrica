import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ShieldCheckIcon,
  ShieldIcon,
  UsersIcon,
  ScaleIcon,
  AwardIcon,
  HeartIcon,
  LeafIcon,
  FolderIcon,
  LockIcon,
  PackageIcon,
  FlaskConicalIcon,
  FileTextIcon,
  SearchIcon,
  CalendarIcon,
  AlertCircleIcon
} from 'lucide-react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useIdentity } from '../../hooks/useIdentity';
import { SELLABLE_FEATURE_ROUTE_PATHS } from '../../api/services/sellableFeaturesService';
import type { ModuleKey } from '../../api/models/core';

type ModuleCardConfig = {
  label: string;
  description: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  colorBg: string;
  colorIcon: string;
};

const MODULE_CARD_MAP: Record<ModuleKey, ModuleCardConfig> = {
  safety: {
    label: 'Safety',
    description: 'Incidents, toolbox talks, permit to work, LOTO',
    path: '/modules/safety',
    icon: ShieldIcon,
    colorBg: 'bg-red-50',
    colorIcon: 'text-red-600',
  },
  hr: {
    label: 'Human Resources',
    description: 'Employees, leave, hours worked, HR documents',
    path: '/dashboard/hr',
    icon: UsersIcon,
    colorBg: 'bg-blue-50',
    colorIcon: 'text-blue-600',
  },
  legal: {
    label: 'Legal',
    description: 'Legal register, contracts, compliance documents',
    path: '/dashboard/legal/register',
    icon: ScaleIcon,
    colorBg: 'bg-purple-50',
    colorIcon: 'text-purple-600',
  },
  quality: {
    label: 'Quality',
    description: 'NCRs, complaints, calibration, quality documents',
    path: '/modules/quality',
    icon: AwardIcon,
    colorBg: 'bg-green-50',
    colorIcon: 'text-green-600',
  },
  health: {
    label: 'Occupational Health',
    description: 'Medical surveillance, exposure monitoring, wellness',
    path: '/dashboard/health',
    icon: HeartIcon,
    colorBg: 'bg-pink-50',
    colorIcon: 'text-pink-600',
  },
  environment: {
    label: 'Environment',
    description: 'Aspects & impacts, monitoring, environmental controls',
    path: '/dashboard/environment',
    icon: LeafIcon,
    colorBg: 'bg-emerald-50',
    colorIcon: 'text-emerald-600',
  },
  general: {
    label: 'General',
    description: 'General documents, records and shared resources',
    path: '/modules/general',
    icon: FolderIcon,
    colorBg: 'bg-slate-50',
    colorIcon: 'text-slate-600',
  },
  security: {
    label: 'Security',
    description: 'Security management and access controls',
    path: '/modules/security',
    icon: LockIcon,
    colorBg: 'bg-orange-50',
    colorIcon: 'text-orange-600',
  },
  asset_management: {
    label: 'Asset Management',
    description: 'Asset register, maintenance and tracking',
    path: SELLABLE_FEATURE_ROUTE_PATHS.assetManagement,
    icon: PackageIcon,
    colorBg: 'bg-yellow-50',
    colorIcon: 'text-yellow-600',
  },
  hazardous_chemical_management: {
    label: 'Hazardous Chemicals',
    description: 'Chemical register, SDS and exposure controls',
    path: SELLABLE_FEATURE_ROUTE_PATHS.hazardousChemicals,
    icon: FlaskConicalIcon,
    colorBg: 'bg-amber-50',
    colorIcon: 'text-amber-600',
  },
};

function formatExpiry(expiresAt: string): { label: string; expired: boolean } {
  const date = new Date(expiresAt);
  const now = new Date();
  const daysLeft = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const formatted = date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });

  if (daysLeft < 0) return { label: `Access expired on ${formatted}`, expired: true };
  if (daysLeft === 0) return { label: `Access expires today (${formatted})`, expired: false };
  if (daysLeft <= 7) return { label: `Access expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} — ${formatted}`, expired: false };
  return { label: `Access valid until ${formatted}`, expired: false };
}

export function ExternalDashboardPage() {
  const { activeRole, activeMembership, consultantAllowedModules } = useTenant();
  const { organisationName } = useIdentity();

  const isAuditor = activeRole === 'auditor';
  const scope = activeMembership?.consultant_scope ?? null;
  const expiryInfo = scope?.expiresAt ? formatExpiry(scope.expiresAt) : null;
  const hasModules = consultantAllowedModules.length > 0;

  return (
    <Layout title={isAuditor ? 'Auditor Dashboard' : 'Consultant Dashboard'}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        {/* Access summary banner */}
        <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-teal-50 flex-shrink-0">
              <ShieldCheckIcon className="w-8 h-8 text-teal" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-charcoal">
                {isAuditor ? 'Auditor' : 'Consultant'} access
                {organisationName ? ` — ${organisationName}` : ''}
              </h2>
              <p className="text-sm text-charcoal-500 mt-1">
                You have scoped access. Navigation, modules, and data are restricted to what the
                organisation administrator has configured for your account. All actions are logged.
              </p>
              {expiryInfo && (
                <p className={`text-xs mt-2 font-medium inline-flex items-center gap-1 ${expiryInfo.expired ? 'text-red-600' : 'text-charcoal-400'}`}>
                  {expiryInfo.expired && <AlertCircleIcon className="w-3.5 h-3.5" />}
                  {expiryInfo.label}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Dynamically rendered assigned-module cards */}
        {hasModules ? (
          <>
            <div>
              <p className="text-xs font-semibold text-charcoal-400 uppercase tracking-wider mb-3 px-1">
                Your assigned modules ({consultantAllowedModules.length})
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {consultantAllowedModules.map((moduleKey) => {
                  const card = MODULE_CARD_MAP[moduleKey];
                  if (!card) return null;
                  return (
                    <Link
                      key={moduleKey}
                      to={card.path}
                      className="flex items-center gap-4 p-5 bg-white rounded-xl border border-surface-300 shadow-card hover:shadow-card-hover transition-all"
                    >
                      <div className={`p-3 rounded-lg flex-shrink-0 ${card.colorBg}`}>
                        <card.icon className={`w-6 h-6 ${card.colorIcon}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-charcoal">{card.label}</p>
                        <p className="text-sm text-charcoal-500 line-clamp-2">{card.description}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Always-available quick actions */}
            <div>
              <p className="text-xs font-semibold text-charcoal-400 uppercase tracking-wider mb-3 px-1">
                Quick actions
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <Link
                  to="/documents"
                  className="flex items-center gap-4 p-5 bg-white rounded-xl border border-surface-300 shadow-card hover:shadow-card-hover transition-all"
                >
                  <div className="p-3 rounded-lg bg-teal-50 flex-shrink-0">
                    <FileTextIcon className="w-6 h-6 text-teal" />
                  </div>
                  <div>
                    <p className="font-medium text-charcoal">Documents</p>
                    <p className="text-sm text-charcoal-500">Assigned documents and uploads</p>
                  </div>
                </Link>

                <Link
                  to="/dashboard/operations/audits"
                  className="flex items-center gap-4 p-5 bg-white rounded-xl border border-surface-300 shadow-card hover:shadow-card-hover transition-all"
                >
                  <div className="p-3 rounded-lg bg-navy/10 flex-shrink-0">
                    <SearchIcon className="w-6 h-6 text-navy" />
                  </div>
                  <div>
                    <p className="font-medium text-charcoal">Audits</p>
                    <p className="text-sm text-charcoal-500">View and conduct assigned audits</p>
                  </div>
                </Link>

                {scope?.allowedDepartments && scope.allowedDepartments.length > 0 && (
                  <div className="flex items-center gap-4 p-5 bg-white rounded-xl border border-surface-300 shadow-card">
                    <div className="p-3 rounded-lg bg-blue-50 flex-shrink-0">
                      <CalendarIcon className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium text-charcoal">Departments in scope</p>
                      <p className="text-sm text-charcoal-500">
                        {scope.allowedDepartments.length} department
                        {scope.allowedDepartments.length !== 1 ? 's' : ''} configured
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          /* No modules assigned yet */
          <div className="rounded-xl border border-surface-200 bg-surface-50 p-8 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-surface-200 flex items-center justify-center mb-4">
              <ShieldCheckIcon className="w-6 h-6 text-charcoal-400" />
            </div>
            <p className="font-semibold text-charcoal">No modules assigned</p>
            <p className="text-sm text-charcoal-500 mt-1 max-w-sm mx-auto">
              The organisation administrator has not yet configured your access scope.
              Contact them to request the modules you need access to.
            </p>
          </div>
        )}

        <div className="rounded-lg bg-surface-100 border border-surface-200 px-4 py-3 text-sm text-charcoal-600">
          The sidebar and this page reflect only your assigned scope. If a module is missing, ask the organisation
          administrator to update your access in the External Access settings.
        </div>
      </motion.div>
    </Layout>
  );
}
