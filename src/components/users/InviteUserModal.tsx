import React, { useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import type { Company, CompanyInvite, UUID } from '../../api/models/entities';
import type { CompanyRole } from '../../api/models/core';
import { createInvite } from '../../api/services/tenantService';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';

export function InviteUserModal(props: {
  open: boolean;
  onClose: () => void;
  company: Company;
  actorUserId: UUID;
  allowedRoles: CompanyRole[];
  onInvited?: (invite: CompanyInvite) => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<CompanyRole>(props.allowedRoles[0] ?? 'employee');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = useMemo(() => email.trim().includes('@') && !!role, [email, role]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      setLoading(true);
      const invite = await createInvite({
        company: props.company,
        actorUserId: props.actorUserId,
        email,
        role
      });
      props.onInvited?.(invite);
      setEmail('');
      props.onClose();
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-lg mx-4 bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <div>
            <p className="text-sm font-semibold text-charcoal">Invite user</p>
            <p className="text-xs text-charcoal-500 mt-0.5">Send an invite to join {props.company.name}</p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-500"
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
              Send invite
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

