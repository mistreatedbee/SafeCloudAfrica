import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Building2Icon, SearchIcon, ShieldCheckIcon } from 'lucide-react';
import { Layout } from '../../components/layout/Layout';
import { useAsync } from '../../api/hooks/useAsync';
import { insforge } from '../../api/insforge/client';
import type { Company } from '../../api/models/entities';

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
  return license;
}

export function SuperAdminPage() {
  const [query, setQuery] = useState('');

  const { data, loading, error } = useAsync<Company[]>(
    async () => {
      const { data, error } = await insforge.database.from('companies').select('*').order('created_at', { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as Company[];
    },
    []
  );

  const companies = data ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => c.name.toLowerCase().includes(q));
  }, [companies, query]);

  return (
    <Layout title="Super Admin">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-charcoal flex items-center gap-2">
                <ShieldCheckIcon className="w-4 h-4 text-teal" /> Platform oversight
              </p>
              <p className="text-sm text-charcoal-500 mt-1">
                View all registered companies across Safe Cloud Africa. This is a privileged view (global).
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-charcoal-500">Total companies</p>
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
              placeholder="Search companies…"
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>
        </div>

        {error && (
          <div className="bg-white rounded-xl border border-critical/30 shadow-card p-5">
            <p className="text-sm font-semibold text-critical">Unable to load companies</p>
            <p className="text-sm text-charcoal-500 mt-1">
              {String((error as any)?.message ?? error)}
            </p>
            <p className="text-sm text-charcoal-500 mt-3">
              Make sure you added your user id to `platform_admins` and applied the updated RLS policies in `docs/phase2-schema.sql`.
            </p>
          </div>
        )}

        <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
            <p className="font-semibold text-charcoal">Companies</p>
            <p className="text-sm text-charcoal-500">{filtered.length} shown</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Company</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Licence</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">User limit</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Registered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {loading && (
                  <tr>
                    <td colSpan={4} className="px-5 py-4 text-sm text-charcoal-500">
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-4 text-sm text-charcoal-500">
                      No companies found.
                    </td>
                  </tr>
                )}
                {filtered.map((c) => (
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
                    <td className="px-5 py-4 text-sm text-charcoal-500">{c.employee_limit}</td>
                    <td className="px-5 py-4 text-sm text-charcoal-500">{formatDateZA(c.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>
    </Layout>
  );
}

