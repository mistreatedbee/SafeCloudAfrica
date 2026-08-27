import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarIcon, AlertTriangle } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { ListEmptyState } from '../components/ui/ListEmptyState';
import { useTenant } from '../tenant/TenantContext';
import { useUser } from '@insforge/react';
import type { UUID } from '../api/models/entities';
import type { MembershipScope, RiskAssessment } from '../api/services/riskAssessmentsService';
import { listRiskAssessments } from '../api/services/riskAssessmentsService';
import { toUserFacingError } from '../utils/userFacingMessage';

type ReviewFilter = 'all' | 'due-today' | 'overdue' | 'next-30';

function getScopeForActiveMembership(
  memberships: Array<{ company_id: UUID; site_id?: UUID | null; department_id?: UUID | null; consultant_scope?: any }> | undefined,
  companyId: UUID | null
): MembershipScope | null {
  if (!memberships || !companyId) return null;
  const active = memberships.find((m) => m.company_id === companyId);
  if (!active) return null;
  return {
    siteId: active.site_id ?? null,
    departmentId: active.department_id ?? null,
    consultantScope: active.consultant_scope ?? null
  };
}

export function RiskReviewsPage() {
  const navigate = useNavigate();
  const { activeCompanyId, activeRole, memberships } = useTenant();
  const { user } = useUser();
  const [assessments, setAssessments] = useState<RiskAssessment[]>([]);
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scope = useMemo(
    () => getScopeForActiveMembership(memberships as any, activeCompanyId as UUID | null),
    [activeCompanyId, memberships]
  );

  useEffect(() => {
    if (!activeCompanyId || !user?.id) return;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await listRiskAssessments({
          companyId: activeCompanyId,
          actorUserId: user.id as UUID,
          actorRole: activeRole ?? null,
          scope,
          limit: 500
        });
        setAssessments((data ?? []).filter((a) => !!a.next_review_date));
      } catch (e) {
        setError(toUserFacingError(e, 'Failed to load risk assessments for review'));
      } finally {
        setLoading(false);
      }
    })();
  }, [activeCompanyId, activeRole, scope, user?.id]);

  const filtered = assessments.filter((a) => {
    if (!a.next_review_date) return false;
    if (a.status === 'archived') return false;
    if (filter === 'all') return true;
    const due = new Date(a.next_review_date);
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    if (filter === 'due-today') {
      return due >= startOfToday && due < endOfToday;
    }
    if (filter === 'overdue') {
      return due < startOfToday;
    }
    // next-30
    const in30 = new Date(startOfToday.getTime() + 30 * 24 * 60 * 60 * 1000);
    return due >= startOfToday && due <= in30;
  });

  return (
    <Layout title="Risk Assessment Reviews">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Risk Assessment Reviews</h1>
            <p className="text-sm text-gray-600 mt-1">
              Track active baseline, task, critical-task, and pre-work assessments that require periodic review.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                filter === 'all'
                  ? 'bg-teal-600 text-white'
                  : 'bg-white border border-gray-300 text-gray-800 hover:bg-gray-50'
              }`}
            >
              All ({assessments.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('due-today')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                filter === 'due-today'
                  ? 'bg-amber-500 text-white'
                  : 'bg-white border border-gray-300 text-gray-800 hover:bg-gray-50'
              }`}
            >
              Due today
            </button>
            <button
              type="button"
              onClick={() => setFilter('overdue')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                filter === 'overdue'
                  ? 'bg-red-600 text-white'
                  : 'bg-white border border-gray-300 text-gray-800 hover:bg-gray-50'
              }`}
            >
              Overdue
            </button>
            <button
              type="button"
              onClick={() => setFilter('next-30')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                filter === 'next-30'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-gray-300 text-gray-800 hover:bg-gray-50'
              }`}
            >
              Next 30 days
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
        )}

        {loading && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 text-sm text-gray-600">Loading…</div>
        )}

        {!loading && filtered.length === 0 && (
          <ListEmptyState
            icon={AlertTriangle}
            title={assessments.length === 0 ? 'No review due dates set' : 'No assessments match this filter'}
            description={
              assessments.length === 0
                ? 'Add review due dates on risk assessments to see them in this queue.'
                : 'Try “All” or another time window to see upcoming or overdue reviews.'
            }
            primaryAction={{ kind: 'link', to: '/risks', label: 'Risk assessments' }}
            secondaryAction={
              filter !== 'all' && assessments.length > 0
                ? { kind: 'button', label: 'Show all due', onClick: () => setFilter('all') }
                : undefined
            }
          />
        )}

        {!loading && filtered.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 divide-y">
            {filtered
              .slice()
              .sort((a, b) => (a.next_review_date! > b.next_review_date! ? 1 : -1))
              .map((a) => (
                <button
                  type="button"
                  key={a.id}
                  onClick={() => navigate(`/risk-assessments/${a.id}`)}
                  className="w-full p-4 flex items-start justify-between gap-4 text-left hover:bg-surface-50"
                >
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{a.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{a.reference || 'No reference'}</p>
                    <p className="text-xs text-gray-500 mt-1 capitalize">
                      {a.type === 'baseline' ? 'Baseline' : a.type === 'critical' ? 'Critical Tasks' : a.type === 'prework' ? 'Pre-Work' : 'Task'}
                      {a.area && ` • ${a.area}`}
                      {a.activity && ` • ${a.activity}`}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <div className="inline-flex items-center gap-1 px-2 py-1 rounded bg-indigo-50 text-indigo-700">
                      <CalendarIcon className="w-4 h-4" />
                      <span>{a.next_review_date ? new Date(a.next_review_date).toLocaleDateString('en-ZA') : '—'}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 capitalize">{a.status}</p>
                  </div>
                </button>
              ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
