import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import {
  getAssessmentLabel,
  getRiskAssessment,
  listRiskAssessmentItems,
  type RiskAssessment,
  type RiskAssessmentItem
} from '../../api/services/risksService';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useUser } from '@insforge/react';

function canViewAssessment(assessment: RiskAssessment, actorUserId: string | null | undefined, role: string | null): boolean {
  if (role === 'owner' || role === 'admin' || role === 'manager' || role === 'supervisor') return true;
  if (!actorUserId) return false;
  return assessment.created_by_user_id === actorUserId;
}

function riskLevelClass(level: string | null | undefined): string {
  if (level === 'critical' || level === 'high') return 'text-critical';
  if (level === 'medium') return 'text-warning';
  return 'text-success';
}

export function RiskAssessmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const [assessment, setAssessment] = useState<RiskAssessment | null>(null);
  const [items, setItems] = useState<RiskAssessmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !activeCompanyId) return;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        setNotFound(false);
        const [assessmentRow, itemRows] = await Promise.all([
          getRiskAssessment(id),
          listRiskAssessmentItems(id)
        ]);
        if (assessmentRow.company_id !== activeCompanyId) {
          setNotFound(true);
          return;
        }
        if (!canViewAssessment(assessmentRow, user?.id, activeRole)) {
          setNotFound(true);
          return;
        }
        setAssessment(assessmentRow);
        setItems(itemRows ?? []);
      } catch (e) {
        console.error('Failed to load risk assessment detail:', e);
        if (e instanceof Error && /not found/i.test(e.message)) {
          setNotFound(true);
        } else {
          setError(e instanceof Error ? e.message : 'Failed to load assessment');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [activeCompanyId, activeRole, id, user?.id]);

  if (loading) {
    return (
      <Layout title="Risk Assessment">
        <div className="max-w-6xl mx-auto p-6">
          <p className="text-charcoal-500">Loading assessment...</p>
        </div>
      </Layout>
    );
  }

  if (notFound || !assessment) {
    return (
      <Layout title="Risk Assessment">
        <div className="max-w-6xl mx-auto p-6">
          <p className="text-charcoal-700 font-medium">Risk assessment not found.</p>
          <Link to="/risk-assessments" className="text-blue-600 hover:underline mt-2 inline-block">Back to list</Link>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout title="Risk Assessment">
        <div className="max-w-6xl mx-auto p-6">
          <p className="text-critical font-medium">Unable to load risk assessment details.</p>
          <p className="text-sm text-charcoal-500 mt-1">{error}</p>
          <Link to="/risk-assessments" className="text-blue-600 hover:underline mt-2 inline-block">Back to list</Link>
        </div>
      </Layout>
    );
  }

  const canEdit =
    activeRole === 'owner' ||
    activeRole === 'admin' ||
    activeRole === 'manager' ||
    activeRole === 'supervisor' ||
    (activeRole === 'employee' && assessment.created_by_user_id === user?.id);

  return (
    <Layout title={assessment.title || assessment.assessment_number}>
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <Link to="/risk-assessments" className="text-sm text-charcoal-500 hover:text-charcoal inline-block mb-1">Back to list</Link>
            <h1 className="text-2xl font-bold text-charcoal">{assessment.title || assessment.assessment_number}</h1>
            <p className="text-sm text-charcoal-500 mt-1">
              {assessment.assessment_number} | {getAssessmentLabel(assessment)} | {assessment.status}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={() => navigate(`/risk-assessments/${assessment.id}/edit`)}
                className="px-4 py-2 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600"
              >
                Edit
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-charcoal-500">Created by</p>
              <p className="text-sm text-charcoal">{assessment.created_by_user_id}</p>
            </div>
            <div>
              <p className="text-xs text-charcoal-500">Created date</p>
              <p className="text-sm text-charcoal">{new Date(assessment.created_at).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-charcoal-500">Site</p>
              <p className="text-sm text-charcoal">{assessment.location || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-charcoal-500">Department</p>
              <p className="text-sm text-charcoal">{assessment.process_involved || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-charcoal-500">Status</p>
              <StatusBadge status={assessment.status as never} size="sm" />
            </div>
            <div>
              <p className="text-xs text-charcoal-500">Review due</p>
              <p className="text-sm text-charcoal">{assessment.review_due_at ? new Date(assessment.review_due_at).toLocaleDateString() : 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-charcoal-500">Total risks</p>
              <p className="text-sm text-charcoal">{assessment.total_risks ?? 0}</p>
            </div>
            <div>
              <p className="text-xs text-charcoal-500">Updated</p>
              <p className="text-sm text-charcoal">{new Date(assessment.updated_at).toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-200">
            <h2 className="font-semibold text-charcoal">Risk Items</h2>
          </div>
          <div className="overflow-x-auto">
            {items.length === 0 ? (
              <p className="p-4 text-sm text-charcoal-500">No risk items captured yet.</p>
            ) : (
              <table className="min-w-full divide-y divide-surface-200">
                <thead className="bg-surface-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-charcoal-500 uppercase">Hazard / Risk</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-charcoal-500 uppercase">Likelihood</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-charcoal-500 uppercase">Severity</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-charcoal-500 uppercase">Risk Score</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-charcoal-500 uppercase">Risk Level</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-charcoal-500 uppercase">Controls</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-charcoal-500 uppercase">Actions / Owner / Dates</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-200">
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-2 text-sm text-charcoal">
                        <p>{item.hazard_description || 'N/A'}</p>
                        <p className="text-xs text-charcoal-500 mt-1">{item.hazard_source || 'No source captured'}</p>
                      </td>
                      <td className="px-4 py-2 text-sm text-charcoal">{item.likelihood ?? '-'}</td>
                      <td className="px-4 py-2 text-sm text-charcoal">{item.consequence ?? '-'}</td>
                      <td className="px-4 py-2 text-sm text-charcoal">{item.risk_rating ?? '-'}</td>
                      <td className="px-4 py-2 text-sm capitalize">
                        <span className={riskLevelClass(item.risk_level)}>{item.risk_level || 'low'}</span>
                      </td>
                      <td className="px-4 py-2 text-sm text-charcoal">{item.existing_controls || 'N/A'}</td>
                      <td className="px-4 py-2 text-sm text-charcoal">
                        <p>{item.improvement_actions || 'N/A'}</p>
                        <p className="text-xs text-charcoal-500 mt-1">Owner: {item.responsible_user_id || 'N/A'}</p>
                        <p className="text-xs text-charcoal-500">Target: {item.action_due_date || 'N/A'}</p>
                        <p className="text-xs text-charcoal-500">Completion: {item.action_status || 'pending'}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
