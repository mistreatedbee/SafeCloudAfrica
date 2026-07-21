import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { PenToolIcon, CheckCircleIcon, XCircleIcon } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import { listApprovals } from '../api/services/approvalsService';
import type { Approval } from '../api/models/entities';
import { useUser } from '@insforge/react';
import { ApprovalDecisionModal } from '../components/approvals/ApprovalDecisionModal';
import { ListEmptyState } from '../components/ui/ListEmptyState';
import { useNavigate } from 'react-router-dom';

const ENTITY_TYPE_LABELS: Record<string, string> = {
  task_supervisor_review: 'Task — Supervisor review',
  task_manager_approval: 'Task — Manager approval',
  task_auditor_verification: 'Task — Auditor verification',
  hr_performance_review: 'Performance review sign-off',
  hr_leave_request: 'Leave request',
  hr_timesheet: 'Timesheet approval',
  ncr: 'Non-conformance (NCR)',
  incident: 'Incident report',
  audit_finding: 'Audit finding',
  document: 'Document sign-off',
  wellness_signoff: 'Wellness sign-off',
};

function entityLabel(type: string): string {
  return ENTITY_TYPE_LABELS[type] ?? type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function entityPath(type: string, id: string): string | null {
  if (type.startsWith('task_')) return `/dashboard/management/tasks/${id}`;
  if (type === 'hr_leave_request') return `/dashboard/hr/leave?highlight=${id}`;
  if (type === 'hr_performance_review') return `/dashboard/hr/performance?highlight=${id}`;
  if (type === 'ncr') return `/dashboard/management/ncrs?highlight=${id}`;
  if (type === 'incident') return `/incidents?highlight=${id}`;
  return null;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

export function ApprovalsPage() {
  const { activeCompanyId } = useTenant();
  const { user } = useUser();
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved');
  const [selected, setSelected] = useState<Approval | null>(null);

  const { data, loading, error } = useAsync<Approval[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listApprovals(activeCompanyId);
    },
    [activeCompanyId, refreshKey]
  );

  const approvals = data ?? [];
  const mine = useMemo(() => (user?.id ? approvals.filter((a) => a.approver_user_id === user.id) : approvals), [approvals, user?.id]);
  const pending = useMemo(() => mine.filter((a) => a.status === 'pending'), [mine]);

  return (
    <Layout title="Online Signatures & Approvals">
      {activeCompanyId && user?.id && (
        <ApprovalDecisionModal
          open={decisionOpen}
          onClose={() => setDecisionOpen(false)}
          companyId={activeCompanyId}
          actorUserId={user.id}
          approval={selected}
          decision={decision}
          onDecided={() => setRefreshKey((k) => k + 1)}
        />
      )}
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
        <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5 lg:col-span-2">
            <h2 className="text-lg font-semibold text-charcoal flex items-center gap-2">
              <PenToolIcon className="w-5 h-5 text-teal" />
              Approval queue
            </h2>
            <p className="text-sm text-charcoal-500 mt-2">
              Review and sign off approvals. All actions are logged to the audit trail.
            </p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal">My pending approvals</h3>
            <p className="text-3xl font-bold text-charcoal mt-2">{pending.length}</p>
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="mt-3 text-sm font-medium text-teal hover:text-teal-700 transition-colors"
            >
              Refresh →
            </button>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="space-y-3">
          {loading && (
            <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <p className="text-sm text-charcoal-500">Loading approvals…</p>
            </div>
          )}
          {error && (
            <div className="bg-white rounded-xl border border-critical/30 p-4 shadow-card">
              <p className="text-sm font-semibold text-critical">Unable to load approvals</p>
              <p className="text-sm text-charcoal-500 mt-1">{error.message}</p>
            </div>
          )}
          {!loading && !error && approvals.length === 0 && (
            <ListEmptyState
              icon={PenToolIcon}
              title="No approval requests yet"
              description="When workflows need a formal sign-off, pending items will show up here for you to approve or reject."
              primaryAction={{ kind: 'button', label: 'Refresh list', onClick: () => setRefreshKey((k) => k + 1) }}
              secondaryAction={{ kind: 'link', to: '/tasks', label: 'View tasks' }}
            />
          )}
          {(mine.length ? mine : approvals).map((a) => {
            const path = entityPath(a.entity_type, String(a.entity_id));
            return (
            <div key={a.id} className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-charcoal">
                    {entityLabel(a.entity_type)}
                  </p>
                  {path ? (
                    <button
                      type="button"
                      onClick={() => navigate(path)}
                      className="text-sm text-teal hover:underline mt-0.5"
                    >
                      View record →
                    </button>
                  ) : (
                    <p className="text-sm text-charcoal-400 mt-0.5">
                      Ref: {String(a.entity_id).slice(0, 8)}
                    </p>
                  )}
                  <p className="text-xs text-charcoal-400 mt-1">
                    Status: <span className="font-medium capitalize">{a.status}</span>
                  </p>
                  {a.signature_note && <p className="text-sm text-charcoal-500 mt-2">{a.signature_note}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {a.status === 'pending' && user?.id && a.approver_user_id === user.id && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(a);
                          setDecision('approved');
                          setDecisionOpen(true);
                        }}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-success text-white text-xs font-semibold hover:bg-success-600"
                      >
                        <CheckCircleIcon className="w-4 h-4" /> Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(a);
                          setDecision('rejected');
                          setDecisionOpen(true);
                        }}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-critical text-white text-xs font-semibold hover:bg-critical-600"
                      >
                        <XCircleIcon className="w-4 h-4" /> Reject
                      </button>
                    </>
                  )}
                  {a.status !== 'pending' && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-surface-100 rounded text-xs font-semibold text-charcoal-600">
                      <CheckCircleIcon className="w-4 h-4 text-success" />
                      {a.status}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
          })}
        </motion.div>
      </motion.div>
    </Layout>
  );
}

