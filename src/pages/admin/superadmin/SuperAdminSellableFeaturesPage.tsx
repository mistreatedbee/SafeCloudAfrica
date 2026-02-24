import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { LockIcon } from 'lucide-react';
import { useUser } from '@insforge/react';
import { useAsync } from '../../../api/hooks/useAsync';
import { insforge } from '../../../api/insforge/client';
import {
  SELLABLE_FEATURES_ORDER,
  SELLABLE_FEATURE_LABELS,
  getSellableFeaturesConfig,
  type SellableFeatureKey,
} from '../../../api/services/sellableFeaturesService';
import { logPlatformAdminAction } from '../../../api/services/platformAdminAuditService';
import type { Company, UUID } from '../../../api/models/entities';

export function SuperAdminSellableFeaturesPage() {
  const { user } = useUser();
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [version, setVersion] = useState(0);

  const { data, loading, error } = useAsync(
    async () => {
      const { data, error } = await insforge.database
        .from('companies')
        .select('id, name, metadata')
        .order('name')
        .limit(300);
      if (error) throw error;
      return (data ?? []) as Company[];
    },
    [version]
  );

  const companies = data ?? [];
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
    setSaving(`${companyId}:${featureKey}`);
    setMessage(null);
    try {
      const metadata = (company.metadata as Record<string, unknown> | null) ?? {};
      const currentRaw = metadata['sellable_features'];
      const current = currentRaw && typeof currentRaw === 'object' ? (currentRaw as Record<string, unknown>) : {};
      const featureRaw = current[featureKey];
      const feature =
        featureRaw && typeof featureRaw === 'object'
          ? (featureRaw as Record<string, unknown>)
          : { enabled: true, locked: true };
      const next = {
        ...metadata,
        sellable_features: {
          ...current,
          [featureKey]: {
            enabled: feature.enabled === false ? false : true,
            locked,
          },
        },
      };

      const { error } = await insforge.database.from('companies').update({ metadata: next }).eq('id', companyId);
      if (error) throw error;

      if (user?.id) {
        await logPlatformAdminAction(user.id as UUID, {
          action: locked ? 'sellable_feature_locked' : 'sellable_feature_unlocked',
          target_company_id: companyId as UUID,
          details: { feature_key: featureKey, locked },
        });
      }

      setMessage({
        type: 'success',
        text: `${SELLABLE_FEATURE_LABELS[featureKey]} ${locked ? 'locked' : 'unlocked'} for ${company.name}.`,
      });
      setVersion((v) => v + 1);
    } catch (err) {
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
      {loading && <p className="text-sm text-charcoal-500">Loading organisations...</p>}

      {!loading && rows.length > 0 && (
        <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Organisation</th>
                  {SELLABLE_FEATURES_ORDER.map((featureKey) => (
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
                    {SELLABLE_FEATURES_ORDER.map((featureKey) => {
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

      {!loading && rows.length === 0 && <p className="text-sm text-charcoal-500">No organisations found.</p>}
    </motion.div>
  );
}
