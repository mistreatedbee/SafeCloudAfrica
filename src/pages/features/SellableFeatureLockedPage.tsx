import React, { useMemo, useState } from 'react';
import { LockIcon, MailIcon, SendIcon } from 'lucide-react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import {
  requestSellableFeatureUnlock,
  SELLABLE_FEATURE_LABELS,
  SELLABLE_FEATURE_PREVIEW_BULLETS,
  type SellableFeatureKey
} from '../../api/services/sellableFeaturesService';

export function SellableFeatureLockedPage({ featureKey }: { featureKey: SellableFeatureKey }) {
  const { activeCompanyId } = useTenant();
  const { user } = useUser();
  const [requesting, setRequesting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const featureName = SELLABLE_FEATURE_LABELS[featureKey];
  const preview = useMemo(() => SELLABLE_FEATURE_PREVIEW_BULLETS[featureKey] ?? [], [featureKey]);

  const handleRequestUnlock = async () => {
    if (!activeCompanyId || !user?.id) return;
    setRequesting(true);
    setMessage(null);
    try {
      await requestSellableFeatureUnlock({
        companyId: activeCompanyId,
        featureKey,
        requestedByUserId: user.id,
        requestedByEmail: user.email ?? null
      });
      setMessage({ type: 'success', text: 'Unlock request sent to your organisation admin(s).' });
    } catch (error) {
      setMessage({ type: 'error', text: String((error as Error)?.message ?? error) });
    } finally {
      setRequesting(false);
    }
  };

  return (
    <Layout title={featureName}>
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-2xl border border-surface-300 shadow-card p-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-warning/15 text-warning mb-4">
            <LockIcon className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-charcoal">This feature is locked</h1>
          <p className="text-sm text-charcoal-500 mt-2">
            This add-on is not included in your current plan. Payment/activation is required. Please contact Sales or your Admin to unlock it.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <a
              href="mailto:support@safecloud.africa?subject=Feature%20unlock%20request"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-navy text-white text-sm font-medium hover:bg-navy-700 transition-colors"
            >
              <MailIcon className="w-4 h-4" />
              Contact Sales
            </a>
            <button
              type="button"
              onClick={handleRequestUnlock}
              disabled={requesting || !activeCompanyId || !user?.id}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <SendIcon className="w-4 h-4" />
              {requesting ? 'Sending...' : 'Request Unlock'}
            </button>
          </div>

          {message && (
            <div
              className={`mt-4 rounded-lg p-3 text-sm ${
                message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-critical/10 text-critical'
              }`}
            >
              {message.text}
            </div>
          )}

          <div className="mt-6">
            <p className="text-sm font-semibold text-charcoal">What you get with {featureName}</p>
            <ul className="mt-2 space-y-2 text-sm text-charcoal-500">
              {preview.map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <span className="mt-1 inline-block w-1.5 h-1.5 rounded-full bg-teal" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Layout>
  );
}
