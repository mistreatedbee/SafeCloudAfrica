import React from 'react';
type StatusBadgeProps = {
  // Accepts any domain status string (task, audit, document, NCR, etc.) — statusConfig
  // below covers the known ones and falls back to the "draft" style for anything else.
  status: string;
  size?: 'sm' | 'md';
};
const statusConfig: Record<
  string,
  {
    bg: string;
    text: string;
    label: string;
  }> =
{
  completed: {
    bg: 'bg-success-50',
    text: 'text-success-700',
    label: 'Completed'
  },
  'in-progress': {
    bg: 'bg-teal-50',
    text: 'text-teal-700',
    label: 'In Progress'
  },
  pending: {
    bg: 'bg-warning-50',
    text: 'text-warning-700',
    label: 'Pending'
  },
  overdue: {
    bg: 'bg-critical-50',
    text: 'text-critical-700',
    label: 'Overdue'
  },
  draft: {
    bg: 'bg-charcoal-50',
    text: 'text-charcoal-600',
    label: 'Draft'
  },
  open: {
    bg: 'bg-critical-50',
    text: 'text-critical-700',
    label: 'Open'
  },
  closed: {
    bg: 'bg-success-50',
    text: 'text-success-700',
    label: 'Closed'
  },
  investigating: {
    bg: 'bg-warning-50',
    text: 'text-warning-700',
    label: 'Investigating'
  },
  valid: {
    bg: 'bg-success-50',
    text: 'text-success-700',
    label: 'Valid'
  },
  expiring: {
    bg: 'bg-warning-50',
    text: 'text-warning-700',
    label: 'Expiring Soon'
  },
  expired: {
    bg: 'bg-critical-50',
    text: 'text-critical-700',
    label: 'Expired'
  },
  scheduled: {
    bg: 'bg-teal-50',
    text: 'text-teal-700',
    label: 'Scheduled'
  },
  'awaiting-documents': {
    bg: 'bg-warning-50',
    text: 'text-warning-700',
    label: 'Awaiting Documents'
  },
  'ready-for-audit': {
    bg: 'bg-teal-50',
    text: 'text-teal-700',
    label: 'Ready for Audit'
  },
  'report-pending': {
    bg: 'bg-warning-50',
    text: 'text-warning-700',
    label: 'Report Pending'
  },
  'corrective-actions-open': {
    bg: 'bg-critical-50',
    text: 'text-critical-700',
    label: 'Corrective Actions Open'
  },
  'under-closure-review': {
    bg: 'bg-warning-50',
    text: 'text-warning-700',
    label: 'Under Closure Review'
  },
  archived: {
    bg: 'bg-charcoal-50',
    text: 'text-charcoal-600',
    label: 'Archived'
  }
};
export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.draft;
  const sizeStyles =
  size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm';
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${config.bg} ${config.text} ${sizeStyles}`}>

      {config.label}
    </span>);

}