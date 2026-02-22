import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { AlertTriangleIcon } from 'lucide-react';

export function BillingStatusPage() {
  const [params] = useSearchParams();
  const reason = params.get('reason') || 'expired';
  const isSuspended = reason === 'suspended';

  return (
    <Layout title="Subscription Status">
      <div className="max-w-2xl mx-auto">
        <div className="rounded-xl border border-critical/30 bg-critical/5 p-6">
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <AlertTriangleIcon className="w-10 h-10 text-critical" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-charcoal">
                {isSuspended ? 'Subscription suspended' : 'Subscription expired'}
              </h1>
              <p className="mt-2 text-sm text-charcoal-600">
                {isSuspended
                  ? 'Your organisation’s subscription has been suspended. Please contact support to restore access.'
                  : 'Your organisation’s subscription has expired or is no longer active. Please contact support to renew.'}
              </p>
              <p className="mt-4 text-sm font-medium text-charcoal-700">
                Contact support to renew or restore your subscription.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
