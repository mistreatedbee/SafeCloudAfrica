import React from 'react';
import { XIcon } from 'lucide-react';
import type { PPEIssue, Site, Department, UUID } from '../../api/models/entities';
import type { EvidenceAttachment } from '../../api/models/entities';
import { listEvidence } from '../../api/services/evidenceService';
import { useAsync } from '../../api/hooks/useAsync';

export function PpeIssueDetailModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  issue: PPEIssue;
  siteName?: string | null;
  departmentName?: string | null;
}) {
  const { data: attachments } = useAsync<EvidenceAttachment[]>(
    async () => {
      if (!props.open || !props.issue?.id) return [];
      return await listEvidence(props.companyId, {
        entityType: 'ppe_issue',
        entityId: props.issue.id,
        limit: 100
      });
    },
    [props.companyId, props.issue?.id, props.open]
  );

  if (!props.open) return null;

  const issue = props.issue;
  const issueDate =
    issue.issue_date ?? (issue.issued_at ? issue.issued_at.slice(0, 10) : '—');
  const costLine =
    issue.unit_cost_at_issue != null
      ? `Unit: R ${Number(issue.unit_cost_at_issue).toFixed(2)}`
      : '';
  const totalLine =
    issue.total_cost_at_issue != null
      ? `Total: R ${Number(issue.total_cost_at_issue).toFixed(2)}`
      : '';
  const nextIssueDate =
    issue.next_issue_at ? issue.next_issue_at.slice(0, 10) : '—';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90dvh] overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <p className="text-sm font-semibold text-charcoal">
            PPE Issue — {issue.ppe_item_name ?? `Item ${issue.ppe_item_id?.slice(0, 8)}`}
          </p>
          <button
            type="button"
            onClick={props.onClose}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-surface-100 text-charcoal-500 shrink-0"
            aria-label="Close"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <dt className="text-charcoal-500">Issue date</dt>
            <dd className="font-medium text-charcoal">{issueDate}</dd>

            <dt className="text-charcoal-500">PPE item</dt>
            <dd className="font-medium text-charcoal">{issue.ppe_item_name ?? '—'}</dd>

            <dt className="text-charcoal-500">Category</dt>
            <dd className="font-medium text-charcoal">{issue.ppe_category ?? '—'}</dd>

            <dt className="text-charcoal-500">Size</dt>
            <dd className="font-medium text-charcoal">{issue.size ?? '—'}</dd>

            <dt className="text-charcoal-500">Quantity issued</dt>
            <dd className="font-medium text-charcoal">{issue.quantity_issued ?? 1}</dd>

            <dt className="text-charcoal-500">Reason for issue</dt>
            <dd className="font-medium text-charcoal">{issue.reason_for_issue ?? '—'}</dd>

            <dt className="text-charcoal-500">Issued by</dt>
            <dd className="font-medium text-charcoal">{issue.issued_by_name ?? `User ${issue.issued_by_user_id?.slice(0, 8)}`}</dd>

            <dt className="text-charcoal-500">Issued to</dt>
            <dd className="font-medium text-charcoal">
              {issue.issued_to_user_id
                ? `User ${issue.issued_to_user_id.slice(0, 8)}`
                : issue.issued_to_employee_number ?? '—'}
            </dd>

            <dt className="text-charcoal-500">Employee number</dt>
            <dd className="font-medium text-charcoal">{issue.issued_to_employee_number ?? '—'}</dd>

            <dt className="text-charcoal-500">Job role</dt>
            <dd className="font-medium text-charcoal">{issue.job_role ?? '—'}</dd>

            <dt className="text-charcoal-500">Site</dt>
            <dd className="font-medium text-charcoal">{props.siteName ?? '—'}</dd>

            <dt className="text-charcoal-500">Department</dt>
            <dd className="font-medium text-charcoal">{props.departmentName ?? '—'}</dd>

            <dt className="text-charcoal-500">Unit cost at issue</dt>
            <dd className="font-medium text-charcoal">{costLine || '—'}</dd>

            <dt className="text-charcoal-500">Total cost at issue</dt>
            <dd className="font-medium text-charcoal">{totalLine || '—'}</dd>

            <dt className="text-charcoal-500">Next issue date</dt>
            <dd className="font-medium text-charcoal">{nextIssueDate}</dd>

            {issue.notes && (
              <>
                <dt className="text-charcoal-500">Notes</dt>
                <dd className="font-medium text-charcoal col-span-1 sm:col-span-2">{issue.notes}</dd>
              </>
            )}
          </dl>

          {(attachments?.length ?? 0) > 0 && (
            <div className="border-t border-surface-200 pt-4">
              <p className="text-sm font-semibold text-charcoal mb-2">Attachments</p>
              <ul className="space-y-1">
                {attachments!.map((a) => (
                  <li key={a.id} className="text-sm text-charcoal-600">
                    {a.display_title ?? a.original_filename ?? a.storage_key}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={props.onClose}
              className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
