import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { listRiskAssessments, type RiskAssessment } from '../../api/services/risksService';
import { AlertOctagonIcon, BarChart3Icon, AlertTriangleIcon, ClipboardListIcon } from 'lucide-react';

export function RiskAssessmentDashboardPage() {
  const { activeCompanyId } = useTenant();
  const [assessments, setAssessments] = useState<RiskAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeCompanyId) return;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await listRiskAssessments({ companyId: activeCompanyId, limit: 500 });
        setAssessments(data ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load risk assessments');
      } finally {
        setLoading(false);
      }
    })();
  }, [activeCompanyId]);

  const statusKey = (a: RiskAssessment) =>
    (a.status === 'review_required' && 'review_required') ||
    (a.status === 'under_review' && 'under_review') ||
    (a.status === 'approved' && 'approved') ||
    'active';
  const byStatus = {
    active: assessments.filter((a) => !['approved', 'archived', 'review_required', 'under_review'].includes(a.status)),
    review_required: assessments.filter((a) => a.status === 'review_required'),
    under_review: assessments.filter((a) => a.status === 'under_review'),
    approved: assessments.filter((a) => a.status === 'approved')
  };
  const byType = assessments.reduce(
    (acc, a) => {
      const t = a.assessment_type || 'baseline';
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  const needsReview = [...byStatus.review_required, ...byStatus.under_review].slice(0, 10);

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
            to="/risk-assessments?status=active"
            className="bg-white rounded-lg shadow border border-gray-200 p-4 hover:border-blue-300 transition"
          >
            <div className="flex items-center gap-2 text-gray-600 text-sm font-medium mb-1">Active</div>
            <div className="text-2xl font-bold text-gray-900">{byStatus.active.length}</div>
          </Link>
          <Link
            to="/risk-assessments?status=review_required"
            className="bg-white rounded-lg shadow border border-amber-200 p-4 hover:border-amber-400 transition"
          >
            <div className="flex items-center gap-2 text-amber-700 text-sm font-medium mb-1">Review Required</div>
            <div className="text-2xl font-bold text-amber-800">{byStatus.review_required.length}</div>
          </Link>
          <Link
            to="/risk-assessments?status=under_review"
            className="bg-white rounded-lg shadow border border-blue-200 p-4 hover:border-blue-400 transition"
          >
            <div className="flex items-center gap-2 text-blue-700 text-sm font-medium mb-1">Under Review</div>
            <div className="text-2xl font-bold text-blue-800">{byStatus.under_review.length}</div>
          </Link>
          <Link
            to="/risk-assessments?status=approved"
            className="bg-white rounded-lg shadow border border-green-200 p-4 hover:border-green-400 transition"
          >
            <div className="flex items-center gap-2 text-green-700 text-sm font-medium mb-1">Approved</div>
            <div className="text-2xl font-bold text-green-800">{byStatus.approved.length}</div>
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
                <p className="text-gray-500 text-sm">No assessments yet</p>
              )}
            </div>
          </div>

          {/* Risk index summary (from assessment item counts) */}
          <div className="bg-white rounded-lg shadow border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <ClipboardListIcon className="w-5 h-5" /> Risk index summary
            </h3>
            <div className="flex gap-4">
              <span className="text-green-600 font-medium">High: {assessments.reduce((s, a) => s + (a.high_risks ?? 0), 0)}</span>
              <span className="text-amber-600 font-medium">Medium: {assessments.reduce((s, a) => s + (a.medium_risks ?? 0), 0)}</span>
              <span className="text-gray-600 font-medium">Low: {assessments.reduce((s, a) => s + (a.low_risks ?? 0), 0)}</span>
            </div>
          </div>
        </div>

        {/* Needs Review list */}
        <div className="bg-white rounded-lg shadow border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <AlertTriangleIcon className="w-5 h-5 text-amber-600" /> Needs review (priority)
          </h3>
          {needsReview.length === 0 ? (
            <p className="text-gray-500 text-sm">No assessments currently requiring review.</p>
          ) : (
            <ul className="space-y-2">
              {needsReview.map((a) => (
                <li key={a.id}>
                  <Link
                    to={`/risk-assessments/${a.id}`}
                    className="text-blue-600 hover:underline font-medium"
                  >
                    {a.title || a.assessment_number} — {a.status}
                  </Link>
                  <span className="text-gray-500 text-sm ml-2">{a.assessment_number}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Layout>
  );
}
