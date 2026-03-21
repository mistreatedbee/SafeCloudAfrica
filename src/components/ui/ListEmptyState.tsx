import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

export type ListEmptyAction =
  | { kind: 'link'; to: string; label: string }
  | { kind: 'button'; label: string; onClick: () => void; disabled?: boolean };

export type ListEmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  primaryAction: ListEmptyAction;
  secondaryAction?: ListEmptyAction;
  /** Omit outer card when this sits inside an existing bordered panel */
  embedded?: boolean;
  className?: string;
  /** When set, renders a single `<tr>` with one `<td colSpan={n}>` for table bodies */
  tableColSpan?: number;
};

const primaryBtn =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors bg-teal text-white hover:bg-teal-600 disabled:opacity-60 disabled:cursor-not-allowed';
const secondaryBtn =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors border border-surface-300 text-charcoal hover:bg-surface-50 disabled:opacity-60 disabled:cursor-not-allowed';

function renderAction(action: ListEmptyAction, variant: 'primary' | 'secondary') {
  const cls = variant === 'primary' ? primaryBtn : secondaryBtn;
  if (action.kind === 'link') {
    return (
      <Link to={action.to} className={cls}>
        {action.label}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} onClick={action.onClick} disabled={action.disabled}>
      {action.label}
    </button>
  );
}

function Inner({
  icon: Icon,
  title,
  description,
  primaryAction,
  secondaryAction
}: Omit<ListEmptyStateProps, 'embedded' | 'className' | 'tableColSpan'>) {
  return (
    <div className="flex flex-col items-center text-center max-w-md mx-auto">
      <div className="rounded-full bg-teal/10 p-3 mb-4" aria-hidden>
        <Icon className="w-8 h-8 text-teal" />
      </div>
      <h3 className="text-lg font-semibold text-charcoal">{title}</h3>
      <p className="text-sm text-charcoal-500 mt-2">{description}</p>
      <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
        {renderAction(primaryAction, 'primary')}
        {secondaryAction ? renderAction(secondaryAction, 'secondary') : null}
      </div>
    </div>
  );
}

export function ListEmptyState({
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  embedded = false,
  className = '',
  tableColSpan
}: ListEmptyStateProps) {
  const innerProps = { icon, title, description, primaryAction, secondaryAction };

  if (tableColSpan != null) {
    return (
      <tr className={className}>
        <td colSpan={tableColSpan} className="px-4 py-10 align-middle">
          <Inner {...innerProps} />
        </td>
      </tr>
    );
  }

  if (embedded) {
    return (
      <div className={['py-6', className].filter(Boolean).join(' ')}>
        <Inner {...innerProps} />
      </div>
    );
  }

  return (
    <div
      className={['bg-white rounded-xl border border-surface-300 shadow-card p-8', className].filter(Boolean).join(' ')}
    >
      <Inner {...innerProps} />
    </div>
  );
}
