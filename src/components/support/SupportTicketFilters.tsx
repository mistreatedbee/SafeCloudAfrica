import {
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_STATUSES,
  formatSupportStatus,
  type SupportTicketCategory,
  type SupportTicketFilters as SupportFilters,
  type SupportTicketPriority,
  type SupportTicketStatus
} from '../../api/services/supportService';

type Props = {
  filters: SupportFilters;
  onChange: (filters: SupportFilters) => void;
  showOrganisation?: boolean;
};

export function SupportTicketFilters({ filters, onChange, showOrganisation = false }: Props) {
  const set = (patch: SupportFilters) => onChange({ ...filters, ...patch });

  return (
    <div className="bg-white border border-surface-300 rounded-lg p-4">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <div className={showOrganisation ? 'md:col-span-2' : 'md:col-span-2'}>
          <label className="block text-xs font-semibold text-charcoal-500 mb-1">Search</label>
          <input
            value={filters.search ?? ''}
            onChange={(event) => set({ search: event.target.value })}
            placeholder="Ticket, subject, company, email"
            className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-charcoal-500 mb-1">Category</label>
          <select
            value={filters.category ?? 'all'}
            onChange={(event) => set({ category: event.target.value as SupportTicketCategory | 'all' })}
            className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
          >
            <option value="all">All categories</option>
            {SUPPORT_TICKET_CATEGORIES.map((category) => (
              <option key={category.value} value={category.value}>{category.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-charcoal-500 mb-1">Status</label>
          <select
            value={filters.status ?? 'all'}
            onChange={(event) => set({ status: event.target.value as SupportTicketStatus | 'all' })}
            className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
          >
            <option value="all">All statuses</option>
            {SUPPORT_TICKET_STATUSES.map((status) => (
              <option key={status} value={status}>{formatSupportStatus(status)}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-charcoal-500 mb-1">Priority</label>
          <select
            value={filters.priority ?? 'all'}
            onChange={(event) => set({ priority: event.target.value as SupportTicketPriority | 'all' })}
            className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
          >
            <option value="all">All priorities</option>
            {SUPPORT_TICKET_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>{priority.charAt(0).toUpperCase() + priority.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
