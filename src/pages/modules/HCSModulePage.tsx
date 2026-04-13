import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheckIcon,
  CheckCircleIcon,
  SearchIcon,
  PlusIcon,
  LockIcon
} from 'lucide-react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { ListEmptyState } from '../../components/ui/ListEmptyState';

// HCS is a sellable add-on module
// This page should only be accessible if the company has HCS enabled
export function HCSModulePage() {
  const navigate = useNavigate();
  const { activeCompany, activeRole } = useTenant();
  const [searchQuery, setSearchQuery] = useState('');

  const canManage = activeRole === 'admin' || activeRole === 'manager' || activeRole === 'supervisor' || activeRole === 'consultant';

  const metadata = (activeCompany?.metadata ?? null) as Record<string, unknown> | null;
  const modulesMeta = (metadata?.modules ?? null) as Record<string, unknown> | null;
  const hcsEnabled = Boolean(activeCompany?.modules_enabled?.hcs ?? modulesMeta?.hcs ?? false);

  if (!hcsEnabled) {
    return (
      <Layout title="HCS Module">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center max-w-md">
            <LockIcon className="w-16 h-16 mx-auto mb-4 text-charcoal-300" />
            <h2 className="text-xl font-bold text-charcoal mb-2">HCS Module Not Enabled</h2>
            <p className="text-sm text-charcoal-500 mb-4">
              The HCS (Health & Safety Compliance) module is a premium add-on feature.
            </p>
            <button
              onClick={() => navigate('/settings')}
              className="px-4 py-2 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors"
            >
              Contact Sales to Enable
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  const hasSearch = searchQuery.trim().length > 0;

  return (
    <Layout title="HCS Module">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-6"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-teal to-teal-600 rounded-2xl p-6 text-white">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-xl">
                <ShieldCheckIcon className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">HCS Module</h1>
                <p className="text-teal-100">Health & Safety Compliance - Premium Add-On</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-white/20 rounded-lg text-sm font-medium">Premium Feature</span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Active Inspections</p>
            <p className="text-2xl font-bold text-charcoal mt-1">0</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Health Records</p>
            <p className="text-2xl font-bold text-charcoal mt-1">0</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Compliance Score</p>
            <p className="text-2xl font-bold text-teal mt-1">0%</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Pending Actions</p>
            <p className="text-2xl font-bold text-warning mt-1">0</p>
          </div>
        </div>

        {/* Search & Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="relative flex-1 max-w-md">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-400" />
            <input
              type="search"
              placeholder="Search HCS records..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>
          {canManage && (
            <button
              onClick={() => setSearchQuery('')}
              className="flex items-center gap-2 px-4 py-2.5 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              Refresh View
            </button>
          )}
        </div>

        {/* Records List */}
        <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-200">
            <h3 className="font-semibold text-charcoal">HCS Records</h3>
          </div>
          <div className="p-4">
            <ListEmptyState
              embedded
              icon={ShieldCheckIcon}
              title={hasSearch ? 'No matching live HCS records' : 'No live HCS records yet'}
              description="This page no longer shows placeholder inspections or health records. Live HCS records will appear here when the organisation enables HCS data collection."
              primaryAction={{
                kind: 'button',
                label: hasSearch ? 'Clear Search' : 'Open Settings',
                onClick: hasSearch ? () => setSearchQuery('') : () => navigate('/settings')
              }}
            />
          </div>
        </div>

        {/* Module Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <h3 className="font-semibold text-charcoal mb-2">About HCS Module</h3>
          <p className="text-sm text-charcoal-600 mb-3">
            The HCS (Health & Safety Compliance) module is a premium add-on feature that provides advanced
            health and safety compliance management, including specialized inspections, health surveillance,
            and compliance tracking.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-charcoal-600">
            <div className="flex items-start gap-2">
              <CheckCircleIcon className="w-4 h-4 text-teal mt-0.5 flex-shrink-0" />
              <span>Advanced health surveillance tracking</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircleIcon className="w-4 h-4 text-teal mt-0.5 flex-shrink-0" />
              <span>Specialized compliance inspections</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircleIcon className="w-4 h-4 text-teal mt-0.5 flex-shrink-0" />
              <span>Automated compliance reporting</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircleIcon className="w-4 h-4 text-teal mt-0.5 flex-shrink-0" />
              <span>Integration with regulatory requirements</span>
            </div>
          </div>
        </div>
      </motion.div>
    </Layout>
  );
}
