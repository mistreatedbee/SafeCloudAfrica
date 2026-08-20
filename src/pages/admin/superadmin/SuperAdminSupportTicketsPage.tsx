import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUser } from '@insforge/react';
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  HeadphonesIcon,
  RefreshCwIcon,
  SendIcon
} from 'lucide-react';
import { insforge } from '../../../api/insforge/client';
import type { Company, UUID } from '../../../api/models/entities';
import {
  assignSupportTicket,
  escalateSupportTicket,
  getSupportDashboardStats,
  getSupportTicketWithThread,
  listAllSupportTicketsForSuperAdmin,
  resolveSupportTicket,
  updateSupportTicketStatus,
  type SupportDashboardStats,
  type SupportTicket,
  type SupportTicketFilters as SupportTicketFiltersState,
  type SupportTicketStatus,
  type SupportTicketWithThread
} from '../../../api/services/supportService';
import { SupportTicketFilters as SupportTicketFilterControls } from '../../../components/support/SupportTicketFilters';
import { SupportTicketList } from '../../../components/support/SupportTicketList';
import { SupportPriorityBadge, SupportStatusBadge } from '../../../components/support/SupportTicketBadges';
import { SupportTicketThread } from '../../../components/support/SupportTicketThread';
import { LicenseActionPanel } from '../../../components/support/LicenseActionPanel';
import { ModuleAccessPanel } from '../../../components/support/ModuleAccessPanel';

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-surface-300 bg-white p-4">
      <p className="text-xs font-semibold uppercase text-charcoal-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-charcoal">{value}</p>
    </div>
  );
}

export function SuperAdminSupportTicketsPage() {
  const { user } = useUser();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [filters, setFilters] = useState<SupportTicketFiltersState>({ limit: 300 });
  const [stats, setStats] = useState<SupportDashboardStats | null>(null);
  const [selected, setSelected] = useState<SupportTicketWithThread | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actorName = useMemo(() => {
    const metadata = (user as any)?.user_metadata ?? {};
    return metadata.full_name ?? metadata.name ?? user?.email ?? null;
  }, [user]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ticketRows, statRows, companyResult] = await Promise.all([
        listAllSupportTicketsForSuperAdmin(filters),
        getSupportDashboardStats(filters),
        insforge.database.from('companies').select('*').order('name').limit(300)
      ]);
      setTickets(ticketRows);
      setStats(statRows);
      if (companyResult.error) throw companyResult.error;
      setCompanies((companyResult.data ?? []) as Company[]);
      if (selected) {
        setSelected(await getSupportTicketWithThread(selected.ticket.id));
      }
    } catch (err) {
      setError((err as Error)?.message ?? 'Failed to load support tickets.');
    } finally {
      setLoading(false);
    }
  }, [filters, selected?.ticket.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectTicket = async (ticket: SupportTicket) => {
    setError(null);
    try {
      setSelected(await getSupportTicketWithThread(ticket.id));
    } catch (err) {
      setError((err as Error)?.message ?? 'Failed to open ticket.');
    }
  };

  const mutateSelected = async (action: () => Promise<SupportTicket>) => {
    if (!user?.id) return;
    setSaving(true);
    setError(null);
    try {
      const ticket = await action();
      setSelected(await getSupportTicketWithThread(ticket.id));
      await load();
    } catch (err) {
      setError((err as Error)?.message ?? 'Support action failed.');
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = (status: SupportTicketStatus) => {
    if (!selected || !user?.id) return;
    void mutateSelected(() => updateSupportTicketStatus({
      ticketId: selected.ticket.id,
      status,
      actorUserId: user.id,
      actorName,
      notify: true
    }));
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-surface-300 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-teal-50 text-teal">
              <HeadphonesIcon className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-charcoal">Admin Support Centre</h1>
              <p className="mt-1 text-sm text-charcoal-500">View, respond, escalate, resolve, and process organisation support requests.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-surface-300 px-4 py-2 text-sm font-medium text-charcoal hover:bg-surface-50"
          >
            <RefreshCwIcon className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
          <StatTile label="Total" value={stats.total} />
          <StatTile label="New" value={stats.newTickets} />
          <StatTile label="Open" value={stats.openTickets} />
          <StatTile label="Escalated" value={stats.escalatedTickets} />
          <StatTile label="Resolved month" value={stats.resolvedThisMonth} />
          <StatTile label="License" value={stats.licenseRequests} />
          <StatTile label="Modules" value={stats.moduleRequests} />
        </div>
      )}

      <div className="bg-white border border-surface-300 rounded-lg p-4">
        <label className="block text-xs font-semibold text-charcoal-500 mb-1">Organisation</label>
        <select
          value={filters.companyId ?? 'all'}
          onChange={(event) => setFilters((prev) => ({ ...prev, companyId: event.target.value === 'all' ? null : event.target.value as UUID }))}
          className="w-full max-w-md rounded-lg border border-surface-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
        >
          <option value="all">All organisations</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>{company.name}</option>
          ))}
        </select>
      </div>

      <SupportTicketFilterControls filters={filters} onChange={setFilters} showOrganisation />
      {error && <div className="rounded-lg border border-critical/20 bg-critical/10 p-3 text-sm text-critical">{error}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-2">
          <SupportTicketList tickets={tickets} loading={loading} onSelect={selectTicket} />
        </div>
        <div className="xl:col-span-3 space-y-4">
          {!selected && (
            <div className="rounded-lg border border-surface-300 bg-white p-6 text-sm text-charcoal-500">
              Select a support ticket to manage it.
            </div>
          )}

          {selected && user?.id && (
            <>
              <div className="rounded-lg border border-surface-300 bg-white p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-teal">{selected.ticket.reference_number}</span>
                      <SupportStatusBadge status={selected.ticket.status} />
                      <SupportPriorityBadge priority={selected.ticket.priority} />
                    </div>
                    <h2 className="mt-3 text-xl font-semibold text-charcoal">{selected.ticket.subject}</h2>
                    <p className="mt-1 text-sm text-charcoal-500">
                      {selected.ticket.company_name_snapshot ?? 'Organisation'} - {selected.ticket.created_by_email ?? 'Unknown user'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => updateStatus('in_progress')}
                      className="inline-flex items-center gap-2 rounded-lg border border-surface-300 px-3 py-2 text-sm font-medium text-charcoal hover:bg-surface-50 disabled:opacity-50"
                    >
                      <SendIcon className="w-4 h-4" />
                      In progress
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void mutateSelected(() => escalateSupportTicket({ ticketId: selected.ticket.id, actorUserId: user.id, actorName }))}
                      className="inline-flex items-center gap-2 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-sm font-medium text-warning hover:bg-warning-100 disabled:opacity-50"
                    >
                      <AlertTriangleIcon className="w-4 h-4" />
                      Escalate
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void mutateSelected(() => resolveSupportTicket({ ticketId: selected.ticket.id, actorUserId: user.id, actorName }))}
                      className="inline-flex items-center gap-2 rounded-lg border border-success-200 bg-success-50 px-3 py-2 text-sm font-medium text-success hover:bg-success-100 disabled:opacity-50"
                    >
                      <CheckCircleIcon className="w-4 h-4" />
                      Resolve
                    </button>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    placeholder="Assign to user id"
                    className="rounded-lg border border-surface-300 px-3 py-2 text-sm"
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' || !user?.id) return;
                      const value = (event.currentTarget.value.trim() || null) as UUID | null;
                      void mutateSelected(() => assignSupportTicket({
                        ticketId: selected.ticket.id,
                        assignedToUserId: value,
                        actorUserId: user.id,
                        actorName
                      }));
                    }}
                  />
                  <select
                    value={selected.ticket.status}
                    onChange={(event) => updateStatus(event.target.value as SupportTicketStatus)}
                    className="rounded-lg border border-surface-300 px-3 py-2 text-sm"
                  >
                    <option value="new">New</option>
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="waiting_for_user">Waiting for User</option>
                    <option value="escalated">Escalated</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
              </div>

              <LicenseActionPanel ticket={selected.ticket} actorUserId={user.id} actorName={actorName} onProcessed={load} />
              <ModuleAccessPanel ticket={selected.ticket} actorUserId={user.id} actorName={actorName} onProcessed={load} />

              <SupportTicketThread
                thread={selected}
                currentUser={{
                  id: user.id,
                  name: actorName,
                  email: user.email ?? null,
                  role: 'super_admin'
                }}
                canAddInternalNote
                onChanged={async () => {
                  const refreshed = await getSupportTicketWithThread(selected.ticket.id);
                  setSelected(refreshed);
                  await load();
                }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
