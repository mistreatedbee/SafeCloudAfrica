import React, { useEffect, useMemo, useState, type ComponentType } from 'react';
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
  PanelLeftCloseIcon,
  CloudIcon,
  CreditCardIcon,
  IdCardIcon,
  PackageIcon,
  FlaskConicalIcon,
  BriefcaseIcon
} from 'lucide-react';
import { useTenant } from '../../tenant/TenantContext';
import type { CompanyRole, ModuleKey } from '../../api/models/core';
import type { SellableFeatureKey } from '../../api/services/sellableFeaturesService';
import { SELLABLE_FEATURE_ROUTE_PATHS } from '../../api/services/sellableFeaturesService';
import { getDashboardRoute } from '../../api/services/platformAdminService';

type NavItem = {
  name: string;
  path?: string;
  icon: ComponentType<{ className?: string }>;
  roles?: CompanyRole[];
  module?: ModuleKey;
  sellableFeatureKey?: SellableFeatureKey;
  comingSoon?: boolean;
};

type NavGroup = {
  id: string;
  name: string;
  icon: ComponentType<{ className?: string }>;
  roles?: CompanyRole[];
  module?: ModuleKey;
  items: NavItem[];
};

const GROUP_STORAGE_KEY = 'safecloud.sidebar.management-groups.v1';

const managementRoles: CompanyRole[] = ['owner', 'admin', 'manager', 'supervisor'];
const ncrRoles: CompanyRole[] = ['owner', 'admin', 'manager', 'supervisor', 'consultant', 'auditor', 'employee'];
const adminOnlyRoles: CompanyRole[] = ['owner', 'admin'];
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

const managementGroups: NavGroup[] = [
  {
    id: 'incidents',
    name: 'Incidents',
    icon: AlertTriangleIcon,
    module: 'safety',
    items: [
      { name: 'Incident Management', path: '/dashboard/incidents/management', icon: AlertTriangleIcon },
      { name: 'Incident Analysis', path: '/dashboard/incidents/analysis', icon: BarChart3Icon, roles: managementRoles },
      { name: 'Investigation / Corrective Actions', path: '/dashboard/management/tasks?view=capa', icon: ClipboardCheckIcon, roles: managementRoles }
    ]
  },
  {
    id: 'hr',
    name: 'HR',
    icon: UsersIcon,
    module: 'hr',
    roles: managementRoles,
    items: [
      { name: 'HR Dashboard', path: '/dashboard/hr', icon: UsersIcon },
      { name: 'Employees', path: '/dashboard/hr/employees', icon: IdCardIcon },
      { name: 'Leave', path: '/dashboard/hr/leave', icon: CalendarIcon },
      { name: 'Hours Worked', path: '/dashboard/hr/hours', icon: ClockIcon },
      { name: 'Payroll / Salaries', icon: CreditCardIcon, comingSoon: true },
      { name: 'HR Documents / Policies', path: '/dashboard/hr/documents', icon: FileTextIcon }
    ]
  },
  {
    id: 'health',
    name: 'Health',
    icon: HeartIcon,
    module: 'health',
    roles: managementRoles,
    items: [
      { name: 'Health Dashboard', path: '/dashboard/health', icon: HeartIcon },
      { name: 'Medical Surveillance', path: '/dashboard/health/medical', icon: CalendarIcon },
      { name: 'Exposure Monitoring', path: '/dashboard/health/hygiene', icon: ClipboardCheckIcon },
      { name: 'IOD / Health Incidents', path: '/dashboard/incidents/management?module=health', icon: AlertCircleIcon },
      { name: 'Psychosocial Support', path: '/dashboard/health/wellness', icon: UsersIcon }
    ]
  },
  {
    id: 'environment',
    name: 'Environment',
    icon: LeafIcon,
    module: 'environment',
    roles: managementRoles,
    items: [
      { name: 'Environmental Dashboard', path: '/dashboard/environment', icon: LeafIcon },
      { name: 'Aspects & Impacts Register (EAIR)', path: '/dashboard/environment/eia', icon: BookOpenIcon },
      { name: 'EMP / Operational Controls', path: '/dashboard/environment/risk-opportunity', icon: ClipboardCheckIcon },
      { name: 'Monitoring - Water', path: '/dashboard/environment/water', icon: CalendarIcon },
      { name: 'Monitoring - Air', path: '/dashboard/environment/air', icon: CalendarIcon },
      { name: 'Monitoring - Waste', path: '/dashboard/environment/waste', icon: CalendarIcon },
      { name: 'Environmental Inspections', path: '/dashboard/operations/inspections', icon: SearchIcon }
    ]
  },
  {
    id: 'safety-management',
    name: 'Safety Management',
    icon: ShieldIcon,
    module: 'safety',
    roles: managementRoles,
    items: [
      { name: 'Safety Dashboard', path: '/modules/safety', icon: ShieldIcon },
      { name: 'Policies / Plans / Procedures / Manuals', path: '/documents?module=safety', icon: FileTextIcon },
      { name: 'Meetings & Minutes', path: '/dashboard/management/document-reviews', icon: CalendarIcon },
      { name: 'Suppliers / Contractor Safety', path: SELLABLE_FEATURE_ROUTE_PATHS.contractorsVisitors, icon: UsersIcon, sellableFeatureKey: 'contractorsVisitors' }
    ]
  },
  {
    id: 'legal',
    name: 'Legal',
    icon: ScaleIcon,
    module: 'legal',
    roles: managementRoles,
    items: [
      { name: 'Legal Register / Requirements', path: '/dashboard/legal/register', icon: BookOpenIcon },
      { name: 'Contracts & Agreements', path: '/documents?category=contracts', icon: FileTextIcon },
      { name: 'Compliance & Governance Docs', path: '/dashboard/legal/updates', icon: ClipboardCheckIcon }
    ]
  },
  {
    id: 'quality',
    name: 'Quality',
    icon: AwardIcon,
    module: 'quality',
    roles: managementRoles,
    items: [
      { name: 'Quality Dashboard', path: '/modules/quality', icon: AwardIcon },
      { name: 'Non-Conformance (NCR)', path: '/dashboard/management/ncrs', icon: AlertTriangleIcon, roles: ncrRoles },
      { name: 'Customer Complaint Log', path: '/dashboard/quality/complaints', icon: AlertCircleIcon },
      { name: 'Internal/External Issues', path: '/dashboard/quality/issues', icon: AlertOctagonIcon },
      { name: 'Calibration', path: '/dashboard/quality/calibration', icon: ClipboardCheckIcon },
      { name: 'Quality Docs / SOPs', path: '/documents?module=quality', icon: FileTextIcon }
    ]
  },
  {
    id: 'cross-management',
    name: 'Management',
    icon: BriefcaseIcon,
    items: [
      { name: 'Task Manager', path: '/dashboard/management/tasks?view=tasks', icon: ClipboardCheckIcon },
      { name: 'Tasks / CAPA', path: '/dashboard/management/tasks', icon: ClipboardCheckIcon },
      { name: 'NCR / Non-Conformance Report', path: '/dashboard/management/ncrs', icon: AlertTriangleIcon, roles: ncrRoles },
      { name: 'KPI', path: '/modules/hr/kpis', icon: TrendingUpIcon, roles: managementRoles, module: 'hr' },
      { name: 'Document Reviews', path: '/dashboard/management/document-reviews', icon: CalendarIcon },
      { name: 'Reports / Exports', path: '/dashboard/management/reports', icon: BarChart3Icon, roles: managementRoles },
      { name: 'Planning & Review', path: '/dashboard/management/planning', icon: ClipboardCheckIcon, roles: managementRoles },
      { name: 'Improvement', path: '/dashboard/management/improvement', icon: TrendingUpIcon, roles: managementRoles },
      { name: 'Approvals', path: '/dashboard/management/approvals', icon: LockIcon, roles: managementRoles },
      { name: 'Hours Worked', path: '/dashboard/management/hours-worked', icon: ClockIcon, roles: managementRoles },
      { name: 'Operational Inputs', path: '/dashboard/management/operational-inputs', icon: BarChart3Icon, roles: managementRoles },
      { name: 'PJO', path: '/dashboard/operations/pjo', icon: ClipboardCheckIcon, roles: managementRoles },
      { name: 'Audits', path: '/dashboard/operations/audits', icon: SearchIcon },
      { name: 'Inspections', path: '/dashboard/operations/inspections', icon: ClipboardCheckIcon, roles: managementRoles },
      { name: 'Risk Management', path: '/dashboard/operations/risks', icon: AlertOctagonIcon },
      { name: 'PPE Management', path: '/dashboard/operations/ppe', icon: HardHatIcon },
      { name: 'Training', path: '/dashboard/operations/training', icon: GraduationCapIcon }
    ]
  }
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
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
};

function dashboardPathForRole(role: CompanyRole | null): string {
  if (!role) return '/app';
  return getDashboardRoute(role);
}

function isRoleVisible(roles: CompanyRole[] | undefined, activeRole: CompanyRole | null): boolean {
  if (!activeRole || !roles || roles.length === 0) return true;
  return roles.includes(activeRole);
}

function isModuleVisible(module: ModuleKey | undefined, enabledModules: ModuleKey[]): boolean {
  if (!module) return true;
  if (!enabledModules.length) return true;
  return enabledModules.includes(module);
}

export function Sidebar({ isOpen, onClose, isCollapsed, onToggleCollapsed }: SidebarProps) {
  const [modulesExpanded, setModulesExpanded] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const location = useLocation();
  const { activeRole, enabledModules, sellableFeatures: sellableFeatureConfig } = useTenant();

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(GROUP_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      if (parsed && typeof parsed === 'object') setExpandedGroups(parsed);
    } catch {
      // Ignore localStorage errors.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(GROUP_STORAGE_KEY, JSON.stringify(expandedGroups));
    } catch {
      // Ignore localStorage errors.
    }
  }, [expandedGroups]);

  const dashboardPath = useMemo(() => dashboardPathForRole(activeRole), [activeRole]);
  const filteredModules = useMemo(
    () => modules.filter((item) => isRoleVisible(item.roles, activeRole) && isModuleVisible(item.module, enabledModules)),
    [activeRole, enabledModules]
  );

  const filteredManagementGroups = useMemo(() => {
    return managementGroups
      .filter((group) => isRoleVisible(group.roles, activeRole) && isModuleVisible(group.module, enabledModules))
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (!isRoleVisible(item.roles, activeRole)) return false;
          if (!isModuleVisible(item.module, enabledModules)) return false;
          if (!item.sellableFeatureKey) return true;
          return sellableFeatureConfig[item.sellableFeatureKey].enabled;
        })
      }))
      .filter((group) => group.items.length > 0);
  }, [activeRole, enabledModules, sellableFeatureConfig]);

  const filteredSellable = useMemo(
    () =>
      sellableFeatures.filter((item) => {
        if (!isRoleVisible(item.roles, activeRole)) return false;
        if (!item.sellableFeatureKey) return true;
        return sellableFeatureConfig[item.sellableFeatureKey].enabled;
      }),
    [activeRole, sellableFeatureConfig]
  );

  const filteredSettings = useMemo(
    () => settingsItems.filter((item) => isRoleVisible(item.roles, activeRole)),
    [activeRole]
  );

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupId]: !(prev[groupId] ?? true)
    }));
  };

  const NavLinkItem = ({ item }: { item: NavItem }) => {
    const pathBase = item.path?.split('?')[0];
    const isActive = Boolean(pathBase) && (location.pathname === pathBase || location.pathname.startsWith(pathBase + '/'));
    const isSellableLocked = item.sellableFeatureKey ? sellableFeatureConfig[item.sellableFeatureKey].locked : false;

    if (item.comingSoon || !item.path) {
      return (
        <div className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium ${isCollapsed ? 'justify-center' : 'gap-3'} text-charcoal-400 bg-surface-100/60`}>
          <item.icon className="w-5 h-5 flex-shrink-0" />
          {!isCollapsed && <span className="truncate">{item.name}</span>}
          {!isCollapsed && (
            <span className="ml-auto inline-flex items-center rounded-full bg-surface-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-charcoal-500">
              Coming soon
            </span>
          )}
        </div>
      );
    }

    return (
      <NavLink
        to={item.path}
        onClick={() => window.innerWidth < 1024 && onClose()}
        title={isCollapsed ? item.name : undefined}
        className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isCollapsed ? 'justify-center' : 'gap-3'} ${isActive ? 'bg-teal/10 text-teal' : 'text-charcoal-500 hover:bg-surface-200 hover:text-charcoal'}`}
      >
        <item.icon className="w-5 h-5 flex-shrink-0" />
        {!isCollapsed && <span className="truncate">{item.name}</span>}
        {!isCollapsed && isSellableLocked && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
            <LockIcon className="w-3 h-3" />
            Locked
          </span>
        )}
      </NavLink>
    );
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-surface-300 min-w-0">
      <div className={`flex items-center px-5 py-4 border-b border-surface-200 ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-navy to-navy-700">
          <CloudIcon className="w-6 h-6 text-white" />
        </div>
        {!isCollapsed && (
          <div>
            <h1 className="font-bold text-navy text-lg leading-tight">Safe Cloud</h1>
            <p className="text-xs text-teal font-medium">Africa</p>
          </div>
        )}
        {!isCollapsed && (
          <button
            onClick={onToggleCollapsed}
            className="hidden lg:inline-flex ml-auto p-2 rounded-lg hover:bg-surface-100 text-charcoal-400"
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <PanelLeftCloseIcon className="w-5 h-5" />
          </button>
        )}
        <button
          onClick={onClose}
          className="lg:hidden ml-auto p-2 rounded-lg hover:bg-surface-100 text-charcoal-400"
          aria-label="Close menu"
        >
          <XIcon className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="mb-4">
          <NavLinkItem item={{ name: 'Dashboard', path: dashboardPath, icon: HomeIcon }} />
        </div>

        <div className="mb-4">
          <button
            onClick={() => setModulesExpanded(!modulesExpanded)}
            className={`flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-charcoal-400 uppercase tracking-wider hover:text-charcoal transition-colors ${isCollapsed ? 'hidden' : ''}`}
          >
            <span>Modules</span>
            {modulesExpanded ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
          </button>
          <AnimatePresence>
            {(isCollapsed || modulesExpanded) && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-1 space-y-0.5">
                  {filteredModules.map((item) => (
                    <NavLinkItem key={item.path} item={item} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="mb-4">
          <div className={`px-3 py-2 text-xs font-semibold text-charcoal-400 uppercase tracking-wider ${isCollapsed ? 'hidden' : ''}`}>
            Management
          </div>
          <div className="mt-1 space-y-1">
            {filteredManagementGroups.map((group) => {
              const hasActiveChild = group.items.some((item) => {
                if (!item.path) return false;
                const basePath = item.path.split('?')[0];
                return location.pathname === basePath || location.pathname.startsWith(basePath + '/');
              });
              const expanded = expandedGroups[group.id] ?? hasActiveChild;

              return (
                <div key={group.id} className="rounded-lg border border-surface-200 bg-surface-50/60">
                  <button
                    onClick={() => toggleGroup(group.id)}
                    className={`w-full flex items-center px-3 py-2 text-sm font-semibold text-charcoal-600 hover:bg-surface-100/80 rounded-lg ${isCollapsed ? 'justify-center' : 'gap-2'}`}
                    title={isCollapsed ? group.name : undefined}
                  >
                    <group.icon className="w-4 h-4 flex-shrink-0" />
                    {!isCollapsed && <span className="truncate">{group.name}</span>}
                    {!isCollapsed && (expanded ? <ChevronDownIcon className="w-4 h-4 ml-auto" /> : <ChevronRightIcon className="w-4 h-4 ml-auto" />)}
                  </button>
                  <AnimatePresence>
                    {(isCollapsed || expanded) && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden"
                      >
                        <div className="pb-2 px-2 space-y-0.5">
                          {group.items.map((item) => (
                            <NavLinkItem key={`${group.id}:${item.name}:${item.path ?? 'coming-soon'}`} item={item} />
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>

        {filteredSellable.length > 0 && (
          <div className="mb-4">
            <div className={`px-3 py-2 text-xs font-semibold text-charcoal-400 uppercase tracking-wider ${isCollapsed ? 'hidden' : ''}`}>
              Paid Programs
            </div>
            <div className="mt-1 space-y-0.5">
              {filteredSellable.map((item) => (
                <NavLinkItem key={item.path} item={item} />
              ))}
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-surface-200">
          <div className="space-y-0.5">
            {filteredSettings.map((item) => (
              <NavLinkItem key={item.path} item={item} />
            ))}
          </div>
        </div>
      </nav>

      <div className="px-4 py-3 border-t border-surface-200 bg-surface-50">
        {!isCollapsed && <p className="text-xs text-charcoal-400 text-center">(c) 2024 Safe Cloud Africa</p>}
      </div>
    </div>
  );

  return (
    <>
      <aside className={`hidden lg:flex lg:flex-shrink-0 lg:relative lg:z-40 transition-[width] duration-300 ease-in-out ${isCollapsed ? 'lg:w-[88px]' : 'lg:w-[280px]'}`}>
        {sidebarContent}
      </aside>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-navy/50 z-40 lg:hidden"
              onClick={onClose}
            />

            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="fixed inset-y-0 left-0 w-[280px] z-50 lg:hidden"
            >
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
