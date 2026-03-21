import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Building2Icon, SearchIcon, ShieldCheckIcon } from 'lucide-react';
import { useUser } from '@insforge/react';
import { useAsync } from '../../../api/hooks/useAsync';
import { insforge } from '../../../api/insforge/client';
import { suspendOrgSubscription } from '../../../api/services/licensesService';
import { logPlatformAdminAction } from '../../../api/services/platformAdminAuditService';
import {
  getSellableFeaturesConfig,
  mergeSellableFeaturesConfig,
  SELLABLE_FEATURE_LABELS,
  SELLABLE_FEATURES_ORDER,
  type SellableFeatureKey,
  type SellableFeaturesConfig
} from '../../../api/services/sellableFeaturesService';
import type { Company, UUID } from '../../../api/models/entities';
import { ListEmptyState } from '../../../components/ui/ListEmptyState';

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
  const [savingLockKey, setSavingLockKey] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [selectedCompanyId, setSelectedCompanyId] = useState<UUID | null>(null);
  const [sellableOverrides, setSellableOverrides] = useState<Record<string, SellableFeaturesConfig>>({});
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  const selectedCompany = useMemo(
    () => companies.find((c) => c.id === selectedCompanyId) ?? null,
    [companies, selectedCompanyId]
  );

  const modulesList = (c: Company): string[] => {
    const mod = c.modules_enabled ?? (c.metadata as Record<string, boolean> | undefined)?.['modules_enabled'];
    if (!mod || typeof mod !== 'object') return [];
    return Object.entries(mod)
      .filter(([, v]) => v)
      .map(([k]) => k);
  };

  const getSellable = (c: Company): SellableFeaturesConfig => {
    return sellableOverrides[c.id] ?? getSellableFeaturesConfig(c);
  };

  const handleSuspend = async (companyId: UUID) => {
    if (!user?.id || !confirm('Suspend this organisation? They will be redirected to the billing status page until restored.')) return;
    setSuspendingId(companyId);
    setMessage(null);
    try {
      await suspendOrgSubscription(companyId, user.id as UUID);
      setMessage({ type: 'success', text: 'Organisation suspended.' });
      setRefresh((r) => r + 1);
    } finally {
      setSuspendingId(null);
    }
  };

  const handleLockToggle = async (company: Company, featureKey: SellableFeatureKey, locked: boolean) => {
    if (!user?.id) return;
    setMessage(null);
    setSavingLockKey(`${company.id}:${featureKey}`);
    const currentMeta = (company.metadata as Record<string, unknown>) ?? {};
    const currentSellable = getSellable(company);
    const nextSellable = mergeSellableFeaturesConfig(currentSellable, { [featureKey]: { locked, enabled: true } });
    const nextMeta = { ...currentMeta, sellable_features: nextSellable };

    try {
      const { error: updateError } = await insforge.database
        .from('companies')
        .update({ metadata: nextMeta })
        .eq('id', company.id);
      if (updateError) throw updateError;

      await logPlatformAdminAction(user.id as UUID, {
        action: locked ? 'sellable_feature_locked' : 'sellable_feature_unlocked',
        target_company_id: company.id as UUID,
        details: {
          organizationId: company.id,
          featureKey,
          action: locked ? 'LOCKED' : 'UNLOCKED',
          performedBy: user.email ?? user.id
        }
      });

      setSellableOverrides((prev) => ({ ...prev, [company.id]: nextSellable }));
      setMessage({
        type: 'success',
        text: `${SELLABLE_FEATURE_LABELS[featureKey]} ${locked ? 'locked' : 'unlocked'} for ${company.name}.`
      });
      setRefresh((r) => r + 1);
    } catch (err) {
      setMessage({ type: 'error', text: String((err as Error)?.message ?? err) });
    } finally {
      setSavingLockKey(null);
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
            placeholder="Search organisations..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
          />
        </div>
      </div>

      {message && (
        <div
          className={`rounded-lg p-3 text-sm ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-critical/10 text-critical'
          }`}
        >
          {message.text}
        </div>
      )}

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
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <ListEmptyState
                  tableColSpan={7}
                  icon={Building2Icon}
                  title={companies.length === 0 ? 'No organisations in the platform' : 'No organisations match your search'}
                  description="Review tenant plans, modules, seat usage, and subscription status from this register."
                  primaryAction={{ kind: 'button', label: 'Refresh', onClick: () => setRefresh((r) => r + 1) }}
                  secondaryAction={
                    companies.length > 0 && query.trim()
                      ? { kind: 'button', label: 'Clear search', onClick: () => setQuery('') }
                      : { kind: 'link', to: '/super-admin/overview', label: 'Overview' }
                  }
                />
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
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setSelectedCompanyId(c.id)}
                          className="text-sm text-teal hover:underline"
                        >
                          Manage features
                        </button>
                        {(c as Company & { status?: string }).status !== 'suspended' && (
                          <button
                            type="button"
                            onClick={() => handleSuspend(c.id)}
                            disabled={suspendingId === c.id}
                            className="text-sm text-critical hover:underline disabled:opacity-50"
                          >
                            {suspendingId === c.id ? 'Suspending...' : 'Suspend'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedCompany && (
        <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
            <div>
              <p className="font-semibold text-charcoal">Sellable Features</p>
              <p className="text-sm text-charcoal-500">Organisation: {selectedCompany.name}</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Feature</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Lock / Unlock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {SELLABLE_FEATURES_ORDER.map((featureKey) => {
                  const state = getSellable(selectedCompany)[featureKey];
                  const isSaving = savingLockKey === `${selectedCompany.id}:${featureKey}`;
                  return (
                    <tr key={featureKey}>
                      <td className="px-5 py-4 text-sm font-medium text-charcoal">{SELLABLE_FEATURE_LABELS[featureKey]}</td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            state.locked ? 'bg-warning/15 text-warning' : 'bg-green-50 text-green-700'
                          }`}
                        >
                          {state.locked ? 'Locked' : 'Unlocked'}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => handleLockToggle(selectedCompany, featureKey, !state.locked)}
                          disabled={isSaving}
                          className={`inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                            state.locked
                              ? 'bg-teal text-white hover:bg-teal-600'
                              : 'bg-warning text-white hover:bg-warning/90'
                          } ${isSaving ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                          {isSaving ? 'Saving...' : state.locked ? 'Unlock' : 'Lock'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </motion.div>
  );
}
