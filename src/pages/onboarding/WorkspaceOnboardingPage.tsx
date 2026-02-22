import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2Icon, MapPinIcon, PhoneIcon } from 'lucide-react';
import type { LicenseType } from '../../api/models/core';
import { AuthShell } from '../../components/auth/AuthShell';
import { LoadingOverlay } from '../../components/ui/LoadingOverlay';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import { useUser } from '@insforge/react';
import { createCompany, createMembership, getDefaultEmployeeLimit } from '../../api/services/tenantService';
import { useTenant } from '../../tenant/TenantContext';
import { PAYMENT_DURATION_MONTHS } from '../../api/services/licensingService';

function getLicenseCopy(type: LicenseType): { title: string; price: string; badge?: string; limit: string; bullets: string[] } {
  switch (type) {
    case 'starter_6m':
      return {
        title: 'Starter Licence (6 months)',
        price: 'R3,000 once-off',
        badge: 'Legacy',
        limit: 'Up to 4 employees',
        bullets: ['Core modules', 'User & role management', 'Basic storage', 'Audit logs', 'Email support']
      };
    case 'professional_12m':
      return {
        title: 'Professional Licence (12 months)',
        price: 'R5,000 once-off',
        badge: 'Legacy',
        limit: 'Up to 20 employees',
        bullets: ['Everything in Starter', 'Extended storage', 'Priority support', 'Branding (logo & name)', 'Planned upgrades']
      };
    case 'enterprise_custom':
      return {
        title: 'Enterprise / Custom',
        price: 'Request a quote',
        badge: 'Custom onboarding',
        limit: 'Custom employee limit',
        bullets: ['Multi-site', 'Custom features', 'Onboarding + training', 'Dedicated support', 'Integrations (planned)']
      };
    case 'base':
      return {
        title: 'Base',
        price: 'R4,000/month',
        badge: '1–5 users',
        limit: 'Up to 5 employees (HR free)',
        bullets: ['Core modules', 'HR Module free', 'User & role management', 'Audit logs', 'Email support']
      };
    case 'growth':
      return {
        title: 'Growth',
        price: 'R6,500/month',
        badge: 'Most popular',
        limit: '6–20 employees (HR free)',
        bullets: ['Everything in Base', 'Extended storage', 'Priority support', 'Branding', 'Planned upgrades']
      };
    case 'professional':
      return {
        title: 'Professional',
        price: 'R7,500/month',
        badge: '21–50 users',
        limit: '21–50 employees (HR free)',
        bullets: ['Full platform', 'Advanced reporting', 'Compliance scoring', 'Dedicated support', 'Integrations']
      };
    case 'hr_only':
      return {
        title: 'HR-only',
        price: 'R3,000/month',
        badge: '1–5 users',
        limit: 'Up to 5 employees (HR only)',
        bullets: ['HR Module', 'Training & KPIs', 'Documents', 'User management', 'Email support']
      };
    default:
      return {
        title: String(type),
        price: '—',
        limit: '—',
        bullets: []
      };
  }
}

export function WorkspaceOnboardingPage() {
  const navigate = useNavigate();
  const { user, isLoaded } = useUser();
  const { memberships, refreshTenant } = useTenant();

  // If user already has a workspace, they shouldn't be here.
  useEffect(() => {
    if (memberships.length > 0) navigate('/app', { replace: true });
  }, [memberships.length, navigate]);

  const [licenseType, setLicenseType] = useState<LicenseType>('base');
  const [subscriptionDurationMonths, setSubscriptionDurationMonths] = useState<number>(12);
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [province, setProvince] = useState('');
  const [industry, setIndustry] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selected = useMemo(() => getLicenseCopy(licenseType), [licenseType]);
  const isOperatingModelTier = ['base', 'growth', 'professional', 'hr_only'].includes(licenseType);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!companyName.trim()) {
      setError('Please enter your company name.');
      return;
    }

    try {
      setLoading(true);
      if (!isLoaded || !user?.id) throw new Error('Please sign in again.');

      const employeeLimit = getDefaultEmployeeLimit(licenseType);
      const company = await createCompany({
        name: companyName.trim(),
        licenseType,
        employeeLimit,
        primaryAdminUserId: user.id,
        metadata: {
          contact_phone: phone.trim() || null,
          province: province || null,
          industry: industry || null
        },
        subscriptionDurationMonths: isOperatingModelTier ? subscriptionDurationMonths : undefined
      });
      await createMembership({
        companyId: company.id,
        userId: user.id,
        role: isOperatingModelTier ? 'owner' : 'admin'
      });
      await refreshTenant();

      setSuccess('Workspace created. Redirecting…');
      navigate('/app', { replace: true });
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <LoadingOverlay show={loading} title="Creating workspace…" message="Saving your company and licence details." />
      <AuthShell title="Create your workspace" subtitle="Choose a licence, then register your company.">
      <div className="space-y-4">
        <div className="bg-surface-50 border border-surface-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-charcoal">Choose your licence</p>
          <p className="text-xs text-charcoal-500 mt-1">Operating Model tiers (recommended) or legacy options.</p>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {(['base', 'growth', 'professional', 'hr_only', 'starter_6m', 'professional_12m', 'enterprise_custom'] as LicenseType[]).map((t) => {
              const c = getLicenseCopy(t);
              const active = t === licenseType;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setLicenseType(t)}
                  className={`text-left rounded-xl border p-4 transition-colors ${
                    active ? 'border-teal bg-white shadow-card' : 'border-surface-200 bg-white hover:bg-surface-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-charcoal">{c.title}</p>
                    {c.badge && (
                      <span className={`px-2 py-1 rounded-full text-[11px] font-semibold border ${
                        active ? 'bg-teal-50 text-teal border-teal/20' : 'bg-surface-50 text-charcoal-500 border-surface-200'
                      }`}>
                        {c.badge}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xl font-bold text-navy">{c.price}</p>
                  <p className="mt-1 text-xs text-charcoal-500">{c.limit}</p>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-charcoal-500">
            Note: licences enforce an employee limit (e.g. Starter = 4 users). Your Super Admin can upgrade you later.
          </p>
        </div>

        <div className="bg-white border border-surface-300 rounded-xl p-4">
          <p className="text-sm font-semibold text-charcoal">Selected licence</p>
          <p className="text-sm text-charcoal-500 mt-1">{selected.title} — {selected.price} — {selected.limit}</p>
          {isOperatingModelTier && (
            <div className="mt-3">
              <label className="block text-xs font-medium text-charcoal-500 mb-1">Payment plan duration</label>
              <select
                value={subscriptionDurationMonths}
                onChange={(e) => setSubscriptionDurationMonths(Number(e.target.value))}
                className="w-full max-w-[200px] px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm"
              >
                {PAYMENT_DURATION_MONTHS.map((m) => (
                  <option key={m} value={m}>{m} months</option>
                ))}
              </select>
            </div>
          )}
          <ul className="mt-3 space-y-1 text-sm text-charcoal-600">
            {selected.bullets.map((b) => (
              <li key={b}>- {b}</li>
            ))}
          </ul>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Company name *</label>
            <div className="relative">
              <Building2Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-400" />
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Mokoena Construction (Pty) Ltd"
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Contact number (optional)</label>
              <div className="relative">
                <PhoneIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-400" />
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 072 123 4567"
                  autoComplete="tel"
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Province (optional)</label>
              <div className="relative">
                <MapPinIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-400" />
                <select
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                >
                  <option value="">Select province</option>
                  <option value="Eastern Cape">Eastern Cape</option>
                  <option value="Free State">Free State</option>
                  <option value="Gauteng">Gauteng</option>
                  <option value="KwaZulu-Natal">KwaZulu-Natal</option>
                  <option value="Limpopo">Limpopo</option>
                  <option value="Mpumalanga">Mpumalanga</option>
                  <option value="Northern Cape">Northern Cape</option>
                  <option value="North West">North West</option>
                  <option value="Western Cape">Western Cape</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Industry (optional)</label>
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            >
              <option value="">Select industry</option>
              <option value="Construction">Construction</option>
              <option value="Manufacturing">Manufacturing</option>
              <option value="Logistics & Transport">Logistics & Transport</option>
              <option value="Security">Security</option>
              <option value="Mining Support Services">Mining Support Services</option>
              <option value="Forestry">Forestry</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {error && (
            <div className="bg-critical-50 border border-critical/20 rounded-lg p-3">
              <p className="text-sm font-semibold text-critical">Workspace setup failed</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-success-50 border border-success/20 rounded-lg p-3">
              <p className="text-sm font-semibold text-success">Success</p>
              <p className="text-sm text-charcoal-600 mt-1">{success}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-teal text-white rounded-lg text-sm font-semibold hover:bg-teal-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading && <LoadingSpinner />}
            {loading ? 'Creating…' : 'Create workspace'}
          </button>
        </form>
      </div>
      </AuthShell>
    </>
  );
}

