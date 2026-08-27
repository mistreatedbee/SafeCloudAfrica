import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUser } from '@insforge/react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import {
  listRiskAssessments,
  type MembershipScope,
  type RiskAssessment
} from '../../api/services/riskAssessmentsService';
import { AlertOctagonIcon, BarChart3Icon, AlertTriangleIcon, ClipboardListIcon } from 'lucide-react';
import { ListEmptyState } from '../../components/ui/ListEmptyState';
import type { UUID } from '../../api/models/core';
import { toUserFacingError } from '../../utils/userFacingMessage';

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

export function RiskAssessmentDashboardPage() {
  const { activeCompanyId, activeRole, memberships } = useTenant();
  const { user } = useUser();
  const [assessments, setAssessments] = useState<RiskAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scope = useMemo(() => getScopeForActiveMembership(memberships as any, activeCompanyId as UUID | null), [activeCompanyId, memberships]);

  useEffect(() => {
    if (!activeCompanyId || !user?.id) return;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await listRiskAssessments({
          companyId: activeCompanyId,
          actorUserId: user.id as UUID,
          actorRole: activeRole,
          scope,
          limit: 500
        });
        setAssessments(data ?? []);
      } catch (e) {
        setError(toUserFacingError(e, 'Failed to load risk assessments'));
      } finally {
        setLoading(false);
      }
    })();
  }, [activeCompanyId, activeRole, scope, user?.id]);

  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const in30Days = new Date(today);
  in30Days.setDate(in30Days.getDate() + 30);
  const in30DaysKey = in30Days.toISOString().slice(0, 10);

  const byStatus = {
    draft: assessments.filter((a) => a.status === 'draft'),
    submitted: assessments.filter((a) => a.status === 'submitted'),
    active: assessments.filter((a) => a.status === 'active'),
    archived: assessments.filter((a) => a.status === 'archived')
  };
  const byType = assessments.reduce(
    (acc, a) => {
      const t = a.type || 'baseline';
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  const reviewDue = assessments
    .filter((a) => a.status !== 'archived' && a.next_review_date && a.next_review_date <= in30DaysKey)
    .sort((left, right) => String(left.next_review_date ?? '').localeCompare(String(right.next_review_date ?? '')));
  const overdueReview = reviewDue.filter((a) => (a.next_review_date ?? '') < todayKey);
  const dueWithin7Days = reviewDue.filter((a) => {
    const date = a.next_review_date ?? '';
    return date >= todayKey && date <= new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  });
  const dueWithin30Days = reviewDue.filter((a) => {
    const date = a.next_review_date ?? '';
    return date > new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) && date <= in30DaysKey;
  });
  const needsReview = reviewDue.slice(0, 10);

  if (loading) {
    return (
      <Layout title="Risk Assessment Dashboard">
        <div className="max-w-7xl mx-auto p-6">
          <p className="text-gray-500">Loading...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Risk Assessment Dashboard">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertOctagonIcon className="w-8 h-8 text-orange-600" />
            <h1 className="text-3xl font-bold text-gray-900">Risk Assessment Dashboard</h1>
          </div>
          <div className="flex gap-2">
            <Link
              to="/risk-assessments/new"
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              New Assessment
            </Link>
            <Link
              to="/risk-assessments"
              className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-lg text-sm font-medium"
            >
              View All
            </Link>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error}</div>
        )}

        {/* Status cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            to="/risk-assessments"
            className="bg-white rounded-lg shadow border border-gray-200 p-4 hover:border-blue-300 transition"
          >
            <div className="flex items-center gap-2 text-gray-600 text-sm font-medium mb-1">Draft</div>
            <div className="text-2xl font-bold text-gray-900">{byStatus.draft.length}</div>
          </Link>
          <Link
            to="/risk-assessments"
            className="bg-white rounded-lg shadow border border-amber-200 p-4 hover:border-amber-400 transition"
          >
            <div className="flex items-center gap-2 text-amber-700 text-sm font-medium mb-1">Submitted</div>
            <div className="text-2xl font-bold text-amber-800">{byStatus.submitted.length}</div>
          </Link>
          <Link
            to="/risk-assessments"
            className="bg-white rounded-lg shadow border border-blue-200 p-4 hover:border-blue-400 transition"
          >
            <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium mb-1">Active</div>
            <div className="text-2xl font-bold text-emerald-800">{byStatus.active.length}</div>
          </Link>
          <Link
            to="/risk-assessments"
            className="bg-white rounded-lg shadow border border-green-200 p-4 hover:border-green-400 transition"
          >
            <div className="flex items-center gap-2 text-green-700 text-sm font-medium mb-1">Review Due</div>
            <div className="text-2xl font-bold text-green-800">{reviewDue.length}</div>
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Count by type */}
          <div className="bg-white rounded-lg shadow border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <BarChart3Icon className="w-5 h-5" /> By type
            </h3>
            <div className="flex flex-wrap gap-3">
              {Object.entries(byType).map(([type, count]) => (
                <span
                  key={type}
                  className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-800 text-sm font-medium"
                >
                  {type.replace(/_/g, ' ')}: {count}
                </span>
              ))}
              {Object.keys(byType).length === 0 && (
                <div className="w-full">
                  <ListEmptyState
                    embedded
                    icon={BarChart3Icon}
                    title="No assessments loaded"
                    description="Create assessments to see counts by type on this dashboard."
                    primaryAction={{ kind: 'link', to: '/risks', label: 'Open risk assessments' }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Risk index summary (from assessment item counts) */}
          <div className="bg-white rounded-lg shadow border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <ClipboardListIcon className="w-5 h-5" /> Review outlook
            </h3>
            <div className="flex flex-wrap gap-4">
              <span className="text-red-600 font-medium">Overdue: {overdueReview.length}</span>
              <span className="text-amber-600 font-medium">Due in 7 days: {dueWithin7Days.length}</span>
              <span className="text-gray-600 font-medium">Due in 30 days: {dueWithin30Days.length}</span>
            </div>
          </div>
        </div>

        {/* Needs Review list */}
        <div className="bg-white rounded-lg shadow border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <AlertTriangleIcon className="w-5 h-5 text-amber-600" /> Needs review (priority)
          </h3>
          {needsReview.length === 0 ? (
            <ListEmptyState
              embedded
              icon={AlertTriangleIcon}
              title="Nothing needs review right now"
              description="Assessments in review or pending approval will be listed here for quick access."
              primaryAction={{ kind: 'link', to: '/risks', label: 'Browse assessments' }}
            />
          ) : (
            <ul className="space-y-2">
              {needsReview.map((a) => (
                <li key={a.id}>
                  <Link
                    to={`/risk-assessments/${a.id}`}
                    className="text-blue-600 hover:underline font-medium"
                  >
                    {a.title} — {a.status}
                  </Link>
                  <span className="text-gray-500 text-sm ml-2">{a.next_review_date ?? 'No review date'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Layout>
  );
}
