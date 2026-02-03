import React, { useState, type ComponentType } from 'react';
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
  ChevronDownIcon,
  ChevronRightIcon,
  XIcon,
  CloudIcon } from
'lucide-react';
type NavItem = {
  name: string;
  path: string;
  icon: ComponentType<{
    className?: string;
  }>;
};
const modules: NavItem[] = [
{
  name: 'General',
  path: '/modules/general',
  icon: FolderIcon
},
{
  name: 'Safety',
  path: '/modules/safety',
  icon: ShieldIcon
},
{
  name: 'Quality',
  path: '/modules/quality',
  icon: AwardIcon
},
{
  name: 'Environment',
  path: '/modules/environment',
  icon: LeafIcon
},
{
  name: 'Health',
  path: '/modules/health',
  icon: HeartIcon
},
{
  name: 'Legal',
  path: '/modules/legal',
  icon: ScaleIcon
},
{
  name: 'HR',
  path: '/modules/hr',
  icon: UsersIcon
},
{
  name: 'Security',
  path: '/modules/security',
  icon: LockIcon
}];

const supportingSections: NavItem[] = [
{
  name: 'Documents',
  path: '/documents',
  icon: FileTextIcon
},
{
  name: 'Tasks & Time',
  path: '/tasks',
  icon: ClipboardCheckIcon
},
{
  name: 'Incidents',
  path: '/incidents',
  icon: AlertTriangleIcon
},
{
  name: 'Training',
  path: '/training',
  icon: GraduationCapIcon
},
{
  name: 'Audits',
  path: '/audits',
  icon: SearchIcon
},
{
  name: 'Risk Management',
  path: '/risks',
  icon: AlertOctagonIcon
},
{
  name: 'PPE Management',
  path: '/ppe',
  icon: HardHatIcon
},
{
  name: 'Legal Register',
  path: '/legal-register',
  icon: BookOpenIcon
},
{
  name: 'Planning & Review',
  path: '/planning',
  icon: ClipboardCheckIcon
},
{
  name: 'Approvals',
  path: '/approvals',
  icon: LockIcon
},
{
  name: 'Document Reviews',
  path: '/document-reviews',
  icon: CalendarIcon
},
{
  name: 'Improvement',
  path: '/improvement',
  icon: TrendingUpIcon
},
{
  name: 'Reports',
  path: '/reports',
  icon: BarChart3Icon
}];

const sellableFeatures: NavItem[] = [
{
  name: 'BBS Programme',
  path: '/bbs',
  icon: EyeIcon
},
{
  name: 'Contractors & Visitors',
  path: '/contractors',
  icon: UsersIcon
},
{
  name: 'Emergency Preparedness',
  path: '/emergency',
  icon: AlertTriangleIcon
},
{
  name: 'Template Library',
  path: '/templates',
  icon: FolderIcon
}];

const settingsItems: NavItem[] = [
{
  name: 'Settings',
  path: '/settings',
  icon: SettingsIcon
},
{
  name: 'User Management',
  path: '/users',
  icon: UsersIcon
}];

type SidebarProps = {
  isOpen: boolean;
  onClose: () => void;
};
export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const [modulesExpanded, setModulesExpanded] = useState(true);
  const location = useLocation();
  const NavLinkItem = ({ item }: {item: NavItem;}) => {
    const isActive =
    location.pathname === item.path ||
    location.pathname.startsWith(item.path + '/');
    return (
      <NavLink
        to={item.path}
        onClick={() => window.innerWidth < 1024 && onClose()}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-teal/10 text-teal' : 'text-charcoal-500 hover:bg-surface-200 hover:text-charcoal'}`}>

        <item.icon className="w-5 h-5 flex-shrink-0" />
        <span>{item.name}</span>
      </NavLink>);

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
            path: '/app',
            icon: HomeIcon
          }} />

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
                  {modules.map((item) =>
              <NavLinkItem key={item.path} item={item} />
              )}
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
            {supportingSections.map((item) =>
          <NavLinkItem key={item.path} item={item} />
          )}
          </div>
        </div>

        {/* Sellable Features */}
        <div className="mb-4">
          <div className="px-3 py-2 text-xs font-semibold text-charcoal-400 uppercase tracking-wider">
            Sellable Features
          </div>
          <div className="mt-1 space-y-0.5">
            {sellableFeatures.map((item) =>
          <NavLinkItem key={item.path} item={item} />
          )}
          </div>
        </div>

        {/* Settings */}
        <div className="pt-4 border-t border-surface-200">
          <div className="space-y-0.5">
            {settingsItems.map((item) =>
          <NavLinkItem key={item.path} item={item} />
          )}
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
      <aside className="hidden lg:flex lg:flex-shrink-0 lg:w-[280px]">
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