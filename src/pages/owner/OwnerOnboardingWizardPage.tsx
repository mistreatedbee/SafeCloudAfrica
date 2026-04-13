import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2Icon, UserPlusIcon, UsersIcon, LayersIcon, CheckCircleIcon, ArrowRightIcon } from 'lucide-react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import { listSites, createSite } from '../../api/services/sitesService';
import { listDepartments, createDepartment } from '../../api/services/departmentsService';
import { listCompanyMemberships, updateCompanyProfile, type InviteCreateResult } from '../../api/services/tenantService';
import { insforge } from '../../api/insforge/client';
import { InviteUserModal } from '../../components/users/InviteUserModal';
import type { UUID } from '../../api/models/core';

const STEPS = [
  { id: 'setup', title: 'Organisation setup', icon: Building2Icon },
  { id: 'admin', title: 'Assign Admin', icon: UserPlusIcon },
  { id: 'invite', title: 'Invite users', icon: UsersIcon },
  { id: 'modules', title: 'Enable modules', icon: LayersIcon }
];

export function OwnerOnboardingWizardPage() {
  const navigate = useNavigate();
  const { user } = useUser();
  const { activeCompanyId, activeCompany } = useTenant();
  const [stepIndex, setStepIndex] = useState(0);
  const [refresh, setRefresh] = useState(0);

  const { data: sites } = useAsync(async () => (activeCompanyId ? listSites(activeCompanyId) : []), [activeCompanyId, refresh]);
  const { data: departments } = useAsync(async () => (activeCompanyId ? listDepartments(activeCompanyId) : []), [activeCompanyId, refresh]);
  const { data: members } = useAsync(async () => (activeCompanyId ? listCompanyMemberships(activeCompanyId) : []), [activeCompanyId, refresh]);

  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteAddress, setNewSiteAddress] = useState('');
  const [newDeptName, setNewDeptName] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteStep, setInviteStep] = useState<'admin' | 'users'>('admin');
  const [moduleToggles, setModuleToggles] = useState<Record<string, boolean>>({});
  const [finishing, setFinishing] = useState(false);
  const [completionMessage, setCompletionMessage] = useState<string | null>(null);
  const [inviteFeedback, setInviteFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [latestInviteLink, setLatestInviteLink] = useState<string | null>(null);

  const { data: licenseRow } = useAsync(
    async () => {
      if (!activeCompanyId) return null;
      const { data } = await insforge.database.from('org_licenses').select('modules_enabled').eq('company_id', activeCompanyId).order('end_date', { ascending: false }).limit(1).maybeSingle();
      return data as { modules_enabled?: string[] } | null;
    },
    [activeCompanyId]
  );

  const subscriptionModules = (licenseRow?.modules_enabled && Array.isArray(licenseRow.modules_enabled) ? licenseRow.modules_enabled : ['General', 'HR']) as string[];
  const seatsUsed = (members ?? []).length;
  const seatsTotal = activeCompany?.employee_limit ?? 0;
  const hasAdmin = (members ?? []).some((m: { role: string }) => m.role === 'admin');

  const onboardingComplete = (activeCompany?.metadata as { onboarding_completed_at?: string } | undefined)?.onboarding_completed_at;
  if (onboardingComplete && stepIndex === 0 && refresh === 0) {
    navigate('/org/dashboard', { replace: true });
    return null;
  }

  const handleAddSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCompanyId || !user?.id || !newSiteName.trim()) return;
    await createSite({ companyId: activeCompanyId, name: newSiteName.trim(), address: newSiteAddress.trim() || null, actorUserId: user.id as UUID });
    setNewSiteName('');
    setNewSiteAddress('');
    setRefresh((r) => r + 1);
  };

  const handleAddDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCompanyId || !user?.id || !newDeptName.trim()) return;
    await createDepartment({ companyId: activeCompanyId, name: newDeptName.trim(), actorUserId: user.id as UUID });
    setNewDeptName('');
    setRefresh((r) => r + 1);
  };

  const handleFinish = async () => {
    if (!activeCompanyId || !activeCompany) return;
    setFinishing(true);
    try {
      const meta = (activeCompany?.metadata ?? {}) as Record<string, unknown>;
      const enabledModules = subscriptionModules.filter((m) => moduleToggles[m] !== false);
      const onboardingCompletedAt = new Date().toISOString();
      await updateCompanyProfile({
        companyId: activeCompanyId,
        actorUserId: user?.id as UUID,
        metadata: {
          ...meta,
          onboarding_completed_at: onboardingCompletedAt,
          onboarding_summary: {
            organization_name: activeCompany.name,
            logo_bucket: (meta as any)?.logo_bucket ?? null,
            logo_key: (meta as any)?.logo_key ?? null,
            sites: (sites ?? []).map((s: any) => ({ id: s.id, name: s.name })),
            departments: (departments ?? []).map((d: any) => ({ id: d.id, name: d.name })),
            modules_enabled: enabledModules,
            seats_total: seatsTotal,
            seats_used: seatsUsed,
            completed_at: onboardingCompletedAt
          }
        }
      });
      setCompletionMessage('Organization setup complete. Your system is ready.');
      window.setTimeout(() => {
        navigate('/org/dashboard?onboarding=complete', { replace: true });
      }, 1200);
    } finally {
      setFinishing(false);
    }
  };

  async function copyLatestInviteLink() {
    if (!latestInviteLink) return;
    try {
      await navigator.clipboard.writeText(latestInviteLink);
      setInviteFeedback({ type: 'success', text: 'Invite link copied to clipboard.' });
    } catch {
      setInviteFeedback({ type: 'error', text: 'Could not copy invite link. Please copy it manually.' });
    }
  }

  if (!activeCompanyId || !activeCompany) {
    return (
      <Layout title="Onboarding">
        <p className="text-charcoal-500">Loading…</p>
      </Layout>
    );
  }

  return (
    <Layout title="Welcome — Set up your organisation">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-2 text-sm text-charcoal-500">
          {STEPS.map((s, i) => (
            <React.Fragment key={s.id}>
              <button
                type="button"
                onClick={() => setStepIndex(i)}
                className={`flex items-center gap-1.5 ${i === stepIndex ? 'font-semibold text-teal' : 'hover:text-charcoal'}`}
              >
                <s.icon className="w-4 h-4" />
                {s.title}
              </button>
              {i < STEPS.length - 1 && <ArrowRightIcon className="w-4 h-4 text-charcoal-300" />}
            </React.Fragment>
          ))}
        </div>

        {completionMessage && (
          <div className="bg-success/5 border border-success/20 rounded-xl p-4">
            <p className="text-sm font-semibold text-success">Setup complete</p>
            <p className="text-sm text-charcoal-600 mt-1">{completionMessage}</p>
          </div>
        )}
        {inviteFeedback && (
          <div className={`rounded-xl p-4 border ${inviteFeedback.type === 'success' ? 'bg-success/5 border-success/20' : 'bg-critical/5 border-critical/20'}`}>
            <p className={`text-sm font-semibold ${inviteFeedback.type === 'success' ? 'text-success' : 'text-critical'}`}>
              {inviteFeedback.type === 'success' ? 'Success' : 'Error'}
            </p>
            <p className="text-sm text-charcoal-600 mt-1">{inviteFeedback.text}</p>
            {latestInviteLink && inviteFeedback.type === 'error' && (
              <div className="mt-3 flex flex-wrap gap-2 items-center">
                <button
                  type="button"
                  onClick={() => void copyLatestInviteLink()}
                  className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50"
                >
                  Copy Invite Link
                </button>
                <a
                  href={latestInviteLink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-teal hover:underline"
                >
                  Open link
                </a>
              </div>
            )}
          </div>
        )}

        {stepIndex === 0 && (
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5 space-y-6">
            <h2 className="text-lg font-semibold text-charcoal">Sites and departments</h2>
            <form onSubmit={handleAddSite} className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-charcoal-500 mb-1">Site name</label>
                <input value={newSiteName} onChange={(e) => setNewSiteName(e.target.value)} className="w-full min-w-[180px] px-3 py-2 border border-surface-300 rounded-lg text-sm" placeholder="e.g. Head Office" />
              </div>
              <div>
                <label className="block text-xs font-medium text-charcoal-500 mb-1">Address (optional)</label>
                <input value={newSiteAddress} onChange={(e) => setNewSiteAddress(e.target.value)} className="w-full min-w-[200px] px-3 py-2 border border-surface-300 rounded-lg text-sm" placeholder="Address" />
              </div>
              <button type="submit" className="px-4 py-2 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600">Add site</button>
            </form>
            <form onSubmit={handleAddDepartment} className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-charcoal-500 mb-1">Department name</label>
                <input value={newDeptName} onChange={(e) => setNewDeptName(e.target.value)} className="w-full min-w-[180px] px-3 py-2 border border-surface-300 rounded-lg text-sm" placeholder="e.g. Safety" />
              </div>
              <button type="submit" className="px-4 py-2 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600">Add department</button>
            </form>
            <div className="text-sm text-charcoal-500">
              Sites: {(sites ?? []).length}. Departments: {(departments ?? []).length}.
            </div>
          </div>
        )}

        {stepIndex === 1 && (
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5 space-y-4">
            <h2 className="text-lg font-semibold text-charcoal">Assign an Admin</h2>
            <p className="text-sm text-charcoal-500">Invite a user with the Admin role. They can manage users and settings.</p>
            {hasAdmin && <p className="text-sm text-green-600 font-medium flex items-center gap-2"><CheckCircleIcon className="w-4 h-4" /> An admin has been assigned.</p>}
            <button type="button" onClick={() => { setInviteStep('admin'); setInviteOpen(true); }} className="px-4 py-2 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600">
              Invite Admin
            </button>
            <InviteUserModal
              open={inviteOpen && inviteStep === 'admin'}
              onClose={() => setInviteOpen(false)}
              company={activeCompany}
              actorUserId={user!.id as UUID}
              allowedRoles={['admin']}
              onInvited={() => setRefresh((r) => r + 1)}
              onInviteResult={(result: InviteCreateResult, _email: string) => {
                if (result.ok) {
                  if (result.status === 'FAILED') {
                    setLatestInviteLink(result.inviteLink ?? null);
                    setInviteFeedback({ type: 'error', text: result.message || 'Invite created, but email failed. Copy link and send manually.' });
                  } else {
                    setLatestInviteLink(null);
                    setInviteFeedback({ type: 'success', text: 'Invite email sent successfully.' });
                  }
                } else {
                  setLatestInviteLink(null);
                  setInviteFeedback({ type: 'error', text: result.message || 'Email failed to send, try again.' });
                }
              }}
            />
          </div>
        )}

        {stepIndex === 2 && (
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5 space-y-4">
            <h2 className="text-lg font-semibold text-charcoal">Invite users</h2>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium text-charcoal">Seats:</span>
              <span className="text-charcoal-600">{seatsUsed} / {seatsTotal} used</span>
            </div>
            {seatsUsed >= seatsTotal && seatsTotal > 0 && <p className="text-sm text-amber-600">Seat limit reached. Upgrade to add more users.</p>}
            <button type="button" onClick={() => { setInviteStep('users'); setInviteOpen(true); }} disabled={seatsUsed >= seatsTotal} className="px-4 py-2 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 disabled:opacity-50">
              Invite user
            </button>
            <InviteUserModal
              open={inviteOpen && inviteStep === 'users'}
              onClose={() => setInviteOpen(false)}
              company={activeCompany}
              actorUserId={user!.id as UUID}
              allowedRoles={['admin', 'manager', 'supervisor', 'consultant', 'employee', 'auditor']}
              onInvited={() => setRefresh((r) => r + 1)}
              onInviteResult={(result: InviteCreateResult, _email: string) => {
                if (result.ok) {
                  if (result.status === 'FAILED') {
                    setLatestInviteLink(result.inviteLink ?? null);
                    setInviteFeedback({ type: 'error', text: result.message || 'Invite created, but email failed. Copy link and send manually.' });
                  } else {
                    setLatestInviteLink(null);
                    setInviteFeedback({ type: 'success', text: 'Invite email sent successfully.' });
                  }
                } else {
                  setLatestInviteLink(null);
                  setInviteFeedback({ type: 'error', text: result.message || 'Email failed to send, try again.' });
                }
              }}
            />
          </div>
        )}

        {stepIndex === 3 && (
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5 space-y-4">
            <h2 className="text-lg font-semibold text-charcoal">Enable modules</h2>
            <p className="text-sm text-charcoal-500">Your plan includes: {subscriptionModules.join(', ')}. HR is free with Base, Growth, and Professional.</p>
            <div className="space-y-2">
              {subscriptionModules.map((mod) => (
                <label key={mod} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={moduleToggles[mod] !== false}
                    onChange={(e) => setModuleToggles((t) => ({ ...t, [mod]: e.target.checked }))}
                  />
                  <span className="text-sm text-charcoal">{mod}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-between">
          <button type="button" onClick={() => setStepIndex((i) => Math.max(0, i - 1))} className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50">
            Back
          </button>
          {stepIndex < STEPS.length - 1 ? (
            <button type="button" onClick={() => setStepIndex((i) => i + 1)} className="px-4 py-2 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600">
              Next
            </button>
          ) : (
            <button type="button" onClick={handleFinish} disabled={finishing} className="px-4 py-2 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 disabled:opacity-50">
              {finishing ? 'Finishing…' : 'Finish setup'}
            </button>
          )}
        </div>
      </div>
    </Layout>
  );
}
