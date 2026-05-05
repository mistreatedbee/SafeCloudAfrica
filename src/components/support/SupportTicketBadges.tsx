import {
  formatSupportPriority,
  formatSupportStatus,
  type SupportTicketPriority,
  type SupportTicketStatus
} from '../../api/services/supportService';

const statusClasses: Record<SupportTicketStatus, string> = {
  new: 'bg-blue-50 text-blue-700 border-blue-200',
  open: 'bg-teal-50 text-teal-700 border-teal-200',
  in_progress: 'bg-purple-50 text-purple-700 border-purple-200',
  waiting_for_user: 'bg-amber-50 text-amber-700 border-amber-200',
  escalated: 'bg-critical/10 text-critical border-critical/25',
  resolved: 'bg-success-50 text-success border-success-200',
  closed: 'bg-surface-100 text-charcoal-500 border-surface-300'
};

const priorityClasses: Record<SupportTicketPriority, string> = {
  low: 'bg-surface-100 text-charcoal-500 border-surface-300',
  medium: 'bg-teal-50 text-teal-700 border-teal-200',
  high: 'bg-warning-50 text-warning border-warning-200',
  critical: 'bg-critical/10 text-critical border-critical/25'
};

export function SupportStatusBadge({ status }: { status: SupportTicketStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses[status]}`}>
      {formatSupportStatus(status)}
    </span>
  );
}

export function SupportPriorityBadge({ priority }: { priority: SupportTicketPriority }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${priorityClasses[priority]}`}>
      {formatSupportPriority(priority)}
    </span>
  );
}
