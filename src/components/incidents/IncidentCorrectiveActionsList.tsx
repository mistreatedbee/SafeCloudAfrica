import React from 'react';
import { PlusIcon, PencilIcon } from 'lucide-react';
import type { IncidentCorrectiveAction, UUID } from '../../api/models/entities';

export type IncidentCorrectiveActionsListProps = {
  incidentId: UUID;
  companyId: UUID;
  actions: IncidentCorrectiveAction[];
  onAdd: () => void;
  onEdit: (actionId: UUID) => void;
  disabled?: boolean;
};

const statusColors = {
  'Open': 'bg-blue-100 text-blue-700',
  'In Progress': 'bg-yellow-100 text-yellow-700',
  'Awaiting Evidence': 'bg-orange-100 text-orange-700',
  'Under Review': 'bg-purple-100 text-purple-700',
  'Closed': 'bg-green-100 text-green-700'
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-ZA', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatCauseLink(action: IncidentCorrectiveAction): string {
  const raw = String(action.source_cause_text ?? '').trim();
  if (!raw) return '-';
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' | ');
}

export function IncidentCorrectiveActionsList({
  actions,
  onAdd,
  onEdit,
  disabled = false
}: IncidentCorrectiveActionsListProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-charcoal">Corrective Actions</label>
        <button
          type="button"
          onClick={onAdd}
          disabled={disabled}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-teal text-white rounded-lg hover:bg-teal-600 disabled:opacity-60"
        >
          <PlusIcon className="w-4 h-4" />
          Add Action
        </button>
      </div>

      {actions.length === 0 ? (
        <div className="text-sm text-charcoal-500 text-center py-4 border border-dashed border-surface-300 rounded-lg">
          No corrective actions yet.
        </div>
      ) : (
        <div className="space-y-2">
          {actions.map((action) => (
            <div key={action.id} className="p-3 bg-surface-50 rounded-lg border border-surface-200 hover:border-teal transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-charcoal">{action.action_title}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[action.status] || 'bg-gray-100 text-gray-700'}`}>
                      {action.status}
                    </span>
                  </div>
                  {action.action_description && <p className="text-sm text-charcoal-600 mb-2">{action.action_description}</p>}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-xs text-charcoal-500">
                    <span><strong>Responsible:</strong> {action.owner_user_id ? `User ${action.owner_user_id.slice(0, 8)}` : '-'}</span>
                    <span><strong>Due:</strong> {formatDate(action.due_date)}</span>
                    <span className="md:col-span-2"><strong>Linked Causes:</strong> {formatCauseLink(action)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onEdit(action.id)}
                  disabled={disabled}
                  className="p-2 text-charcoal-500 hover:text-teal disabled:opacity-60"
                  title="Edit action"
                >
                  <PencilIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
