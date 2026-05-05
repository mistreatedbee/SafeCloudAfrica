import React, { useEffect, useState, useRef } from 'react';
import {
  ChevronDownIcon,
  UserIcon,
  SettingsIcon,
  LogOutIcon,
  HelpCircleIcon } from
'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTenant } from '../../tenant/TenantContext';
import { useIdentity } from '../../hooks/useIdentity';

function getInitials(nameOrEmail: string): string {
  const raw = nameOrEmail.trim();
  if (!raw) return 'SC';
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return raw.slice(0, 2).toUpperCase();
}

function formatRole(role: string | null, isPlatformAdmin: boolean): string {
  if (isPlatformAdmin) return 'Super Admin';
  if (!role) return 'Member';
  if (role === 'owner') return 'Organisation Owner';
  if (role === 'admin') return 'Company Admin';
  if (role === 'manager') return 'Manager';
  if (role === 'supervisor') return 'Supervisor';
  if (role === 'consultant') return 'Consultant';
  if (role === 'employee') return 'Employee';
  if (role === 'auditor') return 'Auditor';
  return 'Member';
}
export function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { activeCompany, activeRole, isPlatformAdmin } = useTenant();
  const { avatarUrl, email, fullName } = useIdentity();
  const onSuperAdminRoute = location.pathname.startsWith('/super-admin');
  const displayName = fullName || email || 'Account';
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
      dropdownRef.current &&
      !dropdownRef.current.contains(event.target as Node))
      {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-surface-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        aria-label="User menu"
        aria-expanded={isOpen}>

        <div className="w-8 h-8 rounded-full border-2 border-surface-200 bg-navy text-white flex items-center justify-center text-xs font-bold overflow-hidden">
          {avatarUrl ? (
            <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
          ) : (
            getInitials(displayName)
          )}
        </div>

        <div className="hidden md:block text-left">
          <p className="text-sm font-medium text-charcoal">
            {displayName}
          </p>
          <p className="text-xs text-charcoal-400">{formatRole(activeRole, isPlatformAdmin)}</p>
        </div>
        <ChevronDownIcon
          className={`w-4 h-4 text-charcoal-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />

      </button>

      <AnimatePresence>
        {isOpen &&
        <motion.div
          initial={{
            opacity: 0,
            y: -10,
            scale: 0.95
          }}
          animate={{
            opacity: 1,
            y: 0,
            scale: 1
          }}
          exit={{
            opacity: 0,
            y: -10,
            scale: 0.95
          }}
          transition={{
            duration: 0.15
          }}
            className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-elevated border border-surface-300 overflow-hidden z-50">

            <div className="px-4 py-3 border-b border-surface-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full border border-surface-200 bg-navy text-white flex items-center justify-center text-sm font-bold overflow-hidden">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
                  ) : (
                    getInitials(displayName)
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-charcoal truncate">{displayName}</p>
                  <p className="text-sm text-charcoal-500 truncate">{email}</p>
                </div>
              </div>
              <p className="text-xs text-charcoal-400 mt-1">
                {onSuperAdminRoute ? 'Platform scope' : activeCompany?.name ?? 'No company selected'}
              </p>
            </div>

            <div className="py-2">
              <button
                onClick={() => {
                  setIsOpen(false);
                  navigate('/profile');
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-charcoal hover:bg-surface-50 transition-colors">
                <UserIcon className="w-4 h-4 text-charcoal-400" />
                My Profile
              </button>
              <button
                onClick={() => {
                  setIsOpen(false);
                  navigate('/settings');
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-charcoal hover:bg-surface-50 transition-colors">
                <SettingsIcon className="w-4 h-4 text-charcoal-400" />
                Settings
              </button>
              {isPlatformAdmin && (
                <button
                  onClick={() => {
                  setIsOpen(false);
                  navigate('/super-admin/overview');
                }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-charcoal hover:bg-surface-50 transition-colors"
                >
                  <SettingsIcon className="w-4 h-4 text-charcoal-400" />
                  Super Admin
                </button>
              )}
              <button
                onClick={() => {
                  setIsOpen(false);
                  navigate('/support');
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-charcoal hover:bg-surface-50 transition-colors">
                <HelpCircleIcon className="w-4 h-4 text-charcoal-400" />
                Help & Support
              </button>
            </div>

            <div className="border-t border-surface-200 py-2">
              <button
                onClick={() => {
                  setIsOpen(false);
                  navigate('/logout');
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-critical hover:bg-critical-50 transition-colors"
              >
                <LogOutIcon className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </motion.div>
        }
      </AnimatePresence>
    </div>);

}
