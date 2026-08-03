import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboardIcon,
  Building2Icon,
  CreditCardIcon,
  ToggleLeftIcon,
  LockIcon,
  FileTextIcon,
  HeadphonesIcon,
  MessageSquareTextIcon,
  XIcon,
  ShieldCheckIcon,
  ActivityIcon,
  SparklesIcon
} from 'lucide-react';

const superAdminNav: { name: string; path: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { name: 'System Overview', path: '/super-admin/overview', icon: LayoutDashboardIcon },
  { name: 'Organizations', path: '/super-admin/organisations', icon: Building2Icon },
  { name: 'Licenses & Subscriptions', path: '/super-admin/licenses', icon: CreditCardIcon },
  { name: 'Module Controls', path: '/super-admin/module-control', icon: ToggleLeftIcon },
  { name: 'Sellable Features', path: '/super-admin/sellable-features', icon: LockIcon },
  { name: 'AI Governance', path: '/super-admin/ai-governance', icon: SparklesIcon },
  { name: 'Chatbot Logs', path: '/super-admin/chatbot-logs', icon: MessageSquareTextIcon },
  { name: 'Support Tickets', path: '/super-admin/support-tickets', icon: HeadphonesIcon },
  { name: 'License Requests', path: '/super-admin/license-requests', icon: CreditCardIcon },
  { name: 'Module Requests', path: '/super-admin/module-requests', icon: ToggleLeftIcon },
  { name: 'Platform Audit Logs', path: '/super-admin/audit-logs', icon: FileTextIcon },
  { name: 'Platform health', path: '/super-admin/platform-health', icon: ActivityIcon },
  { name: 'Support Mode', path: '/super-admin/support-mode', icon: HeadphonesIcon }
];

export function SuperAdminSidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const sidebarContent = (
    <nav className="flex flex-col h-full">
      <div className="p-4 border-b border-surface-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheckIcon className="w-6 h-6 text-teal" />
          <span className="font-semibold text-navy">Super Admin</span>
        </div>
        <button
          onClick={onClose}
          className="lg:hidden p-2 rounded-lg text-charcoal-500 hover:bg-surface-100"
          aria-label="Close menu"
        >
          <XIcon className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        <div className="px-3 py-2 text-xs font-semibold text-charcoal-400 uppercase tracking-wider">
          Platform
        </div>
        <div className="mt-1 space-y-0.5">
          {superAdminNav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive ? 'bg-teal/10 text-teal' : 'text-charcoal-600 hover:bg-surface-100 hover:text-charcoal'
                  }`
                }
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {item.name}
              </NavLink>
            );
          })}
        </div>
      </div>
    </nav>
  );

  return (
    <>
      <aside className="hidden lg:flex lg:flex-shrink-0 lg:w-[260px] lg:flex-col lg:relative lg:z-40 border-r border-surface-200 bg-white">
        {sidebarContent}
      </aside>
      <AnimatePresence>
        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-charcoal/50 lg:hidden"
              onClick={onClose}
              aria-hidden
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'tween', duration: 0.2 }}
              className="fixed left-0 top-0 bottom-0 z-50 w-[280px] bg-white border-r border-surface-200 shadow-xl lg:hidden overflow-y-auto"
            >
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
