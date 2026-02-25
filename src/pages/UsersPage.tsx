import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { UsersIcon, ShieldIcon, PlusIcon, PencilIcon } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import {
  listCompanyInvites,
  listCompanyMemberships,
  updateMembershipRole,
  updateMembershipStatus,
  type InviteCreateResult
} from '../api/services/tenantService';
import type { CompanyInvite, CompanyMembership, UserProfile } from '../api/models/entities';
import { useUser } from '@insforge/react';
import type { CompanyRole } from '../api/models/core';
import { InviteUserModal } from '../components/users/InviteUserModal';
import { listUserProfiles } from '../api/services/profilesService';
import { UserProfileEditModal } from '../components/users/UserProfileEditModal';
import { toCsv, downloadTextFile } from '../utils/csv';
import { useIdentity } from '../hooks/useIdentity';

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

function formatRole(role: string): string {
  if (role === 'owner') return 'Organisation Owner';
  if (role === 'admin') return 'Admin';
  if (role === 'manager') return 'Manager';
  if (role === 'supervisor') return 'Supervisor';
  if (role === 'consultant') return 'Consultant';
  if (role === 'employee') return 'Employee';
  if (role === 'auditor') return 'Auditor';
  return role;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

export function UsersPage() {
  const { user } = useUser();
  const { activeCompanyId, activeRole, activeCompany } = useTenant();
  const { fullName, organisationName } = useIdentity();

  const {
    data: members,
    loading: membersLoading,
    error: membersError,
    retry: refreshMembers
  } = useAsync<CompanyMembership[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listCompanyMemberships(activeCompanyId);
    },
    [activeCompanyId]
  );

  const {
    data: invites,
    loading: invitesLoading,
    error: invitesError,
    retry: refreshInvites
  } = useAsync<CompanyInvite[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listCompanyInvites(activeCompanyId);
    },
    [activeCompanyId]
  );

  const roles = ['admin', 'manager', 'supervisor', 'consultant', 'employee', 'auditor'] as const;
  const canInvite = activeRole === 'owner' || activeRole === 'admin';
  const canEditProfiles = activeRole === 'owner' || activeRole === 'admin' || activeRole === 'manager';
  const canManageMemberships = activeRole === 'owner' || activeRole === 'admin';
  const allowedInviteRoles: CompanyRole[] =
    activeRole === 'owner'
      ? ['admin', 'manager', 'supervisor', 'consultant', 'employee', 'auditor']
      : ['manager', 'supervisor', 'consultant', 'employee', 'auditor'];
  const assignableRoles: CompanyRole[] =
    activeRole === 'owner'
      ? ['admin', 'manager', 'supervisor', 'consultant', 'employee', 'auditor']
      : ['manager', 'supervisor', 'consultant', 'employee', 'auditor'];

  const seatsAllowed = (activeCompany?.license_user_limit ?? activeCompany?.employee_limit ?? 0) as number;
  const seatsUsed = (members ?? []).length;
  const seatsFull = seatsAllowed > 0 && seatsUsed >= seatsAllowed;

  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [inviteFeedback, setInviteFeedback] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [membershipActionLoadingId, setMembershipActionLoadingId] = React.useState<string | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  const [editUserId, setEditUserId] = React.useState<string | null>(null);

  const { data: profiles } = useAsync<UserProfile[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listUserProfiles(activeCompanyId);
    },
    [activeCompanyId]
  );

  const profileByUserId = useMemo(() => new Map((profiles ?? []).map((p) => [p.user_id, p])), [profiles]);
  const selectedProfile = editUserId ? profileByUserId.get(editUserId as any) ?? null : null;

  const combinedUsers = [
    ...(members ?? []).map((m) => ({
      id: `USR-${shortId(m.user_id)}`,
      membershipId: String(m.id),
      name: profileByUserId.get(m.user_id as any)?.full_name ?? `User ${shortId(m.user_id)}`,
      role: formatRole(m.role),
      roleRaw: m.role,
      email: profileByUserId.get(m.user_id as any)?.email ?? '-',
      status: m.status ?? 'ACTIVE',
      userId: m.user_id
    })),
    ...(invites ?? [])
      .filter((i) => !i.accepted_at)
      .map((i) => ({
        id: `INV-${shortId(i.id)}`,
        membershipId: null,
        name: 'Invited user',
        role: formatRole(i.role),
        roleRaw: i.role,
        email: i.email,
        status: 'Invited',
        userId: null
      }))
  ];

  async function refreshUsersData() {
    await Promise.all([refreshMembers(), refreshInvites()]);
  }

  async function handleRoleChange(membershipId: string, role: CompanyRole) {
    if (!activeCompanyId) return;
    setMembershipActionLoadingId(membershipId);
    setInviteFeedback(null);
    try {
      await updateMembershipRole({ companyId: activeCompanyId, membershipId: membershipId as any, role });
      await refreshUsersData();
      setInviteFeedback({ type: 'success', text: 'User role updated successfully.' });
    } catch (err: any) {
      setInviteFeedback({ type: 'error', text: err?.message || 'Failed to update user role.' });
    } finally {
      setMembershipActionLoadingId(null);
    }
  }

  async function handleStatusToggle(membershipId: string, currentStatus: string) {
    if (!activeCompanyId) return;
    const nextStatus = currentStatus === 'DISABLED' ? 'ACTIVE' : 'DISABLED';
    setMembershipActionLoadingId(membershipId);
    setInviteFeedback(null);
    try {
      await updateMembershipStatus({ companyId: activeCompanyId, membershipId: membershipId as any, status: nextStatus });
      await refreshUsersData();
      setInviteFeedback({
        type: 'success',
        text: nextStatus === 'DISABLED' ? 'User deactivated successfully.' : 'User reactivated successfully.'
      });
    } catch (err: any) {
      setInviteFeedback({ type: 'error', text: err?.message || 'Failed to update user status.' });
    } finally {
      setMembershipActionLoadingId(null);
    }
  }

  const onInviteResult = (result: InviteCreateResult, email: string) => {
    if (result.ok) {
      setInviteFeedback({ type: 'success', text: `Invite sent successfully to ${email}.` });
      void refreshUsersData();
      return;
    }
    setInviteFeedback({
      type: 'error',
      text: result.message || 'Invite failed to send. Please try again or contact support.'
    });
  };

  function handleExportCsv() {
    if (!activeCompanyId || combinedUsers.length === 0) return;

    const rows = combinedUsers.map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      email: u.email,
      status: u.status
    }));

    const metaLines = [
      `Company: ${organisationName}`,
      `Generated by: ${fullName}`,
      `Generated at: ${new Date().toISOString()}`,
      ''
    ];

    const csvBody = toCsv(rows);
    const content = `${metaLines.join('\r\n')}\r\n${csvBody}`;
    const safeOrg = organisationName.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'safecloudafrica';
    const today = new Date().toISOString().slice(0, 10);
    const filename = `${safeOrg}-users-${today}.csv`;

    downloadTextFile(filename, content, 'text/csv;charset=utf-8');
  }

  return (
    <Layout title="User, Role & Access Control">
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
        {activeCompany && user?.id && (
          <InviteUserModal
            open={inviteOpen}
            onClose={() => setInviteOpen(false)}
            company={activeCompany}
            actorUserId={user.id}
            allowedRoles={allowedInviteRoles}
            onInviteResult={onInviteResult}
          />
        )}
        {activeCompanyId && editUserId && (
          <UserProfileEditModal
            open={editOpen}
            onClose={() => setEditOpen(false)}
            companyId={activeCompanyId}
            userId={editUserId as any}
            initial={selectedProfile}
            onSaved={() => {
              setEditOpen(false);
              void refreshUsersData();
            }}
          />
        )}

        <motion.div variants={itemVariants} className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-surface-100 rounded-xl">
              <UsersIcon className="w-6 h-6 text-charcoal-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-charcoal">Roles, departments, sites, and permissions</h2>
              <p className="text-sm text-charcoal-400">Company users, roles, and workforce structure (department/site)</p>
              {!!seatsAllowed && (
                <p className="text-xs text-charcoal-500 mt-1">
                  Seats: <span className="font-semibold">{seatsUsed}</span> / {seatsAllowed}{' '}
                  {seatsFull ? <span className="text-critical font-semibold">(limit reached)</span> : null}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!activeCompanyId || combinedUsers.length === 0}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-navy text-white rounded-lg text-sm font-medium hover:bg-navy-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Export CSV
            </button>
            <button
              disabled={!canInvite || seatsFull}
              onClick={() => setInviteOpen(true)}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <PlusIcon className="w-4 h-4" />
              Invite User
            </button>
          </div>
        </motion.div>

        {inviteFeedback && (
          <motion.div
            variants={itemVariants}
            className={`rounded-xl border p-4 ${inviteFeedback.type === 'success' ? 'bg-success/5 border-success/20' : 'bg-critical/5 border-critical/20'}`}
          >
            <p className={`text-sm font-semibold ${inviteFeedback.type === 'success' ? 'text-success' : 'text-critical'}`}>
              {inviteFeedback.type === 'success' ? 'Success' : 'Error'}
            </p>
            <p className="text-sm text-charcoal-600 mt-1">{inviteFeedback.text}</p>
          </motion.div>
        )}

        {(membersError || invitesError) && (
          <motion.div variants={itemVariants} className="bg-white rounded-xl border border-critical/30 shadow-card p-5">
            <p className="text-sm font-semibold text-critical">Unable to load users</p>
            <p className="text-sm text-charcoal-500 mt-1">{(membersError ?? invitesError)?.message}</p>
          </motion.div>
        )}

        <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal mb-2 flex items-center gap-2">
              <ShieldIcon className="w-5 h-5 text-teal" />
              Roles
            </h3>
            <div className="flex flex-wrap gap-2">
              {roles.map((r) => (
                <span key={r} className="px-2 py-1 bg-surface-100 rounded text-xs font-medium text-charcoal-600">
                  {formatRole(r)}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5 lg:col-span-2">
            <h3 className="font-semibold text-charcoal mb-3">Users</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">ID</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Role</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Email</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {(membersLoading || invitesLoading) && (
                    <tr>
                      <td colSpan={6} className="px-4 py-3 text-sm text-charcoal-500">
                        Loading...
                      </td>
                    </tr>
                  )}
                  {!membersLoading && !invitesLoading && combinedUsers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-3 text-sm text-charcoal-500">
                        No users found.
                      </td>
                    </tr>
                  )}
                  {combinedUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-surface-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-teal">{u.id}</td>
                      <td className="px-4 py-3 text-sm text-charcoal">{u.name}</td>
                      <td className="px-4 py-3 text-sm text-charcoal-500">{u.role}</td>
                      <td className="px-4 py-3 text-sm text-charcoal-500">{u.email}</td>
                      <td className="px-4 py-3 text-sm text-charcoal-500">{u.status}</td>
                      <td className="px-4 py-3 text-right">
                        {u.userId && (
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              disabled={!canEditProfiles}
                              onClick={() => {
                                setEditUserId(String(u.userId));
                                setEditOpen(true);
                              }}
                              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              <PencilIcon className="w-4 h-4" />
                              Edit
                            </button>
                            {u.membershipId && canManageMemberships && String(u.userId) !== String(user?.id) && (
                              <>
                                <select
                                  value={String(u.roleRaw)}
                                  disabled={membershipActionLoadingId === u.membershipId}
                                  onChange={(e) => void handleRoleChange(u.membershipId, e.target.value as CompanyRole)}
                                  className="px-2 py-2 rounded-lg border border-surface-300 text-sm text-charcoal bg-white"
                                >
                                  {assignableRoles.map((r) => (
                                    <option key={r} value={r}>
                                      {formatRole(r)}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  disabled={membershipActionLoadingId === u.membershipId}
                                  onClick={() => void handleStatusToggle(u.membershipId, String(u.status))}
                                  className="px-3 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50 disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                  {String(u.status) === 'DISABLED' ? 'Reactivate' : 'Deactivate'}
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </Layout>
  );
}
