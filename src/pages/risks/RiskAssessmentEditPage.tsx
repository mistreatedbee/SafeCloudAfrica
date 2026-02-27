import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useUser } from '@insforge/react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { getRiskAssessment, updateRiskAssessment, type RiskAssessment } from '../../api/services/risksService';
import type { UUID } from '../../api/models/entities';

type FormState = {
  title: string;
  description: string;
  processInvolved: string;
  location: string;
  scope: string;
  objective: string;
  status: RiskAssessment['status'];
};

function canEditAssessment(assessment: RiskAssessment, actorUserId: string | null | undefined, role: string | null): boolean {
  if (role === 'owner' || role === 'admin' || role === 'manager' || role === 'supervisor') return true;
  if (role === 'employee' && actorUserId) return assessment.created_by_user_id === actorUserId;
  return false;
}

export function RiskAssessmentEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    title: '',
    description: '',
    processInvolved: '',
    location: '',
    scope: '',
    objective: '',
    status: 'draft'
  });

  useEffect(() => {
    if (!id || !activeCompanyId) return;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        setNotFound(false);
        const assessment = await getRiskAssessment(id);
        if (assessment.company_id !== activeCompanyId || !canEditAssessment(assessment, user?.id, activeRole)) {
          setNotFound(true);
          return;
        }
        setForm({
          title: assessment.title || '',
          description: assessment.description || '',
          processInvolved: assessment.process_involved || '',
          location: assessment.location || '',
          scope: assessment.scope || '',
          objective: assessment.objective || '',
          status: assessment.status
        });
      } catch (e) {
        console.error('Failed to load risk assessment for edit:', e);
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

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!id || !activeCompanyId || !user?.id) return;
    if (!form.title.trim()) {
      setError('Title is required.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await updateRiskAssessment({
        assessmentId: id as UUID,
        companyId: activeCompanyId,
        updatedByUserId: user.id as UUID,
        title: form.title.trim(),
        description: form.description.trim() || null,
        processInvolved: form.processInvolved.trim() || null,
        location: form.location.trim() || null,
        scope: form.scope.trim() || null,
        objective: form.objective.trim() || null,
        status: form.status
      });
      setToastMessage('Risk assessment updated');
      setTimeout(() => navigate(`/risk-assessments/${id}`), 700);
    } catch (err) {
      console.error('Failed to update risk assessment:', err);
      setError(err instanceof Error ? err.message : 'Failed to update risk assessment');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Layout title="Edit Risk Assessment">
        <div className="max-w-4xl mx-auto p-6">
          <p className="text-charcoal-500">Loading assessment...</p>
        </div>
      </Layout>
    );
  }

  if (notFound) {
    return (
      <Layout title="Edit Risk Assessment">
        <div className="max-w-4xl mx-auto p-6">
          <p className="text-charcoal-700 font-medium">Risk assessment not found.</p>
          <Link to="/risk-assessments" className="text-blue-600 hover:underline mt-2 inline-block">Back to list</Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Edit Risk Assessment">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {toastMessage && (
          <div className="fixed top-5 right-5 z-50 bg-success text-white px-4 py-2 rounded-lg shadow-lg">
            {toastMessage}
          </div>
        )}

        <div>
          <Link to={`/risk-assessments/${id ?? ''}`} className="text-sm text-charcoal-500 hover:text-charcoal inline-block mb-1">Back to details</Link>
          <h1 className="text-2xl font-bold text-charcoal">Edit Risk Assessment</h1>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error}</div>
        )}

        <form onSubmit={onSubmit} className="bg-white border border-surface-300 rounded-xl shadow-card p-5 space-y-4">
          <label className="block text-sm">
            <span className="block text-xs text-charcoal-500 mb-1">Title *</span>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              className="w-full px-3 py-2 border border-surface-300 rounded-lg"
            />
          </label>
          <label className="block text-sm">
            <span className="block text-xs text-charcoal-500 mb-1">Description</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              rows={4}
              className="w-full px-3 py-2 border border-surface-300 rounded-lg"
            />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Department / Process</span>
              <input
                type="text"
                value={form.processInvolved}
                onChange={(e) => setForm((prev) => ({ ...prev, processInvolved: e.target.value }))}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg"
              />
            </label>
            <label className="block text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Site / Location</span>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg"
              />
            </label>
            <label className="block text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Scope</span>
              <input
                type="text"
                value={form.scope}
                onChange={(e) => setForm((prev) => ({ ...prev, scope: e.target.value }))}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg"
              />
            </label>
            <label className="block text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Objective</span>
              <input
                type="text"
                value={form.objective}
                onChange={(e) => setForm((prev) => ({ ...prev, objective: e.target.value }))}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg"
              />
            </label>
            <label className="block text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Status</span>
              <select
                value={form.status}
                onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as RiskAssessment['status'] }))}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg"
              >
                <option value="draft">Draft</option>
                <option value="in-progress">In Progress</option>
                <option value="review_required">Review Required</option>
                <option value="under_review">Under Review</option>
                <option value="reviewed">Reviewed</option>
                <option value="approved">Approved</option>
                <option value="closed">Closed</option>
                <option value="archived">Archived</option>
              </select>
            </label>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={() => navigate(`/risk-assessments/${id ?? ''}`)}
              className="text-sm text-charcoal-600 hover:text-charcoal"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
