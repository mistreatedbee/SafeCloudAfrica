import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { HelpCircleIcon, MessageSquareIcon, RefreshCwIcon } from 'lucide-react';
import { useUser } from '@insforge/react';
import { Layout } from '../components/layout/Layout';
import { paaq } from '../lib/paaq';
import { useTenant } from '../tenant/TenantContext';
import {
  canViewOrganisationSupportTickets,
  listMySupportTickets,
  listOrganisationSupportTickets,
  type SupportTicket
} from '../api/services/supportService';
import { SupportAssistant } from '../components/support/SupportAssistant';
import { SupportTicketForm } from '../components/support/SupportTicketForm';
import { SupportTicketList } from '../components/support/SupportTicketList';

export function HelpSupportPage() {
  const { user } = useUser();
  const { activeCompanyId, activeCompany, activeRole } = useTenant();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<'mine' | 'organisation'>('mine');
  const [refreshKey, setRefreshKey] = useState(0);

  const canViewOrg = canViewOrganisationSupportTickets(activeRole);
  const userName = useMemo(() => {
    const metadata = (user as any)?.user_metadata ?? {};
    return metadata.full_name ?? metadata.name ?? user?.email ?? null;
  }, [user]);

  const loadTickets = useCallback(async () => {
    if (!activeCompanyId || !user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const rows = scope === 'organisation' && canViewOrg
        ? await listOrganisationSupportTickets(activeCompanyId, { limit: 100 })
        : await listMySupportTickets(activeCompanyId, user.id, 100);
      setTickets(rows);
    } catch (err) {
      // This is caught and shown as an inline message, not thrown or
      // console.error'd — invisible to automatic error capture entirely.
      // Report it explicitly so a real failure here shows up with session
      // replay, same as an uncaught exception would.
      paaq.trackError(err, { screen: '/support', context: { scope, activeCompanyId } });
      setError((err as Error)?.message ?? 'Failed to load support tickets.');
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId, canViewOrg, scope, user?.id]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets, refreshKey]);

  const refresh = () => setRefreshKey((value) => value + 1);

  if (!activeCompanyId || !user?.id) {
    return (
      <Layout title="Support Centre">
        <div className="bg-white rounded-lg border border-surface-300 p-6 text-sm text-charcoal-500">
          Select an organisation workspace to contact support.
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Support Centre">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div className="bg-white rounded-lg border border-surface-300 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-teal-50 text-teal">
                <HelpCircleIcon className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-charcoal">Support Centre</h1>
                <p className="mt-1 text-sm text-charcoal-500">
                  Create support requests, renew licenses, unlock modules, report issues, and track ticket replies.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={refresh}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-surface-300 px-4 py-2 text-sm font-medium text-charcoal hover:bg-surface-50"
            >
              <RefreshCwIcon className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <SupportAssistant
            companyId={activeCompanyId}
            companyName={activeCompany?.name ?? null}
            userId={user.id}
            userName={userName}
            userEmail={user.email ?? null}
            onCreated={refresh}
          />
          <SupportTicketForm
            companyId={activeCompanyId}
            companyName={activeCompany?.name ?? null}
            userId={user.id}
            userName={userName}
            userEmail={user.email ?? null}
            onCreated={refresh}
          />
        </div>

        <div className="bg-white rounded-lg border border-surface-300 p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <MessageSquareIcon className="w-5 h-5 text-teal" />
              <h2 className="text-lg font-semibold text-charcoal">Support Requests</h2>
            </div>
            {canViewOrg && (
              <div className="inline-flex rounded-lg border border-surface-300 p-1">
                <button
                  type="button"
                  onClick={() => setScope('mine')}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${scope === 'mine' ? 'bg-teal text-white' : 'text-charcoal-500 hover:bg-surface-50'}`}
                >
                  My tickets
                </button>
                <button
                  type="button"
                  onClick={() => setScope('organisation')}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${scope === 'organisation' ? 'bg-teal text-white' : 'text-charcoal-500 hover:bg-surface-50'}`}
                >
                  Organisation tickets
                </button>
              </div>
            )}
          </div>
          {error && <p className="mt-3 text-sm text-critical">{error}</p>}
          <div className="mt-4">
            <SupportTicketList tickets={tickets} loading={loading} basePath="/support" />
          </div>
        </div>
      </motion.div>
    </Layout>
  );
}
