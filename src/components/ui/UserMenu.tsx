import React, { useEffect, useState, useRef } from 'react';
import {
  ChevronDownIcon,
  UserIcon,
  SettingsIcon,
  LogOutIcon,
  HelpCircleIcon } from
'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useUser } from '@insforge/react';
import { useTenant } from '../../tenant/TenantContext';

function getInitials(nameOrEmail: string): string {
  const raw = nameOrEmail.trim();
  if (!raw) return 'SC';
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return raw.slice(0, 2).toUpperCase();
}

function formatRole(role: string | null): string {
  if (!role) return 'Member';
  if (role === 'admin') return 'Company Admin';
  if (role === 'consultant') return 'Consultant';
  if (role === 'employee') return 'Employee';
  return 'Member';
}
export function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { user } = useUser();
  const { activeCompany, activeRole, isPlatformAdmin } = useTenant();
  const displayName = (user?.profile as any)?.name ?? user?.email ?? 'Account';
  const email = user?.email ?? '';
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

        <div className="w-8 h-8 rounded-full border-2 border-surface-200 bg-navy text-white flex items-center justify-center text-xs font-bold">
          {getInitials(displayName)}
        </div>

        <div className="hidden md:block text-left">
          <p className="text-sm font-medium text-charcoal">
            {displayName}
          </p>
          <p className="text-xs text-charcoal-400">{formatRole(activeRole)}</p>
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
              <p className="font-medium text-charcoal">{displayName}</p>
              <p className="text-sm text-charcoal-500">{email}</p>
              <p className="text-xs text-charcoal-400 mt-1">
                {activeCompany?.name ?? 'No company selected'}
              </p>
            </div>

            <div className="py-2">
              <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-charcoal hover:bg-surface-50 transition-colors">
                <UserIcon className="w-4 h-4 text-charcoal-400" />
                My Profile
              </button>
              <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-charcoal hover:bg-surface-50 transition-colors">
                <SettingsIcon className="w-4 h-4 text-charcoal-400" />
                Settings
              </button>
              {isPlatformAdmin && (
                <button
                  onClick={() => {
                    setIsOpen(false);
                    navigate('/super-admin');
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-charcoal hover:bg-surface-50 transition-colors"
                >
                  <SettingsIcon className="w-4 h-4 text-charcoal-400" />
                  Super Admin
                </button>
              )}
              <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-charcoal hover:bg-surface-50 transition-colors">
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