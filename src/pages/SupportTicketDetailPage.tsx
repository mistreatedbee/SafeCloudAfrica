import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeftIcon, CheckCircleIcon, ClockIcon } from 'lucide-react';
import { useUser } from '@insforge/react';
import { Layout } from '../components/layout/Layout';
import { useTenant } from '../tenant/TenantContext';
import {
  canViewOrganisationSupportTickets,
  formatSupportCategory,
  getSupportTicketWithThread,
  updateSupportTicketStatus,
  type SupportTicketWithThread
} from '../api/services/supportService';
import { SupportPriorityBadge, SupportStatusBadge } from '../components/support/SupportTicketBadges';
import { SupportTicketThread } from '../components/support/SupportTicketThread';

export function SupportTicketDetailPage() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const { user } = useUser();
  const { activeRole } = useTenant();
  const [thread, setThread] = useState<SupportTicketWithThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const userName = useMemo(() => {
    const metadata = (user as any)?.user_metadata ?? {};
    return metadata.full_name ?? metadata.name ?? user?.email ?? null;
  }, [user]);

  const load = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    setError(null);
    try {
      setThread(await getSupportTicketWithThread(ticketId));
    } catch (err) {
      setError((err as Error)?.message ?? 'Failed to load ticket.');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    void load();
  }, [load]);

  const closeTicket = async () => {
    if (!thread || !user?.id) return;
    setSaving(true);
    try {
      await updateSupportTicketStatus({
        ticketId: thread.ticket.id,
        status: 'closed',
        actorUserId: user.id,
        actorName: userName,
        notify: false
      });
      await load();
    } catch (err) {
      setError((err as Error)?.message ?? 'Failed to close ticket.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout title="Support Ticket">
      <div className="space-y-5">
        <Link to="/support" className="inline-flex items-center gap-2 text-sm font-medium text-teal hover:text-teal-700">
          <ArrowLeftIcon className="w-4 h-4" />
          Back to support
        </Link>

        {loading && <div className="bg-white rounded-lg border border-surface-300 p-6 text-sm text-charcoal-500">Loading ticket...</div>}
        {error && <div className="bg-critical/10 rounded-lg border border-critical/20 p-4 text-sm text-critical">{error}</div>}
        {!loading && !thread && <div className="bg-white rounded-lg border border-surface-300 p-6 text-sm text-charcoal-500">Ticket not found.</div>}

        {thread && user?.id && (
          <>
            <div className="bg-white rounded-lg border border-surface-300 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-teal">{thread.ticket.reference_number}</span>
                    <SupportStatusBadge status={thread.ticket.status} />
                    <SupportPriorityBadge priority={thread.ticket.priority} />
                  </div>
                  <h1 className="mt-3 text-2xl font-semibold text-charcoal">{thread.ticket.subject}</h1>
                  <p className="mt-1 text-sm text-charcoal-500">
                    {formatSupportCategory(thread.ticket.category)} - Created {new Date(thread.ticket.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {thread.ticket.status !== 'closed' && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={closeTicket}
                      className="inline-flex items-center gap-2 rounded-lg border border-surface-300 px-4 py-2 text-sm font-medium text-charcoal hover:bg-surface-50 disabled:opacity-50"
                    >
                      <CheckCircleIcon className="w-4 h-4" />
                      Close ticket
                    </button>
                  )}
                  {canViewOrganisationSupportTickets(activeRole) && (
                    <span className="inline-flex items-center gap-2 rounded-lg bg-surface-100 px-3 py-2 text-sm text-charcoal-500">
                      <ClockIcon className="w-4 h-4" />
                      Organisation view
                    </span>
                  )}
                </div>
              </div>
            </div>

            <SupportTicketThread
              thread={thread}
              currentUser={{
                id: user.id,
                name: userName,
                email: user.email ?? null,
                role: canViewOrganisationSupportTickets(activeRole) ? 'org_admin' : 'user'
              }}
              onChanged={load}
            />
          </>
        )}
      </div>
    </Layout>
  );
}
