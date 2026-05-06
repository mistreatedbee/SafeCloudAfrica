import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUser } from '@insforge/react';
import { CreditCardIcon, RefreshCwIcon, ToggleLeftIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  getSupportTicketWithThread,
  listAllSupportTicketsForSuperAdmin,
  type SupportTicket,
  type SupportTicketCategory,
  type SupportTicketWithThread
} from '../../../api/services/supportService';
import { LicenseActionPanel } from '../../../components/support/LicenseActionPanel';
import { ModuleAccessPanel } from '../../../components/support/ModuleAccessPanel';
import { SupportTicketList } from '../../../components/support/SupportTicketList';
import { SupportTicketThread } from '../../../components/support/SupportTicketThread';

type Config = {
  title: string;
  description: string;
  category: SupportTicketCategory;
  icon: LucideIcon;
};

function SuperAdminCategoryRequestsPage({ config }: { config: Config }) {
  const { user } = useUser();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selected, setSelected] = useState<SupportTicketWithThread | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actorName = useMemo(() => {
    const metadata = (user as any)?.user_metadata ?? {};
    return metadata.full_name ?? metadata.name ?? user?.email ?? null;
  }, [user]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listAllSupportTicketsForSuperAdmin({ category: config.category, limit: 500 });
      setTickets(rows);
      if (selected) setSelected(await getSupportTicketWithThread(selected.ticket.id));
    } catch (err) {
      setError((err as Error)?.message ?? 'Failed to load requests.');
    } finally {
      setLoading(false);
    }
  }, [config.category, selected?.ticket.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectTicket = async (ticket: SupportTicket) => {
    setError(null);
    try {
      setSelected(await getSupportTicketWithThread(ticket.id));
    } catch (err) {
      setError((err as Error)?.message ?? 'Failed to open request.');
    }
  };

  const Icon = config.icon;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-surface-300 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-teal-50 text-teal">
              <Icon className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-charcoal">{config.title}</h1>
              <p className="mt-1 text-sm text-charcoal-500">{config.description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-surface-300 px-4 py-2 text-sm font-medium text-charcoal hover:bg-surface-50"
          >
            <RefreshCwIcon className="h-4 w-4" aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-critical/20 bg-critical/10 p-3 text-sm text-critical">{error}</div>}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className="xl:col-span-2">
          <SupportTicketList tickets={tickets} loading={loading} onSelect={selectTicket} />
        </div>
        <div className="xl:col-span-3 space-y-4">
          {!selected && (
            <div className="rounded-lg border border-surface-300 bg-white p-6 text-sm text-charcoal-500">
              Select a request to process it.
            </div>
          )}
          {selected && user?.id && (
            <>
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

export function SuperAdminLicenseRequestsPage() {
  return (
    <SuperAdminCategoryRequestsPage
      config={{
        title: 'License Requests',
        description: 'Review chatbot and support requests for renewals, billing, subscriptions, and plan changes.',
        category: 'license_subscription',
        icon: CreditCardIcon
      }}
    />
  );
}

export function SuperAdminModuleRequestsPage() {
  return (
    <SuperAdminCategoryRequestsPage
      config={{
        title: 'Module Requests',
        description: 'Review module unlock requests, approvals, rejections, and enablement actions.',
        category: 'module_access',
        icon: ToggleLeftIcon
      }}
    />
  );
}
