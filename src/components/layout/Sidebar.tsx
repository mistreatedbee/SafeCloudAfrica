import React, { useMemo, useState, type ComponentType } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HomeIcon,
  ShieldIcon,
  AwardIcon,
  LeafIcon,
  HeartIcon,
  ScaleIcon,
  UsersIcon,
  LockIcon,
  FolderIcon,
  FileTextIcon,
  ClipboardCheckIcon,
  AlertTriangleIcon,
  AlertCircleIcon,
  GraduationCapIcon,
  EyeIcon,
  SearchIcon,
  AlertOctagonIcon,
  HardHatIcon,
  BookOpenIcon,
  CalendarIcon,
  BarChart3Icon,
  TrendingUpIcon,
  SettingsIcon,
  ClockIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  XIcon,
  CloudIcon,
  CreditCardIcon,
  IdCardIcon,
  PackageIcon,
  FlaskConicalIcon
} from 'lucide-react';
import { useTenant } from '../../tenant/TenantContext';
import type { CompanyRole, ModuleKey } from '../../api/models/core';
import type { SellableFeatureKey } from '../../api/services/sellableFeaturesService';
import { SELLABLE_FEATURE_ROUTE_PATHS } from '../../api/services/sellableFeaturesService';

type NavItem = {
  name: string;
  path: string;
  icon: ComponentType<{ className?: string }>;
  /** Roles that can see this item (empty = all org roles). */
  roles?: CompanyRole[];
  /** If set, item is hidden when this module is disabled for the org. */
  module?: ModuleKey;
  sellableFeatureKey?: SellableFeatureKey;
};
/** Roles that can see management/analytics (not employee or external). */
const managementRoles: CompanyRole[] = ['owner', 'admin', 'manager', 'supervisor'];
/** Roles that can see admin-only items (users, license). */
const adminOnlyRoles: CompanyRole[] = ['owner', 'admin'];
/** Roles that can see full modules (not employee; consultant/auditor see limited via supporting). */
const moduleRoles: CompanyRole[] = ['owner', 'admin', 'manager', 'supervisor'];

const modules: NavItem[] = [
{ name: 'General', path: '/modules/general', icon: FolderIcon, roles: moduleRoles, module: 'general' },
{ name: 'Safety', path: '/modules/safety', icon: ShieldIcon, roles: moduleRoles, module: 'safety' },
{ name: 'Quality', path: '/modules/quality', icon: AwardIcon, roles: moduleRoles, module: 'quality' },
{ name: 'Environment', path: '/modules/environment', icon: LeafIcon, roles: moduleRoles, module: 'environment' },
{ name: 'Health', path: '/dashboard/health', icon: HeartIcon, roles: moduleRoles, module: 'health' },
{ name: 'Legal', path: '/modules/legal', icon: ScaleIcon, roles: moduleRoles, module: 'legal' },
{ name: 'HR', path: '/dashboard/hr', icon: UsersIcon, roles: moduleRoles, module: 'hr' },
{ name: 'Performance KPIs', path: '/modules/hr/kpis', icon: TrendingUpIcon, roles: moduleRoles, module: 'hr' },
{ name: 'Security', path: '/modules/security', icon: LockIcon, roles: moduleRoles, module: 'security' }
];

const supportingSections: NavItem[] = [
{ name: 'Documents', path: '/documents', icon: FileTextIcon },
{ name: 'Forms & Templates', path: '/forms', icon: FileTextIcon },
{ name: 'Non-Conformances (NCR)', path: '/ncrs', icon: AlertTriangleIcon, roles: managementRoles },
{ name: 'Customer Complaints', path: '/dashboard/quality/complaints', icon: AlertCircleIcon, roles: managementRoles, module: 'quality' },
{ name: 'Internal & External Issues', path: '/dashboard/quality/issues', icon: AlertOctagonIcon, roles: managementRoles, module: 'quality' },
{ name: 'Quality Calibration', path: '/dashboard/quality/calibration', icon: ClipboardCheckIcon, roles: managementRoles, module: 'quality' },
{ name: 'Plan Job Observations (PJO)', path: '/pjo', icon: ClipboardCheckIcon, roles: managementRoles },
{ name: 'Tasks & Time', path: '/tasks', icon: ClipboardCheckIcon },
{ name: 'Incidents', path: '/incidents', icon: AlertTriangleIcon },
{ name: 'Incident Analytics', path: '/incidents/analytics', icon: BarChart3Icon, roles: managementRoles, module: 'safety' },
{ name: 'Safety Statistics (KPI)', path: '/analytics/safety-statistics', icon: BarChart3Icon, roles: managementRoles, module: 'safety' },
{ name: 'Compliance & Performance', path: '/analytics/compliance', icon: BarChart3Icon, roles: managementRoles },
{ name: 'Quality KPIs', path: '/analytics/quality', icon: AwardIcon, roles: managementRoles, module: 'quality' },
{ name: 'Environmental KPIs', path: '/analytics/environmental', icon: LeafIcon, roles: managementRoles, module: 'environment' },
{ name: 'Environment Dashboard', path: '/dashboard/environment', icon: LeafIcon, roles: managementRoles, module: 'environment' },
{ name: 'Health Dashboard', path: '/dashboard/health', icon: HeartIcon, roles: managementRoles, module: 'health' },
{ name: 'HR Dashboard', path: '/dashboard/hr', icon: UsersIcon, roles: managementRoles, module: 'hr' },
{ name: 'HR Employees', path: '/dashboard/hr/employees', icon: IdCardIcon, roles: managementRoles, module: 'hr' },
{ name: 'HR Leave', path: '/dashboard/hr/leave', icon: CalendarIcon, roles: managementRoles, module: 'hr' },
{ name: 'HR Hours', path: '/dashboard/hr/hours', icon: ClockIcon, roles: managementRoles, module: 'hr' },
{ name: 'HR Labour', path: '/dashboard/hr/labour', icon: AlertTriangleIcon, roles: managementRoles, module: 'hr' },
{ name: 'Health Medical', path: '/dashboard/health/medical', icon: CalendarIcon, roles: managementRoles, module: 'health' },
{ name: 'Health Hygiene', path: '/dashboard/health/hygiene', icon: ClipboardCheckIcon, roles: managementRoles, module: 'health' },
{ name: 'Health Wellness', path: '/dashboard/health/wellness', icon: UsersIcon, roles: managementRoles, module: 'health' },
{ name: 'Health Calibration', path: '/dashboard/health/calibration', icon: ClipboardCheckIcon, roles: managementRoles, module: 'health' },
{ name: 'Environment EIA', path: '/dashboard/environment/eia', icon: BookOpenIcon, roles: managementRoles, module: 'environment' },
{ name: 'Env Risk & Opportunity', path: '/dashboard/environment/risk-opportunity', icon: AlertOctagonIcon, roles: managementRoles, module: 'environment' },
{ name: 'Env Waste Register', path: '/dashboard/environment/waste', icon: ClipboardCheckIcon, roles: managementRoles, module: 'environment' },
{ name: 'Env Water Monitoring', path: '/dashboard/environment/water', icon: CalendarIcon, roles: managementRoles, module: 'environment' },
{ name: 'Env Air Monitoring', path: '/dashboard/environment/air', icon: CalendarIcon, roles: managementRoles, module: 'environment' },
{ name: 'Environment Calibration', path: '/dashboard/environment/calibration', icon: ClipboardCheckIcon, roles: managementRoles, module: 'environment' },
{ name: 'Safety Calibration', path: '/dashboard/safety/calibration', icon: ClipboardCheckIcon, roles: managementRoles, module: 'safety' },
{ name: 'Training', path: '/training', icon: GraduationCapIcon },
{ name: 'Audits', path: '/audits', icon: SearchIcon },
{ name: 'Inspections', path: '/inspections', icon: ClipboardCheckIcon, roles: managementRoles },
{ name: 'Risk Management', path: '/risks/dashboard', icon: AlertOctagonIcon },
{ name: 'PPE Management', path: '/ppe', icon: HardHatIcon },
{ name: 'Legal Register', path: '/dashboard/legal/register', icon: BookOpenIcon, roles: managementRoles, module: 'legal' },
{ name: 'Legal Updates', path: '/dashboard/legal/updates', icon: CalendarIcon, roles: managementRoles, module: 'legal' },
{ name: 'Planning & Review', path: '/planning', icon: ClipboardCheckIcon, roles: managementRoles },
{ name: 'Approvals', path: '/approvals', icon: LockIcon, roles: managementRoles },
{ name: 'Document Reviews', path: '/document-reviews', icon: CalendarIcon },
{ name: 'Improvement', path: '/improvement', icon: TrendingUpIcon, roles: managementRoles },
{ name: 'Reports', path: '/reports', icon: BarChart3Icon, roles: managementRoles },
{ name: 'Hours Worked', path: '/management/hours-worked', icon: ClockIcon, roles: managementRoles },
{ name: 'Operational Inputs', path: '/management/operational-inputs', icon: BarChart3Icon, roles: managementRoles }
];

const sellableFeatures: NavItem[] = [
{ name: 'BBS Programme', path: SELLABLE_FEATURE_ROUTE_PATHS.bbs, icon: EyeIcon, roles: managementRoles, sellableFeatureKey: 'bbs' },
{ name: 'Contractors & Visitors', path: SELLABLE_FEATURE_ROUTE_PATHS.contractorsVisitors, icon: UsersIcon, roles: managementRoles, sellableFeatureKey: 'contractorsVisitors' },
{ name: 'Emergency Preparedness', path: SELLABLE_FEATURE_ROUTE_PATHS.emergencyPreparedness, icon: AlertTriangleIcon, roles: managementRoles, sellableFeatureKey: 'emergencyPreparedness' },
{ name: 'Template Library', path: SELLABLE_FEATURE_ROUTE_PATHS.templateLibrary, icon: FolderIcon, roles: managementRoles, sellableFeatureKey: 'templateLibrary' },
{ name: 'Asset Management', path: SELLABLE_FEATURE_ROUTE_PATHS.assetManagement, icon: PackageIcon, roles: managementRoles, sellableFeatureKey: 'assetManagement' },
{ name: 'Hazardous Chemical Management', path: SELLABLE_FEATURE_ROUTE_PATHS.hazardousChemicals, icon: FlaskConicalIcon, roles: managementRoles, sellableFeatureKey: 'hazardousChemicals' }
];

const settingsItems: NavItem[] = [
{ name: 'Settings', path: '/settings', icon: SettingsIcon, roles: adminOnlyRoles },
{ name: 'Billing & Pricing', path: '/billing', icon: CreditCardIcon, roles: adminOnlyRoles },
{ name: 'License', path: '/admin/license', icon: CreditCardIcon, roles: adminOnlyRoles },
{ name: 'User Management', path: '/users', icon: UsersIcon, roles: adminOnlyRoles }
];

type SidebarProps = {
  isOpen: boolean;
  onClose: () => void;
};
function dashboardPathForRole(role: CompanyRole | null): string {
  if (!role) return '/app';
  const map: Record<CompanyRole, string> = {
    owner: '/owner',
    admin: '/admin',
    manager: '/manager',
    supervisor: '/manager',
    employee: '/employee',
    consultant: '/external',
    auditor: '/external'
  };
  return map[role] ?? '/app';
}

function filterByRole<T extends { roles?: CompanyRole[] }>(items: T[], activeRole: CompanyRole | null): T[] {
  if (!activeRole) return items;
  return items.filter((item) => {
    if (!item.roles || item.roles.length === 0) return true;
    return item.roles.includes(activeRole);
  });
}

function filterByEnabledModules<T extends { module?: ModuleKey }>(items: T[], enabledModules: ModuleKey[]): T[] {
  if (!enabledModules.length) return items;
  return items.filter((item) => {
    if (!item.module) return true;
    return enabledModules.includes(item.module);
  });
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const [modulesExpanded, setModulesExpanded] = useState(true);
  const location = useLocation();
  const { activeRole, enabledModules, sellableFeatures: sellableFeatureConfig } = useTenant();

  const dashboardPath = useMemo(() => dashboardPathForRole(activeRole), [activeRole]);
  const filteredModules = useMemo(
    () => filterByEnabledModules(filterByRole(modules, activeRole), enabledModules),
    [activeRole, enabledModules]
  );
  const filteredSupporting = useMemo(
    () => filterByEnabledModules(filterByRole(supportingSections, activeRole), enabledModules),
    [activeRole, enabledModules]
  );
  const filteredSellable = useMemo(
    () =>
      filterByRole(sellableFeatures, activeRole).filter((item) => {
        if (!item.sellableFeatureKey) return true;
        return sellableFeatureConfig[item.sellableFeatureKey].enabled;
      }),
    [activeRole, sellableFeatureConfig]
  );
  const filteredSettings = useMemo(() => filterByRole(settingsItems, activeRole), [activeRole]);

  const NavLinkItem = ({ item }: { item: NavItem }) => {
    const isActive =
      location.pathname === item.path ||
      location.pathname.startsWith(item.path + '/');
    const isSellableLocked = item.sellableFeatureKey ? sellableFeatureConfig[item.sellableFeatureKey].locked : false;
    return (
      <NavLink
        to={item.path}
        onClick={() => window.innerWidth < 1024 && onClose()}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-teal/10 text-teal' : 'text-charcoal-500 hover:bg-surface-200 hover:text-charcoal'}`}
      >
        <item.icon className="w-5 h-5 flex-shrink-0" />
        <span className="truncate">{item.name}</span>
        {isSellableLocked && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
            <LockIcon className="w-3 h-3" />
            Locked
          </span>
        )}
      </NavLink>
    );
  };

  const sidebarContent =
  <div className="flex flex-col h-full bg-white border-r border-surface-300">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-200">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-navy to-navy-700">
          <CloudIcon className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="font-bold text-navy text-lg leading-tight">
            Safe Cloud
          </h1>
          <p className="text-xs text-teal font-medium">Africa</p>
        </div>
        <button
        onClick={onClose}
        className="lg:hidden ml-auto p-2 rounded-lg hover:bg-surface-100 text-charcoal-400"
        aria-label="Close menu">

          <XIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {/* Home */}
        <div className="mb-4">
          <NavLinkItem
            item={{
              name: 'Dashboard',
              path: dashboardPath,
              icon: HomeIcon
            }}
          />
        </div>

        {/* Modules Section */}
        <div className="mb-4">
          <button
          onClick={() => setModulesExpanded(!modulesExpanded)}
          className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-charcoal-400 uppercase tracking-wider hover:text-charcoal transition-colors">

            <span>Modules</span>
            {modulesExpanded ?
          <ChevronDownIcon className="w-4 h-4" /> :

          <ChevronRightIcon className="w-4 h-4" />
          }
          </button>
          <AnimatePresence>
            {modulesExpanded &&
          <motion.div
            initial={{
              height: 0,
              opacity: 0
            }}
            animate={{
              height: 'auto',
              opacity: 1
            }}
            exit={{
              height: 0,
              opacity: 0
            }}
            transition={{
              duration: 0.2
            }}
            className="overflow-hidden">

                <div className="mt-1 space-y-0.5">
                  {filteredModules.map((item) => (
                    <NavLinkItem key={item.path} item={item} />
                  ))}
                </div>
              </motion.div>
          }
          </AnimatePresence>
        </div>

        {/* Supporting Sections */}
        <div className="mb-4">
          <div className="px-3 py-2 text-xs font-semibold text-charcoal-400 uppercase tracking-wider">
            Management
          </div>
          <div className="mt-1 space-y-0.5">
            {filteredSupporting.map((item) => (
              <NavLinkItem key={item.path} item={item} />
            ))}
          </div>
        </div>

        {/* Sellable Features */}
        {filteredSellable.length > 0 && (
          <div className="mb-4">
            <div className="px-3 py-2 text-xs font-semibold text-charcoal-400 uppercase tracking-wider">
              Sellable Features
            </div>
            <div className="mt-1 space-y-0.5">
              {filteredSellable.map((item) => (
                <NavLinkItem key={item.path} item={item} />
              ))}
            </div>
          </div>
        )}

        {/* Settings */}
        <div className="pt-4 border-t border-surface-200">
          <div className="space-y-0.5">
            {filteredSettings.map((item) => (
              <NavLinkItem key={item.path} item={item} />
            ))}
          </div>
        </div>
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-surface-200 bg-surface-50">
        <p className="text-xs text-charcoal-400 text-center">
          © 2024 Safe Cloud Africa
        </p>
      </div>
    </div>;

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-shrink-0 lg:w-[280px] lg:relative lg:z-40">
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isOpen &&
        <>
            <motion.div
            initial={{
              opacity: 0
            }}
            animate={{
              opacity: 1
            }}
            exit={{
              opacity: 0
            }}
            transition={{
              duration: 0.2
            }}
            className="fixed inset-0 bg-navy/50 z-40 lg:hidden"
            onClick={onClose} />

            <motion.aside
            initial={{
              x: -280
            }}
            animate={{
              x: 0
            }}
            exit={{
              x: -280
            }}
            transition={{
              duration: 0.2,
              ease: 'easeOut'
            }}
            className="fixed inset-y-0 left-0 w-[280px] z-50 lg:hidden">

              {sidebarContent}
            </motion.aside>
          </>
        }
      </AnimatePresence>
    </>);

}
