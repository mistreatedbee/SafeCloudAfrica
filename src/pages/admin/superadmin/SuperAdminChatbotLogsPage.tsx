import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BotIcon,
  CheckCircleIcon,
  ClockIcon,
  HeadphonesIcon,
  LinkIcon,
  RefreshCwIcon,
  SearchIcon
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { insforge } from '../../../api/insforge/client';
import type { Company, UUID } from '../../../api/models/entities';
import {
  isChatbotLogsSchemaMissingError,
  listChatbotConversationsForSuperAdmin,
  type ChatbotActivityStats,
  type ChatbotConversation,
  type ChatbotConversationFilters,
  type ChatbotDashboardStats
} from '../../../api/services/chatbotLogsService';
import {
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_STATUSES,
  formatSupportCategory,
  formatSupportPriority,
  formatSupportStatus,
  type SupportTicketCategory,
  type SupportTicketPriority,
  type SupportTicketStatus
} from '../../../api/services/supportService';
import { SupportPriorityBadge, SupportStatusBadge } from '../../../components/support/SupportTicketBadges';
import { ListEmptyState } from '../../../components/ui/ListEmptyState';

function StatTile({ label, value, icon: Icon }: { label: string; value: number; icon: LucideIcon }) {
  return (
    <div className="rounded-lg border border-surface-300 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase text-charcoal-400">{label}</p>
        <Icon className="h-4 w-4 text-teal" aria-hidden="true" />
      </div>
      <p className="mt-2 text-2xl font-semibold text-charcoal">{value}</p>
    </div>
  );
}

export function SuperAdminChatbotLogsPage() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<ChatbotConversation[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [filters, setFilters] = useState<ChatbotConversationFilters>({ limit: 500 });
  const [stats, setStats] = useState<ChatbotDashboardStats | null>(null);
  const [activity, setActivity] = useState<ChatbotActivityStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schemaMissing, setSchemaMissing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSchemaMissing(false);
    try {
      const [rows, companyResult] = await Promise.all([
        listChatbotConversationsForSuperAdmin(filters),
        insforge.database.from('companies').select('*').order('name').limit(300)
      ]);
      setConversations(rows);
      setStats(buildDashboardStats(rows));
      setActivity(buildActivityStats(rows));
      if (companyResult.error) throw companyResult.error;
      setCompanies((companyResult.data ?? []) as Company[]);
    } catch (err) {
      if (isChatbotLogsSchemaMissingError(err)) {
        setSchemaMissing(true);
        setConversations([]);
        setStats(null);
        setActivity(null);
        setError('Chatbot log tables are not available yet. Apply docs/migrations/chatbot_logs_super_admin_2026_05_06.sql to the active InsForge database, then refresh this page.');
      } else {
        setError((err as Error)?.message ?? 'Failed to load chatbot logs.');
      }
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const set = (patch: ChatbotConversationFilters) => setFilters((current) => ({ ...current, ...patch }));

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-surface-300 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-teal-50 text-teal">
              <BotIcon className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-charcoal">Chatbot & Support Centre</h1>
              <p className="mt-1 text-sm text-charcoal-500">View signed-in chatbot sessions, AI replies, escalations, and linked support tickets.</p>
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

      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatTile label="Total conversations" value={stats.totalConversations} icon={BotIcon} />
          <StatTile label="Tickets created" value={stats.ticketsCreated} icon={LinkIcon} />
          <StatTile label="New requests" value={stats.newRequests} icon={HeadphonesIcon} />
          <StatTile label="In progress" value={stats.inProgress} icon={ClockIcon} />
          <StatTile label="Escalated" value={stats.escalated} icon={HeadphonesIcon} />
          <StatTile label="Resolved" value={stats.resolved} icon={CheckCircleIcon} />
        </div>
      )}

      <div className="rounded-lg border border-surface-300 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-charcoal-500">Search</label>
            <div className="relative">
              <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-charcoal-300" aria-hidden="true" />
              <input
                value={filters.search ?? ''}
                onChange={(event) => set({ search: event.target.value })}
                placeholder="User, organisation, message, option"
                className="w-full rounded-lg border border-surface-300 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-charcoal-500">Status</label>
            <select value={filters.status ?? 'all'} onChange={(event) => set({ status: event.target.value as SupportTicketStatus | 'all' })} className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm">
              <option value="all">All statuses</option>
              {SUPPORT_TICKET_STATUSES.map((status) => <option key={status} value={status}>{formatSupportStatus(status)}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-charcoal-500">Category</label>
            <select value={filters.category ?? 'all'} onChange={(event) => set({ category: event.target.value as SupportTicketCategory | 'all' })} className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm">
              <option value="all">All categories</option>
              {SUPPORT_TICKET_CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-charcoal-500">Organisation</label>
            <select value={filters.companyId ?? 'all'} onChange={(event) => set({ companyId: event.target.value === 'all' ? null : event.target.value as UUID })} className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm">
              <option value="all">All organisations</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-charcoal-500">Priority</label>
            <select value={filters.priority ?? 'all'} onChange={(event) => set({ priority: event.target.value as SupportTicketPriority | 'all' })} className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm">
              <option value="all">All priorities</option>
              {SUPPORT_TICKET_PRIORITIES.map((priority) => <option key={priority} value={priority}>{formatSupportPriority(priority)}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-charcoal-500">From</label>
            <input type="date" value={filters.dateFrom ?? ''} onChange={(event) => set({ dateFrom: event.target.value || undefined })} className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-charcoal-500">To</label>
            <input type="date" value={filters.dateTo ?? ''} onChange={(event) => set({ dateTo: event.target.value || undefined })} className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm" />
          </div>
        </div>
      </div>

      {error && (
        <div className={`rounded-lg border p-3 text-sm ${schemaMissing ? 'border-warning-200 bg-warning-50 text-warning' : 'border-critical/20 bg-critical/10 text-critical'}`}>
          {error}
        </div>
      )}

      {activity && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          <ActivityPanel title="Top users" items={activity.topUsers} />
          <ActivityPanel title="Top organisations" items={activity.topOrganisations} />
          <ActivityPanel title="Common options" items={activity.commonOptions} />
          <ActivityPanel title="Common categories" items={activity.commonCategories.map((item) => ({ label: formatSupportCategory(item.category), count: item.count }))} />
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-surface-300 bg-white">
        {loading ? (
          <div className="p-6 text-sm text-charcoal-500">Loading chatbot logs...</div>
        ) : schemaMissing ? (
          <ListEmptyState
            icon={BotIcon}
            title="Chatbot log setup needed"
            description="The application is ready, but the active database is missing the chatbot_conversations and chatbot_messages tables."
            primaryAction={{ kind: 'button', label: 'Refresh after migration', onClick: () => void load() }}
            embedded
          />
        ) : conversations.length === 0 ? (
          <ListEmptyState
            icon={BotIcon}
            title="No chatbot logs"
            description="Signed-in chatbot conversations will appear here after users start chatting."
            primaryAction={{ kind: 'button', label: 'Refresh', onClick: () => void load() }}
            embedded
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-surface-200 text-sm">
              <thead className="bg-surface-50 text-left text-xs font-semibold uppercase text-charcoal-400">
                <tr>
                  <th className="px-4 py-3">Ticket</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Organisation</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Message Preview</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {conversations.map((conversation) => (
                  <tr
                    key={conversation.id}
                    onClick={() => navigate(`/super-admin/chatbot-logs/${conversation.id}`)}
                    className="cursor-pointer hover:bg-surface-50"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-teal">
                      {conversation.linked_ticket?.reference_number ?? 'No ticket'}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-charcoal">{conversation.user_name ?? 'Unknown user'}</p>
                      <p className="text-xs text-charcoal-400">{conversation.user_email ?? conversation.user_id ?? 'No email'}</p>
                    </td>
                    <td className="px-4 py-3 text-charcoal-600">{conversation.company_name_snapshot ?? conversation.company_id}</td>
                    <td className="px-4 py-3 text-charcoal-600">{formatSupportCategory(conversation.category)}</td>
                    <td className="max-w-sm px-4 py-3 text-charcoal-500">
                      <span className="line-clamp-2">{conversation.message_preview ?? conversation.selected_option ?? 'No messages logged yet'}</span>
                    </td>
                    <td className="px-4 py-3"><SupportStatusBadge status={conversation.linked_ticket?.status ?? conversation.status} /></td>
                    <td className="px-4 py-3"><SupportPriorityBadge priority={conversation.linked_ticket?.priority ?? conversation.priority} /></td>
                    <td className="whitespace-nowrap px-4 py-3 text-charcoal-400">{new Date(conversation.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function buildDashboardStats(conversations: ChatbotConversation[]): ChatbotDashboardStats {
  return {
    totalConversations: conversations.length,
    ticketsCreated: conversations.filter((item) => Boolean(item.support_ticket_id)).length,
    newRequests: conversations.filter((item) => item.status === 'new').length,
    inProgress: conversations.filter((item) => item.status === 'open' || item.status === 'in_progress' || item.status === 'waiting_for_user').length,
    escalated: conversations.filter((item) => item.status === 'escalated' || item.escalated).length,
    resolved: conversations.filter((item) => item.status === 'resolved' || item.linked_ticket?.status === 'resolved').length
  };
}

function buildActivityStats(conversations: ChatbotConversation[]): ChatbotActivityStats {
  const countBy = (items: Array<string | null | undefined>) => {
    const counts = new Map<string, number>();
    items.filter(Boolean).forEach((item) => counts.set(String(item), (counts.get(String(item)) ?? 0) + 1));
    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  };

  const categoryCounts = new Map<SupportTicketCategory, number>();
  conversations.forEach((conversation) => {
    categoryCounts.set(conversation.category, (categoryCounts.get(conversation.category) ?? 0) + 1);
  });

  return {
    topUsers: countBy(conversations.map((item) => item.user_name || item.user_email || item.user_id)),
    topOrganisations: countBy(conversations.map((item) => item.company_name_snapshot || item.company_id)),
    commonCategories: Array.from(categoryCounts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    commonOptions: countBy(conversations.map((item) => item.selected_option))
  };
}

function ActivityPanel({ title, items }: { title: string; items: Array<{ label: string; count: number }> }) {
  return (
    <div className="rounded-lg border border-surface-300 bg-white p-4">
      <h2 className="text-sm font-semibold text-charcoal">{title}</h2>
      <div className="mt-3 space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-charcoal-400">No activity yet.</p>
        ) : items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-charcoal-600">{item.label}</span>
            <span className="rounded-full bg-surface-100 px-2 py-0.5 text-xs font-semibold text-charcoal-500">{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
