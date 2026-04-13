import React, { useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import type { Company, CompanyInvite, Department, Site, UUID } from '../../api/models/entities';
import type { CompanyRole, ModuleKey } from '../../api/models/core';
import { createInvite, type InviteCreateResult } from '../../api/services/tenantService';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import { useAsync } from '../../api/hooks/useAsync';
import { listDepartments } from '../../api/services/departmentsService';
import { listSites } from '../../api/services/sitesService';

export function InviteUserModal(props: {
  open: boolean;
  onClose: () => void;
  company: Company;
  actorUserId: UUID;
  allowedRoles: CompanyRole[];
  onInvited?: (invite: CompanyInvite) => void;
  onInviteResult?: (result: InviteCreateResult, email: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<CompanyRole>(props.allowedRoles[0] ?? 'employee');
  const [departmentId, setDepartmentId] = useState<string>('');
  const [siteId, setSiteId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modulesScope, setModulesScope] = useState<ModuleKey[]>([]);
  const canSubmit = useMemo(() => email.trim().includes('@') && !!role, [email, role]);
  const isScopedExternalRole = role === 'consultant' || role === 'auditor';
  const moduleOptions: ModuleKey[] = ['general', 'safety', 'quality', 'environment', 'health', 'legal', 'hr', 'security'];

  const { data: departments } = useAsync<Department[]>(
    async () => listDepartments(props.company.id),
    [props.company.id]
  );
  const { data: sites } = useAsync<Site[]>(
    async () => listSites(props.company.id),
    [props.company.id]
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      setLoading(true);
      const normalizedEmail = email.trim().toLowerCase();
      const result = await createInvite({
        company: props.company,
        actorUserId: props.actorUserId,
        email,
        role,
        departmentId: departmentId || null,
        siteId: siteId || null,
        modulesScope
      });
      props.onInviteResult?.(result, normalizedEmail);
      if (result.ok) {
        props.onInvited?.(result.invite);
        setEmail('');
        setDepartmentId('');
        setSiteId('');
        setModulesScope([]);
        props.onClose();
        return;
      }
      setError(result.message);
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90dvh] overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <div>
            <p className="text-sm font-semibold text-charcoal">Invite user</p>
            <p className="text-xs text-charcoal-500 mt-0.5">Send an invite to join {props.company.name}</p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-surface-100 text-charcoal-500 shrink-0"
            aria-label="Close"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
              <p className="text-sm font-semibold text-critical">Invite failed</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Email address</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. lerato@company.co.za"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as CompanyRole)}
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            >
              {props.allowedRoles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <p className="text-xs text-charcoal-500 mt-1">
              Invited users will only see data within this company workspace.
            </p>
          </div>

          {isScopedExternalRole && (
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Module scope (optional)</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 rounded-lg border border-surface-300 p-3">
                {moduleOptions.map((moduleKey) => {
                  const checked = modulesScope.includes(moduleKey);
                  return (
                    <label key={moduleKey} className="inline-flex items-center gap-2 text-sm text-charcoal-600">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setModulesScope((prev) =>
                            prev.includes(moduleKey) ? prev.filter((m) => m !== moduleKey) : [...prev, moduleKey]
                          );
                        }}
                        className="rounded border-surface-300 text-teal focus:ring-teal"
                      />
                      <span className="capitalize">{moduleKey.replace('_', ' ')}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-charcoal-500 mt-1">Only selected modules are accessible for this invite.</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Department (optional)</label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                <option value="">No department</option>
                {(departments ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Site (optional)</label>
              <select
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                <option value="">No site</option>
                {(sites ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={props.onClose}
              className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading && <LoadingSpinner size={16} />}
              {loading ? 'Sending...' : 'Send invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
