import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRoundIcon, Building2Icon, FileCheckIcon, Loader2Icon } from 'lucide-react';
import { useAuth, useUser } from '@insforge/react';
import { AuthShell } from '../../components/auth/AuthShell';
import { validateLicenseKey, activateLicenseKey, type ValidatedKeyInfo } from '../../api/services/activationService';
import { getLoginRedirectPath } from '../../api/services/platformAdminService';
import { useTenant } from '../../tenant/TenantContext';
import { insforge } from '../../api/insforge/client';
import type { UUID } from '../../api/models/entities';

const PLAN_LABELS: Record<string, string> = {
  base: 'Base',
  growth: 'Growth',
  professional: 'Professional',
  hr_only: 'HR-only'
};

const DEFAULT_COUNTRY = 'South Africa';

export function ActivateLicensePage() {
  const navigate = useNavigate();
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  const { refreshTenant } = useTenant();

  const [key, setKey] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [primaryContactName, setPrimaryContactName] = useState('');
  const [primaryContactEmail, setPrimaryContactEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  const [keyInfo, setKeyInfo] = useState<ValidatedKeyInfo | null>(null);
  const [keyValidating, setKeyValidating] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const validateKey = useCallback(async () => {
    const k = key?.trim();
    if (!k) {
      setKeyInfo(null);
      setKeyError(null);
      return;
    }
    setKeyValidating(true);
    setKeyError(null);
    try {
      const info = await validateLicenseKey(k);
      setKeyInfo(info ?? null);
      if (!info) setKeyError('Invalid, already used, or expired. Please check the key or contact support.');
    } catch {
      setKeyInfo(null);
      setKeyError('Could not validate key. Try again.');
    } finally {
      setKeyValidating(false);
    }
  }, [key]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (key.trim()) validateKey();
      else {
        setKeyInfo(null);
        setKeyError(null);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [key, validateKey]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    const k = key.trim();
    const email = primaryContactEmail.trim().toLowerCase();
    if (!k || !companyName.trim() || !primaryContactName.trim() || !email) {
      setSubmitError('Please fill in license key, company name, primary contact name, and email.');
      return;
    }
    if (!keyInfo) {
      setSubmitError('Please enter a valid license key first.');
      return;
    }

    setSubmitting(true);
    try {
      if (!isSignedIn || !user) {
        if (!password) {
          setSubmitError('Please enter a password to create your account.');
          setSubmitting(false);
          return;
        }
        const { error } = await insforge.auth.signUp({
          email,
          password,
          options: { data: { full_name: primaryContactName.trim() } }
        });
        if (error) {
          if (error.message?.toLowerCase().includes('already registered') || error.message?.toLowerCase().includes('already exists')) {
            setSubmitError('This email is already registered. Please sign in first, then use this page to activate your license.');
          } else {
            setSubmitError(error.message ?? 'Could not create account.');
          }
          setSubmitting(false);
          return;
        }
        const { error: signInErr } = await insforge.auth.signInWithPassword({ email, password });
        if (signInErr) {
          setSubmitError('Account created but sign-in failed. Please go to Login and sign in with your email and password.');
          setSubmitting(false);
          return;
        }
      } else if (user.email?.toLowerCase() !== email) {
        setSubmitError('Primary contact email must match your signed-in account. Sign out or use the same email.');
        setSubmitting(false);
        return;
      }

      const result = await activateLicenseKey({
        key: k,
        companyName: companyName.trim(),
        industry: industry.trim(),
        country: country.trim() || DEFAULT_COUNTRY,
        primaryContactName: primaryContactName.trim(),
        primaryContactEmail: email,
        phone: phone.trim()
      });

      await refreshTenant();
      const { path } = await getLoginRedirectPath(result.userId as UUID);
      navigate(path, { replace: true });
    } catch (err) {
      setSubmitError((err as Error)?.message ?? 'Activation failed. Please try again or contact support.');
    } finally {
      setSubmitting(false);
    }
  };

  const keyFormatValid = key.trim().length >= 8;

  return (
    <AuthShell
      title="Activate License"
      subtitle="Enter your license key and company details to create your organisation and sign in."
      sideTitle="Safe Cloud Africa"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Card 1: License Key */}
        <div className="rounded-xl border border-surface-300 bg-white p-4 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-charcoal">
            <KeyRoundIcon className="w-4 h-4 text-teal" />
            Enter License Key
          </h3>
          <input
            type="text"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Paste or type your license key"
            className="mt-2 w-full rounded-lg border border-surface-300 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
            autoComplete="off"
          />
          {keyValidating && (
            <p className="mt-1.5 flex items-center gap-2 text-xs text-charcoal-500">
              <Loader2Icon className="w-3.5 h-3.5 animate-spin" /> Validating…
            </p>
          )}
          {keyError && <p className="mt-1.5 text-xs text-critical">{keyError}</p>}
          {keyInfo && !keyError && (
            <p className="mt-1.5 text-xs text-green-600 font-medium">Key valid — see plan details below.</p>
          )}
        </div>

        {/* Card 2: Company Details */}
        <div className="rounded-xl border border-surface-300 bg-white p-4 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-charcoal">
            <Building2Icon className="w-4 h-4 text-teal" />
            Company Details
          </h3>
          <div className="mt-3 space-y-3">
            <div>
              <label className="block text-xs font-medium text-charcoal-600">Company name *</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-surface-300 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-charcoal-600">Industry (optional)</label>
              <input
                type="text"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="e.g. Mining, Manufacturing"
                className="mt-1 w-full rounded-lg border border-surface-300 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-charcoal-600">Country</label>
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="mt-1 w-full rounded-lg border border-surface-300 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-charcoal-600">Primary contact name *</label>
              <input
                type="text"
                value={primaryContactName}
                onChange={(e) => setPrimaryContactName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-surface-300 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-charcoal-600">Primary contact email (becomes Organisation Owner) *</label>
              <input
                type="email"
                value={primaryContactEmail}
                onChange={(e) => setPrimaryContactEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-surface-300 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-charcoal-600">Phone (optional)</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 w-full rounded-lg border border-surface-300 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
              />
            </div>
            {!isSignedIn && (
              <div>
                <label className="block text-xs font-medium text-charcoal-600">Password (create account) *</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="mt-1 w-full rounded-lg border border-surface-300 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                  minLength={6}
                />
              </div>
            )}
          </div>
        </div>

        {/* Card 3: Confirm Plan */}
        <div className="rounded-xl border border-surface-300 bg-white p-4 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-charcoal">
            <FileCheckIcon className="w-4 h-4 text-teal" />
            Confirm Plan
          </h3>
          {keyInfo ? (
            <div className="mt-3 space-y-1 text-sm">
              <p><span className="font-medium text-charcoal-600">Plan:</span> {PLAN_LABELS[keyInfo.plan_name] ?? keyInfo.plan_name}</p>
              <p><span className="font-medium text-charcoal-600">Billing cycle:</span> {keyInfo.billing_cycle_months} months</p>
              <p><span className="font-medium text-charcoal-600">Seat limit:</span> {keyInfo.seat_limit} users</p>
              {keyInfo.modules_enabled?.length > 0 && (
                <p><span className="font-medium text-charcoal-600">Modules:</span> {keyInfo.modules_enabled.join(', ')}</p>
              )}
              <p className="mt-2 text-xs text-charcoal-500">
                HR module is free with Base, Growth, and Professional plans.
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-charcoal-500">Enter and validate a license key above to see plan details.</p>
          )}
        </div>

        {submitError && (
          <div className="rounded-lg bg-critical/10 px-3 py-2 text-sm text-critical">
            {submitError}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={submitting || !keyInfo || !keyFormatValid}
            className="inline-flex items-center gap-2 rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-50 disabled:pointer-events-none"
          >
            {submitting ? (
              <>
                <Loader2Icon className="w-4 h-4 animate-spin" /> Activating…
              </>
            ) : (
              'Activate & Create Organisation'
            )}
          </button>
          {isSignedIn && (
            <button
              type="button"
              onClick={() => signOut().then(() => navigate('/activate', { replace: true }))}
              className="text-sm text-charcoal-500 hover:text-charcoal"
            >
              Sign out and use a different account
            </button>
          )}
        </div>
      </form>

      <div className="mt-6 flex items-center justify-between text-sm">
        <Link to="/login" className="text-teal font-semibold hover:text-teal-700" aria-label="Go to sign in page">
          Already have an account? Sign in
        </Link>
        <Link to="/" className="text-charcoal-500 hover:text-charcoal">
          Back to landing page
        </Link>
      </div>
    </AuthShell>
  );
}
