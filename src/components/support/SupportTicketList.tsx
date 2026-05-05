import { Link } from 'react-router-dom';
import { MessageSquareIcon } from 'lucide-react';
import {
  formatSupportCategory,
  type SupportTicket
} from '../../api/services/supportService';
import { SupportPriorityBadge, SupportStatusBadge } from './SupportTicketBadges';
import { ListEmptyState } from '../ui/ListEmptyState';

type Props = {
  tickets: SupportTicket[];
  loading?: boolean;
  basePath?: string;
  onSelect?: (ticket: SupportTicket) => void;
};

export function SupportTicketList({ tickets, loading = false, basePath = '/support', onSelect }: Props) {
  if (loading) {
    return (
      <div className="bg-white border border-surface-300 rounded-lg p-6 text-sm text-charcoal-500">
        Loading support tickets...
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <ListEmptyState
        icon={MessageSquareIcon}
        title="No support tickets"
        description="Support requests will appear here after they are created."
      />
    );
  }

  return (
    <div className="bg-white border border-surface-300 rounded-lg overflow-hidden">
      <div className="divide-y divide-surface-100">
        {tickets.map((ticket) => {
          const content = (
            <div className="p-4 hover:bg-surface-50 transition-colors">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-teal">{ticket.reference_number}</span>
                    <SupportStatusBadge status={ticket.status} />
                    <SupportPriorityBadge priority={ticket.priority} />
                  </div>
                  <p className="mt-2 font-semibold text-charcoal truncate">{ticket.subject}</p>
                  <p className="mt-1 text-sm text-charcoal-500">
                    {formatSupportCategory(ticket.category)}
                    {ticket.company_name_snapshot ? ` - ${ticket.company_name_snapshot}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-charcoal-400">
                    Created {new Date(ticket.created_at).toLocaleString()}
                    {ticket.created_by_email ? ` by ${ticket.created_by_email}` : ''}
                  </p>
                </div>
                <span className="text-sm font-medium text-teal">Open</span>
              </div>
            </div>
          );

          if (onSelect) {
            return (
              <button key={ticket.id} type="button" onClick={() => onSelect(ticket)} className="block w-full text-left">
                {content}
              </button>
            );
          }

          return (
            <Link key={ticket.id} to={`${basePath}/${ticket.id}`} className="block">
              {content}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
