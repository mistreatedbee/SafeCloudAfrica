import React from 'react';
import { Layout } from '../components/layout/Layout';
import { LICENSE_PRICING, PAYMENT_DURATION_MONTHS, formatLicenseType } from '../api/services/licensingService';
import type { LicenseType } from '../api/models/core';

const OPERATING_TIERS: LicenseType[] = ['base', 'growth', 'professional', 'hr_only'];
const LEGACY_TIERS: LicenseType[] = ['starter_6m', 'professional_12m', 'enterprise_custom'];

export function BillingPricingPage() {
  return (
    <Layout title="Billing & Pricing">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-charcoal">Billing & Pricing</h1>
          <p className="text-charcoal-500 mt-1">License tiers and payment plan durations.</p>
        </div>

        <section className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
          <h2 className="text-lg font-semibold text-charcoal px-5 py-4 border-b border-surface-200">
            Operating Model tiers (monthly)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-50 border-b border-surface-200">
                  <th className="text-left px-5 py-3 font-medium text-charcoal">Tier</th>
                  <th className="text-left px-5 py-3 font-medium text-charcoal">Price (ZAR/month)</th>
                  <th className="text-left px-5 py-3 font-medium text-charcoal">Seats</th>
                </tr>
              </thead>
              <tbody>
                {OPERATING_TIERS.map((tier) => {
                  const info = LICENSE_PRICING[tier];
                  return (
                    <tr key={tier} className="border-b border-surface-100 hover:bg-surface-50/50">
                      <td className="px-5 py-3 font-medium text-charcoal">{formatLicenseType(tier)}</td>
                      <td className="px-5 py-3 text-charcoal-600">
                        {info?.monthlyPriceZAR ? `R${info.monthlyPriceZAR.toLocaleString()}` : '—'}
                      </td>
                      <td className="px-5 py-3 text-charcoal-600">
                        {info ? `${info.minSeats}–${info.maxSeats}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3 text-xs text-charcoal-500 border-t border-surface-100">
            Payment plan durations: {PAYMENT_DURATION_MONTHS.join(', ')} months. HR Module is free with Base, Growth, and Professional.
          </p>
        </section>

        <section className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
          <h2 className="text-lg font-semibold text-charcoal px-5 py-4 border-b border-surface-200">
            Legacy tiers
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-50 border-b border-surface-200">
                  <th className="text-left px-5 py-3 font-medium text-charcoal">Tier</th>
                  <th className="text-left px-5 py-3 font-medium text-charcoal">Price</th>
                  <th className="text-left px-5 py-3 font-medium text-charcoal">Seats</th>
                </tr>
              </thead>
              <tbody>
                {LEGACY_TIERS.map((tier) => {
                  const info = LICENSE_PRICING[tier];
                  return (
                    <tr key={tier} className="border-b border-surface-100 hover:bg-surface-50/50">
                      <td className="px-5 py-3 font-medium text-charcoal">{formatLicenseType(tier)}</td>
                      <td className="px-5 py-3 text-charcoal-600">
                        {tier === 'enterprise_custom' ? 'Quote' : info?.monthlyPriceZAR ? `R${info.monthlyPriceZAR.toLocaleString()} (once-off)` : '—'}
                      </td>
                      <td className="px-5 py-3 text-charcoal-600">
                        {info ? `${info.minSeats}–${info.maxSeats}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </Layout>
  );
}
