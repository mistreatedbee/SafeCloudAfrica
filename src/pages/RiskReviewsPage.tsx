import React, { useEffect, useState } from 'react';
import { CalendarIcon, AlertTriangle } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { useTenant } from '../tenant/TenantContext';
import { useUser } from '@insforge/react';
import type { UUID } from '../api/models/entities';
import type { RiskAssessment } from '../api/services/risksService';
import { listRiskAssessments } from '../api/services/risksService';

type ReviewFilter = 'all' | 'due-today' | 'overdue' | 'next-30';

export function RiskReviewsPage() {
  const { activeCompanyId } = useTenant();
  const { user } = useUser();
  const [assessments, setAssessments] = useState<RiskAssessment[]>([]);
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeCompanyId || !user?.id) return;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await listRiskAssessments({ companyId: activeCompanyId, limit: 500 });
        setAssessments((data ?? []).filter((a) => !!a.review_due_at));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load risk assessments for review');
      } finally {
        setLoading(false);
      }
    })();
  }, [activeCompanyId, user?.id]);

  const filtered = assessments.filter((a) => {
    if (!a.review_due_at) return false;
    if (filter === 'all') return true;
    const due = new Date(a.review_due_at);
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
              Track baseline and task-based assessments that require periodic review.
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
          <div className="bg-white rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-gray-400" />
            <p>No risk assessments currently require review for the selected filter.</p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 divide-y">
            {filtered
              .slice()
              .sort((a, b) => (a.review_due_at! > b.review_due_at! ? 1 : -1))
              .map((a) => (
                <div key={a.id} className="p-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{a.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{a.assessment_number}</p>
                    <p className="text-xs text-gray-500 mt-1 capitalize">
                      {a.assessment_type === 'baseline' ? 'Baseline' : 'Task-based'}
                      {a.is_critical && ' • Critical'}
                      {!a.is_critical && a.is_prework && ' • Prework'}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <div className="inline-flex items-center gap-1 px-2 py-1 rounded bg-indigo-50 text-indigo-700">
                      <CalendarIcon className="w-4 h-4" />
                      <span>{a.review_due_at ? new Date(a.review_due_at).toLocaleDateString('en-ZA') : '—'}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 capitalize">{a.status}</p>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

