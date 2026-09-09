import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { LockIcon } from 'lucide-react';
import { useUser } from '@insforge/react';
import { useAsync } from '../../../api/hooks/useAsync';
import {
  listPlatformCompaniesForAdminPicklist,
  setPlatformSellableFeatureLock,
  type CompanyWithCount
} from '../../../api/services/superAdminPlatformService';
import {
  SELLABLE_FEATURES_ORDER,
  SELLABLE_FEATURE_LABELS,
  getSellableFeaturesConfig,
  patchSellableFeatureLockInMetadata,
  type SellableFeatureKey,
} from '../../../api/services/sellableFeaturesService';
import type { Company, UUID } from '../../../api/models/entities';
import { ListEmptyState } from '../../../components/ui/ListEmptyState';

const SUPER_ADMIN_SELLABLE_FEATURES = SELLABLE_FEATURES_ORDER.filter((key) => key !== 'unknown');

export function SuperAdminSellableFeaturesPage() {
  const { user } = useUser();
  const [companies, setCompanies] = useState<CompanyWithCount[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [version, setVersion] = useState(0);

  const { data, loading, error } = useAsync(
    () => listPlatformCompaniesForAdminPicklist(),
    [version]
  );

  useEffect(() => {
    if (data) setCompanies(data);
  }, [data]);

  const rows = useMemo(
    () =>
      companies.map((company) => ({
        company,
        config: getSellableFeaturesConfig(company),
      })),
    [companies]
  );

  const setFeatureLocked = async (company: Company, featureKey: SellableFeatureKey, locked: boolean) => {
    const companyId = company.id;
    const saveKey = `${companyId}:${featureKey}`;
    const previousMetadata = (company.metadata as Record<string, unknown> | null) ?? null;

    setSaving(saveKey);
    setMessage(null);
    setCompanies((current) =>
      current.map((row) =>
        row.id === companyId
          ? {
              ...row,
              metadata: patchSellableFeatureLockInMetadata(
                row.metadata as Record<string, unknown> | null,
                featureKey,
                locked
              )
            }
          : row
      )
    );

    try {
      const nextMetadata = await setPlatformSellableFeatureLock({
        companyId: companyId as UUID,
        featureKey,
        locked,
        actorUserId: user?.id ? (user.id as UUID) : null,
        currentMetadata: previousMetadata
      });

      setCompanies((current) =>
        current.map((row) => (row.id === companyId ? { ...row, metadata: nextMetadata } : row))
      );
      setMessage({
        type: 'success',
        text: `${SELLABLE_FEATURE_LABELS[featureKey]} ${locked ? 'locked' : 'unlocked'} for ${company.name}.`,
      });
    } catch (err) {
      setCompanies((current) =>
        current.map((row) =>
          row.id === companyId ? { ...row, metadata: previousMetadata } : row
        )
      );
      setMessage({ type: 'error', text: String((err as Error)?.message ?? err) });
    } finally {
      setSaving(null);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
        <p className="text-sm font-semibold text-charcoal flex items-center gap-2">
          <LockIcon className="w-4 h-4 text-teal" /> Sellable Feature Lock/Unlock
        </p>
        <p className="text-sm text-charcoal-500 mt-1">
          Lock or unlock paid features per organisation. All changes are audited.
        </p>
        <p className="text-xs text-charcoal-400 mt-2">
          Amber = locked (tenant sees upgrade screen). Teal = unlocked (full access). View history under Platform Audit Logs.
        </p>
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg text-sm ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-critical/10 text-critical'
          }`}
        >
          {message.text}
        </div>
      )}

      {error && <p className="text-sm text-critical">{String((error as Error)?.message)}</p>}
      {loading && companies.length === 0 && (
        <p className="text-sm text-charcoal-500">Loading organisations...</p>
      )}

      {!loading && rows.length > 0 && (
        <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Organisation</th>
                  {SUPER_ADMIN_SELLABLE_FEATURES.map((featureKey) => (
                    <th key={featureKey} className="px-3 py-3 text-center text-xs font-semibold text-charcoal-500 uppercase">
                      {SELLABLE_FEATURE_LABELS[featureKey]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {rows.map(({ company, config }) => (
                  <tr key={company.id} className="hover:bg-surface-50">
                    <td className="px-5 py-3 text-sm font-medium text-charcoal">{company.name}</td>
                    {SUPER_ADMIN_SELLABLE_FEATURES.map((featureKey) => {
                      const isLocked = config[featureKey].locked;
                      const isSaving = saving === `${company.id}:${featureKey}`;
                      return (
                        <td key={featureKey} className="px-3 py-3 text-center">
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => setFeatureLocked(company, featureKey, !isLocked)}
                            className={`inline-flex items-center justify-center w-24 h-8 rounded-lg text-xs font-semibold transition-colors ${
                              isLocked ? 'bg-warning/15 text-warning' : 'bg-teal/15 text-teal'
                            } ${isSaving ? 'opacity-50' : ''}`}
                          >
                            {isSaving ? 'Saving...' : isLocked ? 'Locked' : 'Unlocked'}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && rows.length === 0 && (
        <ListEmptyState
          icon={LockIcon}
          title="No organisations loaded"
          description="Lock or unlock sellable accelerants per tenant once companies are available."
          primaryAction={{ kind: 'button', label: 'Refresh', onClick: () => setVersion((v) => v + 1) }}
          secondaryAction={{ kind: 'link', to: '/super-admin/organisations', label: 'Organisations' }}
        />
      )}
    </motion.div>
  );
}
