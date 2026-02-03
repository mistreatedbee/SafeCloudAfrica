import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { UsersIcon, GraduationCapIcon, IdCardIcon, ArrowRightIcon, BuildingIcon } from 'lucide-react';
import { Layout } from '../../components/layout/Layout';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { listCompanyMemberships } from '../../api/services/tenantService';
import { listUserProfiles } from '../../api/services/profilesService';
import { listContractors } from '../../api/services/contractorsService';
import { listVisitors } from '../../api/services/visitorsService';
import { countExpiringTraining } from '../../api/services/trainingService';
import type { CompanyMembership, Contractor, UserProfile, Visitor } from '../../api/models/entities';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

export function HRModulePage() {
  const navigate = useNavigate();
  const { activeCompanyId } = useTenant();

  const { data: memberships } = useAsync<CompanyMembership[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listCompanyMemberships(activeCompanyId);
    },
    [activeCompanyId]
  );
  const { data: profiles } = useAsync<UserProfile[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listUserProfiles(activeCompanyId);
    },
    [activeCompanyId]
  );
  const { data: contractors } = useAsync<Contractor[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listContractors(activeCompanyId);
    },
    [activeCompanyId]
  );
  const { data: visitors } = useAsync<Visitor[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listVisitors(activeCompanyId);
    },
    [activeCompanyId]
  );
  const { data: expiringTraining } = useAsync<number>(
    async () => {
      if (!activeCompanyId) return 0;
      return await countExpiringTraining(activeCompanyId, 30);
    },
    [activeCompanyId]
  );

  const counts = useMemo(() => {
    const members = memberships ?? [];
    const byRole = new Map<string, number>();
    for (const m of members) byRole.set(m.role, (byRole.get(m.role) ?? 0) + 1);
    const departments = new Set((profiles ?? []).map((p) => p.department).filter(Boolean) as string[]);
    const sites = new Set((profiles ?? []).map((p) => p.site).filter(Boolean) as string[]);
    return {
      members: members.length,
      roles: Array.from(byRole.entries()).sort((a, b) => b[1] - a[1]),
      departments: departments.size,
      sites: sites.size,
      contractors: (contractors ?? []).length,
      visitors: (visitors ?? []).length
    };
  }, [contractors, memberships, profiles, visitors]);

  return (
    <Layout title="HR Management">
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
        <motion.div
          variants={itemVariants}
          className="bg-gradient-to-r from-amber-500 to-amber-600 rounded-2xl p-6 text-white"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-xl">
              <UsersIcon className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">HR</h1>
              <p className="text-amber-100">Workforce structure, inductions, contractors/visitors, and training compliance</p>
            </div>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Employees</p>
            <p className="text-2xl font-bold text-charcoal mt-1">{counts.members}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Departments</p>
            <p className="text-2xl font-bold text-charcoal mt-1">{counts.departments}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Sites</p>
            <p className="text-2xl font-bold text-charcoal mt-1">{counts.sites}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Training expiring (30d)</p>
            <p className="text-2xl font-bold text-warning mt-1">{expiringTraining ?? 0}</p>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal flex items-center gap-2">
              <IdCardIcon className="w-5 h-5 text-teal" />
              Workforce structure
            </h3>
            <p className="text-sm text-charcoal-500 mt-2">
              Manage users, roles, departments, and site assignments (saved per company).
            </p>
            <button
              onClick={() => navigate('/users')}
              className="mt-4 text-sm font-medium text-teal hover:text-teal-700 transition-colors inline-flex items-center gap-1"
            >
              Open user management <ArrowRightIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal flex items-center gap-2">
              <GraduationCapIcon className="w-5 h-5 text-teal" />
              Inductions & competency
            </h3>
            <p className="text-sm text-charcoal-500 mt-2">
              Training records, expiry reminders, and certificates are managed per employee.
            </p>
            <button
              onClick={() => navigate('/training')}
              className="mt-4 text-sm font-medium text-teal hover:text-teal-700 transition-colors inline-flex items-center gap-1"
            >
              Open training <ArrowRightIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal flex items-center gap-2">
              <BuildingIcon className="w-5 h-5 text-teal" />
              Contractors & visitors
            </h3>
            <p className="text-sm text-charcoal-500 mt-2">
              Contractors: {counts.contractors} • Visitors: {counts.visitors}. Track onboarding and site access records.
            </p>
            <button
              onClick={() => navigate('/contractors')}
              className="mt-4 text-sm font-medium text-teal hover:text-teal-700 transition-colors inline-flex items-center gap-1"
            >
              Open contractors/visitors <ArrowRightIcon className="w-4 h-4" />
            </button>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
          <h3 className="font-semibold text-charcoal mb-3">Roles distribution</h3>
          <div className="flex flex-wrap gap-2">
            {counts.roles.length === 0 && <p className="text-sm text-charcoal-500">No members yet.</p>}
            {counts.roles.map(([role, n]) => (
              <span key={role} className="px-2 py-1 bg-surface-100 rounded text-xs font-semibold text-charcoal-600">
                {role}: {n}
              </span>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </Layout>
  );
}

