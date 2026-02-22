import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Building2Icon, SearchIcon, ShieldCheckIcon } from 'lucide-react';
import { useUser } from '@insforge/react';
import { useAsync } from '../../../api/hooks/useAsync';
import { insforge } from '../../../api/insforge/client';
import { suspendOrgSubscription } from '../../../api/services/licensesService';
import type { Company, UUID } from '../../../api/models/entities';

function formatDateZA(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function formatLicence(license: string): string {
  if (license === 'starter_6m') return 'Starter (6 months)';
  if (license === 'professional_12m') return 'Professional (12 months)';
  if (license === 'enterprise_custom') return 'Enterprise / Custom';
  if (license === 'base') return 'Base';
  if (license === 'growth') return 'Growth';
  if (license === 'professional') return 'Professional';
  if (license === 'hr_only') return 'HR-only';
  return license;
}

type CompanyWithCount = Company & { user_count?: number };

async function fetchCompaniesWithCounts(): Promise<CompanyWithCount[]> {
  const { data: companies, error: companiesError } = await insforge.database
    .from('companies')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  if (companiesError) throw companiesError;
  const list = (companies ?? []) as Company[];

  const { data: counts } = await insforge.database
    .from('company_memberships')
    .select('company_id');
  const countByCompany: Record<string, number> = {};
  (counts ?? []).forEach((r: { company_id: string }) => {
    countByCompany[r.company_id] = (countByCompany[r.company_id] ?? 0) + 1;
  });

  return list.map((c) => ({
    ...c,
    user_count: countByCompany[c.id] ?? 0
  }));
}

export function SuperAdminOrganisationsPage() {
  const { user } = useUser();
  const [query, setQuery] = useState('');
  const [suspendingId, setSuspendingId] = useState<UUID | null>(null);
  const [refresh, setRefresh] = useState(0);

  const { data, loading, error } = useAsync(fetchCompaniesWithCounts, [refresh]);

  const companies = data ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.license_type && String(c.license_type).toLowerCase().includes(q))
    );
  }, [companies, query]);

  const modulesList = (c: Company): string[] => {
    const mod = c.modules_enabled ?? (c.metadata as Record<string, boolean> | undefined)?.['modules_enabled'];
    if (!mod || typeof mod !== 'object') return [];
    return Object.entries(mod)
      .filter(([, v]) => v)
      .map(([k]) => k);
  };

  const handleSuspend = async (companyId: UUID) => {
    if (!user?.id || !confirm('Suspend this organisation? They will be redirected to the billing status page until restored.')) return;
    setSuspendingId(companyId);
    try {
      await suspendOrgSubscription(companyId, user.id as UUID);
      setRefresh((r) => r + 1);
    } finally {
      setSuspendingId(null);
    }
  };

  const companyStatus = (c: Company & { status?: string }) => c.status ?? c.subscription_status ?? '—';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-charcoal flex items-center gap-2">
              <ShieldCheckIcon className="w-4 h-4 text-teal" /> Organisations (tenants)
            </p>
            <p className="text-sm text-charcoal-500 mt-1">
              View all registered organisations. Name, plan, modules, user count, seat limit, status.
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-charcoal-500">Total</p>
            <p className="text-2xl font-bold text-navy">{companies.length}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative w-full max-w-md">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search organisations…"
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
          />
        </div>
      </div>

      {error && (
        <div className="bg-white rounded-xl border border-critical/30 shadow-card p-5">
          <p className="text-sm font-semibold text-critical">Unable to load organisations</p>
          <p className="text-sm text-charcoal-500 mt-1">{String((error as Error)?.message ?? error)}</p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
          <p className="font-semibold text-charcoal">Organisations</p>
          <p className="text-sm text-charcoal-500">{filtered.length} shown</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Organisation</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Plan</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Modules</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Users / Limit</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Status</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Registered</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-5 py-4 text-sm text-charcoal-500">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-4 text-sm text-charcoal-500">
                    No organisations found.
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-teal-50 rounded-lg">
                          <Building2Icon className="w-5 h-5 text-teal" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-charcoal">{c.name}</p>
                          <p className="text-xs text-charcoal-400">ID: {c.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-charcoal-500">{formatLicence(c.license_type)}</td>
                    <td className="px-5 py-4 text-sm text-charcoal-500">
                      {modulesList(c).length ? modulesList(c).join(', ') : '—'}
                    </td>
                    <td className="px-5 py-4 text-sm text-charcoal-500">
                      {(c as CompanyWithCount).user_count ?? 0} / {c.employee_limit}
                    </td>
                    <td className="px-5 py-4 text-sm text-charcoal-500">{companyStatus(c)}</td>
                    <td className="px-5 py-4 text-sm text-charcoal-500">{formatDateZA(c.created_at)}</td>
                    <td className="px-5 py-4">
                      {(c as Company & { status?: string }).status !== 'suspended' && (
                        <button
                          type="button"
                          onClick={() => handleSuspend(c.id)}
                          disabled={suspendingId === c.id}
                          className="text-sm text-critical hover:underline disabled:opacity-50"
                        >
                          {suspendingId === c.id ? 'Suspending…' : 'Suspend'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
