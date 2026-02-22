import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { UsersIcon, SearchIcon } from 'lucide-react';
import { useUser } from '@insforge/react';
import { useAsync } from '../../../api/hooks/useAsync';
import { listAllMemberships, updateMembershipRole, type MembershipRow } from '../../../api/services/superAdminUsersService';
import { logPlatformAdminAction } from '../../../api/services/platformAdminAuditService';
import type { CompanyRole } from '../../../api/models/core';
import type { UUID } from '../../../api/models/entities';

const ROLES: CompanyRole[] = ['owner', 'admin', 'manager', 'supervisor', 'consultant', 'employee', 'auditor'];

function formatRole(r: string): string {
  return r.charAt(0).toUpperCase() + r.slice(1);
}

export function SuperAdminUsersPage() {
  const { user } = useUser();
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [version, setVersion] = useState(0);

  const { data: rows, loading, error } = useAsync(listAllMemberships, [version]);

  const list = rows ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (r) =>
        (r.company_name ?? '').toLowerCase().includes(q) ||
        (r.email ?? '').toLowerCase().includes(q) ||
        (r.full_name ?? '').toLowerCase().includes(q) ||
        (r.role ?? '').toLowerCase().includes(q)
    );
  }, [list, query]);

  const handleRoleChange = async (membershipId: string, targetUserId: string, targetCompanyId: string, newRole: CompanyRole) => {
    setMessage(null);
    try {
      await updateMembershipRole(membershipId as UUID, newRole);
      if (user?.id) {
        await logPlatformAdminAction(user.id as UUID, {
          action: 'user_role_changed',
          target_company_id: targetCompanyId as UUID,
          target_user_id: targetUserId as UUID,
          details: { new_role: newRole }
        });
      }
      setMessage({ type: 'success', text: 'Role updated.' });
      setVersion((v) => v + 1);
    } catch (err) {
      setMessage({ type: 'error', text: String((err as Error)?.message ?? err) });
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
        <p className="text-sm font-semibold text-charcoal flex items-center gap-2">
          <UsersIcon className="w-4 h-4 text-teal" /> Users
        </p>
        <p className="text-sm text-charcoal-500 mt-1">
          View and manage users across organisations. Reassign roles within a tenant. For password reset, direct users to the Forgot password page.
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

      <div className="relative w-full max-w-md">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by org, email, name, role…"
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
        />
      </div>

      {error && <p className="text-sm text-critical">{String((error as Error)?.message)}</p>}

      {loading && <p className="text-sm text-charcoal-500">Loading…</p>}

      {!loading && list.length === 0 && <p className="text-sm text-charcoal-500">No memberships found.</p>}

      {!loading && filtered.length > 0 && (
        <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Organisation</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Name</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Email</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Role</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Change role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-50">
                    <td className="px-5 py-3 text-sm text-charcoal">{r.company_name ?? '—'}</td>
                    <td className="px-5 py-3 text-sm text-charcoal">{r.full_name ?? '—'}</td>
                    <td className="px-5 py-3 text-sm text-charcoal-500">{r.email ?? '—'}</td>
                    <td className="px-5 py-3 text-sm text-charcoal-500">{formatRole(r.role)}</td>
                    <td className="px-5 py-3">
                      <select
                        value={r.role}
                        onChange={(e) => handleRoleChange(r.id, r.user_id, r.company_id, e.target.value as CompanyRole)}
                        className="text-sm border border-surface-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-teal"
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {formatRole(role)}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </motion.div>
  );
}
