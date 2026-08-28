import React, { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  SettingsIcon,
  BuildingIcon,
  BellIcon,
  ShieldIcon,
  PaletteIcon,
  GlobeIcon,
  MailIcon,
  SaveIcon } from
'lucide-react';
import { Layout } from '../components/layout/Layout';
import { useTenant } from '../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { updateCompanyProfile } from '../api/services/tenantService';
import { insforge } from '../api/insforge/client';
import { uploadFile } from '../api/services/storageService';
import { formatAuthError } from '../auth/authMessages';
const settingsSections = [
{
  id: 'company',
  name: 'Company Profile',
  icon: BuildingIcon,
  description: 'Organization details and branding'
},
{
  id: 'notifications',
  name: 'Notifications',
  icon: BellIcon,
  description: 'Email and in-app notification preferences'
},
{
  id: 'security',
  name: 'Security',
  icon: ShieldIcon,
  description: 'Password policies and access controls'
},
{
  id: 'appearance',
  name: 'Appearance',
  icon: PaletteIcon,
  description: 'Theme and display settings'
},
{
  id: 'integrations',
  name: 'Integrations',
  icon: GlobeIcon,
  description: 'Third-party connections and APIs'
},
{
  id: 'email',
  name: 'Email Templates',
  icon: MailIcon,
  description: 'Customize notification emails'
}];

const containerVariants = {
  hidden: {
    opacity: 0
  },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
};
const itemVariants = {
  hidden: {
    opacity: 0,
    y: 20
  },
  visible: {
    opacity: 1,
    y: 0
  }
};
export function SettingsPage() {
  const [activeSection, setActiveSection] = useState('company');
  const { user } = useUser();
  const { activeCompany, activeCompanyId, activeRole, refreshTenant } = useTenant();
  const canManage = activeRole === 'owner' || activeRole === 'admin' || activeRole === 'manager';

  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);

  const meta = (activeCompany?.metadata ?? {}) as Record<string, any>;
  const initialSettings = (meta.settings ?? {}) as Record<string, any>;

  // Company profile
  const [companyName, setCompanyName] = useState(activeCompany?.name ?? '');
  const [registrationNumber, setRegistrationNumber] = useState(meta.registration_number ?? '');
  const [industry, setIndustry] = useState(meta.industry ?? 'Manufacturing');
  const [employeeCount, setEmployeeCount] = useState(String(meta.employee_count ?? ''));
  const [address, setAddress] = useState(meta.address ?? '');

  // Notifications
  const [notificationPrefs, setNotificationPrefs] = useState<Record<string, { email: boolean; inApp: boolean }>>(
    initialSettings.notificationPrefs ?? {
      incidentAlerts: { email: true, inApp: true },
      taskReminders: { email: true, inApp: true },
      trainingExpiry: { email: true, inApp: false },
      auditSchedules: { email: false, inApp: true },
      documentReviews: { email: true, inApp: true }
    }
  );

  // Security
  const [minPasswordLength, setMinPasswordLength] = useState(String(initialSettings.minPasswordLength ?? 10));
  const [requireSpecialChar, setRequireSpecialChar] = useState(Boolean(initialSettings.requireSpecialChar ?? true));
  const [mfaPlanned, setMfaPlanned] = useState(Boolean(initialSettings.mfaPlanned ?? false));

  // Appearance
  const [theme, setTheme] = useState<string>(initialSettings.theme ?? 'system');

  // Integrations
  const [webhookUrl, setWebhookUrl] = useState(initialSettings.webhookUrl ?? '');
  const [whatsappPlanned, setWhatsappPlanned] = useState(Boolean(initialSettings.whatsappPlanned ?? true));

  // Email templates
  const [emailFromName, setEmailFromName] = useState(initialSettings.emailFromName ?? 'Safe Cloud Africa');
  const [emailReplyTo, setEmailReplyTo] = useState(initialSettings.emailReplyTo ?? '');
  const [emailFooter, setEmailFooter] = useState(
    initialSettings.emailFooter ?? 'This message was sent by Safe Cloud Africa (IDSMP). Please do not reply if you received it in error.'
  );

  const logoBucket = meta.logo_bucket as string | undefined;
  const logoKey = meta.logo_key as string | undefined;
  const logoUrl = useMemo(() => {
    if (!logoBucket || !logoKey) return null;
    try {
      return insforge.storage.from(logoBucket).getPublicUrl(logoKey);
    } catch {
      return null;
    }
  }, [logoBucket, logoKey]);

  async function save(patch: { name?: string; metadata?: Record<string, unknown> | null }, okMessage: string) {
    if (!activeCompanyId) return;
    setSaving(true);
    setSaveError(null);
    setSaveOk(null);
    try {
      await updateCompanyProfile({ companyId: activeCompanyId, ...patch });
      await refreshTenant();
      setSaveOk(okMessage);
      setTimeout(() => setSaveOk(null), 4000);
    } catch (err: any) {
      setSaveError(formatAuthError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoSelected(file: File) {
    if (!activeCompanyId || !canManage) return;
    setSaveError(null);
    try {
      setSaving(true);
      const bucket = 'sca-logos' as const;
      const key = `${activeCompanyId}/${Date.now()}-${file.name}`.replace(/\s+/g, '_');
      const uploaded = await uploadFile(bucket, file, { key });
      const nextMeta = {
        ...(meta ?? {}),
        logo_bucket: bucket,
        logo_key: uploaded.key
      };
      await save({ metadata: nextMeta }, 'Logo updated');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout title="Settings">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-6">

        <motion.div
          variants={itemVariants}
          className="grid grid-cols-1 lg:grid-cols-4 gap-6">

          {/* Settings Navigation */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
              <div className="p-4 border-b border-surface-200">
                <h3 className="font-semibold text-charcoal flex items-center gap-2">
                  <SettingsIcon className="w-5 h-5 text-teal" />
                  Settings
                </h3>
              </div>
              <nav className="p-2">
                {settingsSections.map((section) =>
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeSection === section.id ? 'bg-teal-50 text-teal' : 'text-charcoal-500 hover:bg-surface-50 hover:text-charcoal'}`}>

                    <section.icon className="w-5 h-5" />
                    {section.name}
                  </button>
                )}
              </nav>
            </div>
          </div>

          {/* Settings Content */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-xl border border-surface-300 shadow-card p-6">
              {saveError && (
                <div className="mb-4 bg-critical/5 border border-critical/20 rounded-xl p-3">
                  <p className="text-sm font-semibold text-critical">Could not save</p>
                  <p className="text-sm text-charcoal-600 mt-1">{saveError}</p>
                </div>
              )}
              {saveOk && (
                <div className="mb-4 bg-success/5 border border-success/20 rounded-xl p-3">
                  <p className="text-sm font-semibold text-success">{saveOk}</p>
                </div>
              )}
              {!canManage && (
                <div className="mb-4 bg-warning/5 border border-warning/20 rounded-xl p-3">
                  <p className="text-sm font-semibold text-warning">Read-only</p>
                  <p className="text-sm text-charcoal-600 mt-1">Only Company Owners, Admins, and Managers can change settings.</p>
                </div>
              )}
              {activeSection === 'company' &&
              <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-charcoal mb-1">
                      Company Profile
                    </h3>
                    <p className="text-sm text-charcoal-400">
                      Update your organization details and branding
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">
                        Company Name
                      </label>
                      <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent" />

                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">
                        Registration Number
                      </label>
                      <input
                      type="text"
                      value={registrationNumber}
                      onChange={(e) => setRegistrationNumber(e.target.value)}
                      className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent" />

                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">
                        Industry
                      </label>
                      <select
                        value={industry}
                        onChange={(e) => setIndustry(e.target.value)}
                        className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                      >
                        <option>Manufacturing</option>
                        <option>Mining</option>
                        <option>Construction</option>
                        <option>Logistics</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">
                        Number of Employees
                      </label>
                      <input
                      type="number"
                      value={employeeCount}
                      onChange={(e) => setEmployeeCount(e.target.value)}
                      className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent" />

                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-charcoal mb-1.5">
                        Address
                      </label>
                      <textarea
                      rows={3}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent resize-none" />

                    </div>
                  </div>

                  <div className="pt-4 border-t border-surface-200">
                    <h4 className="font-medium text-charcoal mb-4">
                      Company Logo
                    </h4>
                    <div className="flex items-center gap-4">
                      <div className="w-20 h-20 bg-surface-100 rounded-xl flex items-center justify-center border-2 border-dashed border-surface-300 overflow-hidden">
                        {logoUrl ? (
                          <img src={logoUrl} alt="Company logo" className="w-full h-full object-cover" />
                        ) : (
                          <BuildingIcon className="w-8 h-8 text-charcoal-300" />
                        )}
                      </div>
                      <div>
                        <input
                          ref={logoInputRef}
                          type="file"
                          accept="image/png,image/jpeg"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void handleLogoSelected(f);
                          }}
                        />
                        <button
                          type="button"
                          disabled={!canManage || saving}
                          onClick={() => logoInputRef.current?.click()}
                          className="px-4 py-2 bg-surface-100 text-charcoal rounded-lg text-sm font-medium hover:bg-surface-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          Upload Logo
                        </button>
                        <p className="text-xs text-charcoal-400 mt-1">
                          PNG, JPG up to 2MB
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-4">
                    <button
                      type="button"
                      disabled={!canManage || saving || !activeCompanyId || !user?.id}
                      onClick={() => {
                        const nextMeta: Record<string, unknown> = {
                          ...(meta ?? {}),
                          registration_number: registrationNumber,
                          industry,
                          employee_count: employeeCount ? Number(employeeCount) : null,
                          address
                        };
                        void save({ name: companyName, metadata: nextMeta }, 'Company profile saved');
                      }}
                      className="flex items-center gap-2 px-5 py-2.5 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <SaveIcon className="w-4 h-4" />
                      Save Changes
                    </button>
                  </div>
                </div>
              }

              {activeSection === 'notifications' &&
              <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-charcoal mb-1">
                      Notification Preferences
                    </h3>
                    <p className="text-sm text-charcoal-400">
                      Configure how you receive alerts and updates
                    </p>
                  </div>

                  <div className="space-y-4">
                    {[
                  {
                    label: 'Incident Alerts',
                    description: 'Receive notifications for new incidents',
                    key: 'incidentAlerts'
                  },
                  {
                    label: 'Task Reminders',
                    description:
                    'Get reminded about upcoming and overdue tasks',
                    key: 'taskReminders'
                  },
                  {
                    label: 'Training Expiry',
                    description: 'Alerts when training is about to expire',
                    key: 'trainingExpiry'
                  },
                  {
                    label: 'Audit Schedules',
                    description: 'Notifications for scheduled audits',
                    key: 'auditSchedules'
                  },
                  {
                    label: 'Document Reviews',
                    description: 'Alerts for documents requiring review',
                    key: 'documentReviews'
                  }].
                  map((item, index) =>
                  <div
                    key={index}
                    className="flex items-center justify-between py-3 border-b border-surface-100 last:border-0">

                        <div>
                          <p className="font-medium text-charcoal">
                            {item.label}
                          </p>
                          <p className="text-sm text-charcoal-400">
                            {item.description}
                          </p>
                        </div>
                        <div className="flex items-center gap-6">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                          type="checkbox"
                          checked={Boolean(notificationPrefs[item.key]?.email)}
                          disabled={!canManage}
                          onChange={(e) =>
                            setNotificationPrefs((prev) => ({
                              ...prev,
                              [item.key]: { ...(prev[item.key] ?? { email: false, inApp: false }), email: e.target.checked }
                            }))
                          }
                          className="w-4 h-4 rounded border-surface-300 text-teal focus:ring-teal" />

                            <span className="text-sm text-charcoal-500">
                              Email
                            </span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                          type="checkbox"
                          checked={Boolean(notificationPrefs[item.key]?.inApp)}
                          disabled={!canManage}
                          onChange={(e) =>
                            setNotificationPrefs((prev) => ({
                              ...prev,
                              [item.key]: { ...(prev[item.key] ?? { email: false, inApp: false }), inApp: e.target.checked }
                            }))
                          }
                          className="w-4 h-4 rounded border-surface-300 text-teal focus:ring-teal" />

                            <span className="text-sm text-charcoal-500">
                              In-App
                            </span>
                          </label>
                        </div>
                      </div>
                  )}
                  </div>

                  <div className="flex justify-end pt-4">
                    <button
                      type="button"
                      disabled={!canManage || saving || !activeCompanyId}
                      onClick={() => {
                        const nextMeta: Record<string, any> = { ...(meta ?? {}) };
                        nextMeta.settings = {
                          ...(initialSettings ?? {}),
                          notificationPrefs
                        };
                        void save({ metadata: nextMeta }, 'Notification preferences saved');
                      }}
                      className="flex items-center gap-2 px-5 py-2.5 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <SaveIcon className="w-4 h-4" />
                      Save Preferences
                    </button>
                  </div>
                </div>
              }

              {activeSection === 'security' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-charcoal mb-1">Security</h3>
                    <p className="text-sm text-charcoal-400">Password policies and access controls</p>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="font-semibold text-blue-900 mb-2">Password Policies</h4>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-charcoal mb-1.5">Minimum password length</label>
                          <input
                            type="number"
                            min={6}
                            max={32}
                            value={minPasswordLength}
                            onChange={(e) => setMinPasswordLength(e.target.value)}
                            disabled={!canManage}
                            className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue focus:border-transparent disabled:bg-surface-50"
                          />
                          <p className="text-xs text-charcoal-400 mt-1">Default: 8 characters</p>
                        </div>

                        <label className="flex items-center gap-3 p-2">
                          <input
                            type="checkbox"
                            checked={requireSpecialChar}
                            onChange={(e) => setRequireSpecialChar(e.target.checked)}
                            disabled={!canManage}
                            className="w-4 h-4 rounded border-surface-300 text-blue focus:ring-blue"
                          />
                          <div>
                            <p className="text-sm font-medium text-charcoal">Require uppercase letters</p>
                            <p className="text-xs text-charcoal-400">Enforce A-Z in passwords</p>
                          </div>
                        </label>

                        <label className="flex items-center gap-3 p-2">
                          <input
                            type="checkbox"
                            checked={requireSpecialChar}
                            onChange={(e) => setRequireSpecialChar(e.target.checked)}
                            disabled={!canManage}
                            className="w-4 h-4 rounded border-surface-300 text-blue focus:ring-blue"
                          />
                          <div>
                            <p className="text-sm font-medium text-charcoal">Require numbers</p>
                            <p className="text-xs text-charcoal-400">Enforce 0-9 in passwords</p>
                          </div>
                        </label>

                        <label className="flex items-center gap-3 p-2">
                          <input
                            type="checkbox"
                            checked={requireSpecialChar}
                            onChange={(e) => setRequireSpecialChar(e.target.checked)}
                            disabled={!canManage}
                            className="w-4 h-4 rounded border-surface-300 text-blue focus:ring-blue"
                          />
                          <div>
                            <p className="text-sm font-medium text-charcoal">Require special characters</p>
                            <p className="text-xs text-charcoal-400">Enforce !@#$%^&* in passwords</p>
                          </div>
                        </label>
                      </div>
                    </div>

                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                      <h4 className="font-semibold text-purple-900 mb-2">Multi-Factor Authentication</h4>
                      <div className="space-y-3">
                        <label className="flex items-center gap-3 p-2">
                          <input
                            type="checkbox"
                            checked={mfaPlanned}
                            onChange={(e) => setMfaPlanned(e.target.checked)}
                            disabled={!canManage}
                            className="w-4 h-4 rounded border-surface-300 text-purple-600 focus:ring-purple-600"
                          />
                          <div>
                            <p className="text-sm font-medium text-charcoal">Require MFA for all users</p>
                            <p className="text-xs text-charcoal-400">Phase 3: InsForge MFA integration</p>
                          </div>
                        </label>

                        <label className="flex items-center gap-3 p-2">
                          <input
                            type="checkbox"
                            disabled
                            className="w-4 h-4 rounded border-surface-300 text-gray-400"
                          />
                          <div>
                            <p className="text-sm font-medium text-charcoal-400">TOTP (Google Authenticator)</p>
                            <p className="text-xs text-charcoal-400">Coming in Phase 3</p>
                          </div>
                        </label>

                        <label className="flex items-center gap-3 p-2">
                          <input
                            type="checkbox"
                            disabled
                            className="w-4 h-4 rounded border-surface-300 text-gray-400"
                          />
                          <div>
                            <p className="text-sm font-medium text-charcoal-400">Email verification</p>
                            <p className="text-xs text-charcoal-400">Coming in Phase 3</p>
                          </div>
                        </label>
                      </div>
                    </div>

                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                      <h4 className="font-semibold text-orange-900 mb-2">Session Management</h4>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-charcoal mb-1.5">Session timeout (minutes)</label>
                          <input
                            type="number"
                            min={15}
                            max={480}
                            value={minPasswordLength}
                            onChange={(e) => setMinPasswordLength(e.target.value)}
                            disabled={!canManage}
                            className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange focus:border-transparent disabled:bg-surface-50"
                          />
                          <p className="text-xs text-charcoal-400 mt-1">Default: 480 minutes (8 hours)</p>
                        </div>

                        <label className="flex items-center gap-3 p-2">
                          <input
                            type="checkbox"
                            disabled
                            className="w-4 h-4 rounded border-surface-300 text-gray-400"
                          />
                          <div>
                            <p className="text-sm font-medium text-charcoal-400">Limit concurrent sessions</p>
                            <p className="text-xs text-charcoal-400">Phase 3: Sessions table</p>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-4 border-t border-surface-200">
                    <button
                      type="button"
                      disabled={!canManage || saving || !activeCompanyId}
                      onClick={() => {
                        const nextMeta: Record<string, any> = { ...(meta ?? {}) };
                        nextMeta.security = {
                          minPasswordLength: Number(minPasswordLength) || 8,
                          requireSpecialChar,
                          mfaRequired: mfaPlanned
                        };
                        void save({ metadata: nextMeta }, 'Security settings saved');
                      }}
                      className="flex items-center gap-2 px-5 py-2.5 bg-blue text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <SaveIcon className="w-4 h-4" />
                      Save Security Settings
                    </button>
                  </div>
                </div>
              )}

              {activeSection === 'appearance' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-charcoal mb-1">Appearance</h3>
                    <p className="text-sm text-charcoal-400">Theme and display settings</p>
                  </div>
                  <div className="max-w-md">
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Theme</label>
                    <select
                      value={String(theme)}
                      disabled={!canManage}
                      onChange={(e) => setTheme(e.target.value)}
                      className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                    >
                      <option value="system">System</option>
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                    </select>
                    <p className="text-xs text-charcoal-400 mt-1">Theme application is planned; selection is saved per company.</p>
                  </div>
                  <div className="flex justify-end pt-4">
                    <button
                      type="button"
                      disabled={!canManage || saving || !activeCompanyId}
                      onClick={() => {
                        const nextMeta: Record<string, any> = { ...(meta ?? {}) };
                        nextMeta.settings = { ...(initialSettings ?? {}), theme };
                        void save({ metadata: nextMeta }, 'Appearance settings saved');
                      }}
                      className="flex items-center gap-2 px-5 py-2.5 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <SaveIcon className="w-4 h-4" />
                      Save Appearance
                    </button>
                  </div>
                </div>
              )}

              {activeSection === 'integrations' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-charcoal mb-1">Integrations</h3>
                    <p className="text-sm text-charcoal-400">Third-party connections and APIs</p>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Webhook URL (optional)</label>
                      <input
                        value={webhookUrl}
                        disabled={!canManage}
                        onChange={(e) => setWebhookUrl(e.target.value)}
                        placeholder="https://..."
                        className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                      />
                      <p className="text-xs text-charcoal-400 mt-1">Used for outbound events (webhooks).</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={whatsappPlanned}
                        disabled={!canManage}
                        onChange={(e) => setWhatsappPlanned(e.target.checked)}
                        className="w-4 h-4 rounded border-surface-300 text-teal focus:ring-teal"
                      />
                      <div>
                        <p className="text-sm font-medium text-charcoal">WhatsApp/SMS escalation (Planned Upgrade)</p>
                        <p className="text-xs text-charcoal-400">Tracks rollout readiness for critical alerts</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end pt-4">
                    <button
                      type="button"
                      disabled={!canManage || saving || !activeCompanyId}
                      onClick={() => {
                        const nextMeta: Record<string, any> = { ...(meta ?? {}) };
                        nextMeta.settings = { ...(initialSettings ?? {}), webhookUrl, whatsappPlanned };
                        void save({ metadata: nextMeta }, 'Integration settings saved');
                      }}
                      className="flex items-center gap-2 px-5 py-2.5 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <SaveIcon className="w-4 h-4" />
                      Save Integrations
                    </button>
                  </div>
                </div>
              )}

              {activeSection === 'email' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-charcoal mb-1">Email Templates</h3>
                    <p className="text-sm text-charcoal-400">Customize notification emails</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">From name</label>
                      <input
                        value={emailFromName}
                        disabled={!canManage}
                        onChange={(e) => setEmailFromName(e.target.value)}
                        className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Reply-to (optional)</label>
                      <input
                        value={emailReplyTo}
                        disabled={!canManage}
                        onChange={(e) => setEmailReplyTo(e.target.value)}
                        placeholder="support@yourcompany.co.za"
                        className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Footer</label>
                      <textarea
                        rows={4}
                        value={emailFooter}
                        disabled={!canManage}
                        onChange={(e) => setEmailFooter(e.target.value)}
                        className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent resize-none"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end pt-4">
                    <button
                      type="button"
                      disabled={!canManage || saving || !activeCompanyId}
                      onClick={() => {
                        const nextMeta: Record<string, any> = { ...(meta ?? {}) };
                        nextMeta.settings = { ...(initialSettings ?? {}), emailFromName, emailReplyTo, emailFooter };
                        void save({ metadata: nextMeta }, 'Email templates saved');
                      }}
                      className="flex items-center gap-2 px-5 py-2.5 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <SaveIcon className="w-4 h-4" />
                      Save Email
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </Layout>);

}
