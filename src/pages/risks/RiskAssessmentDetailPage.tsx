import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Layout } from '../../components/layout/Layout';
import {
  getRiskAssessment,
  listRiskAssessmentItems,
  listLinkedIncidentIds,
  listLinkedNcrIds,
  listChangeTriggersForRiskAssessment,
  listRiskAssessmentVersions,
  createRiskAssessmentVersion,
  updateRiskAssessment
} from '../../api/services/risksService';
import type { RiskAssessment, RiskAssessmentItem } from '../../api/services/risksService';
import { useUser } from '@insforge/react';
import type { UUID } from '../../api/models/entities';
import { exportRiskAssessmentPDF, downloadFile } from '../../api/services/exportService';
import { useIdentity } from '../../hooks/useIdentity';

export function RiskAssessmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useUser();
  const [assessment, setAssessment] = useState<RiskAssessment | null>(null);
  const [items, setItems] = useState<RiskAssessmentItem[]>([]);
  const [linkedIncidentIds, setLinkedIncidentIds] = useState<UUID[]>([]);
  const [linkedNcrIds, setLinkedNcrIds] = useState<UUID[]>([]);
  const [changeTriggers, setChangeTriggers] = useState<{ id: UUID; description: string; status: string }[]>([]);
  const [versions, setVersions] = useState<{ id: UUID; version_number: number; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const { fullName } = useIdentity();

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [a, i, incIds, ncrIds, triggers, vers] = await Promise.all([
          getRiskAssessment(id),
          listRiskAssessmentItems(id),
          listLinkedIncidentIds(id),
          listLinkedNcrIds(id),
          listChangeTriggersForRiskAssessment(id),
          listRiskAssessmentVersions(id)
        ]);
        setAssessment(a);
        setItems(i ?? []);
        setLinkedIncidentIds(incIds);
        setLinkedNcrIds(ncrIds);
        setChangeTriggers(triggers.map((t: any) => ({ id: t.id, description: t.description, status: t.status })));
        setVersions(vers.map((v: any) => ({ id: v.id, version_number: v.version_number, created_at: v.created_at })));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load assessment');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <Layout title="Risk Assessment">
        <div className="max-w-6xl mx-auto p-6">
          <p className="text-gray-500">Loading...</p>
        </div>
      </Layout>
    );
  }

  if (error || !assessment) {
    return (
      <Layout title="Risk Assessment">
        <div className="max-w-6xl mx-auto p-6">
          <p className="text-red-600">{error || 'Assessment not found'}</p>
          <Link to="/risks" className="text-blue-600 hover:underline mt-2 inline-block">Back to list</Link>
        </div>
      </Layout>
    );
  }

  const showReviewBanner =
    assessment.status === 'review_required' || assessment.status === 'under_review';

  return (
    <Layout title={assessment.title || assessment.assessment_number}>
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <Link to="/risks" className="text-sm text-gray-500 hover:text-gray-700 mb-1 inline-block">← Back to list</Link>
            <h1 className="text-2xl font-bold text-gray-900">{assessment.title || assessment.assessment_number}</h1>
            <p className="text-sm text-gray-500">{assessment.assessment_number} · {assessment.assessment_type} · {assessment.status}</p>
          </div>
          <button
            type="button"
            disabled={exportingPdf}
            onClick={async () => {
              if (!assessment) return;
              setExportingPdf(true);
              try {
                const blob = await exportRiskAssessmentPDF(assessment, items, { generatedBy: fullName ?? '' });
                downloadFile(blob, `risk-assessment-${assessment.assessment_number}.html`);
              } finally {
                setExportingPdf(false);
              }
            }}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {exportingPdf ? 'Exporting…' : 'Export PDF'}
          </button>
        </div>

        {showReviewBanner && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-800 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-medium">Update required — linked incident, NCR, or change detected.</p>
              <p className="text-sm mt-1">Please review and update this assessment.</p>
            </div>
            <button
              type="button"
              disabled={updating || !user?.id}
              onClick={async () => {
                if (!assessment || !user?.id) return;
                setUpdating(true);
                try {
                  const snapshot = { assessment, items };
                  await createRiskAssessmentVersion({
                    riskAssessmentId: assessment.id,
                    snapshot: snapshot as unknown as Record<string, unknown>,
                    createdByUserId: user.id as UUID
                  });
                  await updateRiskAssessment({
                    assessmentId: assessment.id,
                    companyId: assessment.company_id,
                    updatedByUserId: user.id as UUID,
                    status: 'under_review'
                  });
                  setAssessment({ ...assessment, status: 'under_review' });
                } finally {
                  setUpdating(false);
                }
              }}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {updating ? 'Creating version…' : 'Review & Update'}
            </button>
          </div>
        )}

        {(linkedIncidentIds.length > 0 || linkedNcrIds.length > 0 || changeTriggers.length > 0) && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-2">Linked records</h3>
            <ul className="text-sm space-y-1">
              {linkedIncidentIds.map((incId) => (
                <li key={incId}>
                  <Link to={`/incidents`} className="text-blue-600 hover:underline">Incident {incId.slice(0, 8)}</Link>
                </li>
              ))}
              {linkedNcrIds.map((ncrId) => (
                <li key={ncrId}>
                  <Link to={`/ncrs`} className="text-blue-600 hover:underline">NCR {ncrId.slice(0, 8)}</Link>
                </li>
              ))}
              {changeTriggers.map((t) => (
                <li key={t.id} className="text-gray-700">Change trigger: {t.description} ({t.status})</li>
              ))}
            </ul>
          </div>
        )}

        {versions.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-2">Version history</h3>
            <ul className="text-sm space-y-1">
              {versions.map((v) => (
                <li key={v.id}>v{v.version_number} — {new Date(v.created_at).toLocaleString()}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 font-medium text-gray-900">Line items</div>
          <div className="overflow-x-auto">
            {items.length === 0 ? (
              <p className="p-4 text-gray-500 text-sm">No line items yet.</p>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Hazard / Risk</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Rating</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Level</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-2 text-sm text-gray-900">
                        {(item as any).hazard || item.hazard_description || '—'}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-600">
                        {(item as any).raw_risk_rating_rr ?? item.risk_rating ?? '—'}
                      </td>
                      <td className="px-4 py-2 text-sm">
                        <span className={
                          ((item as any).risk_index || item.risk_level) === 'high' ? 'text-red-600' :
                          ((item as any).risk_index || item.risk_level) === 'medium' ? 'text-amber-600' : 'text-gray-600'
                        }>
                          {(item as any).risk_index || item.risk_level || '—'}
                        </span>
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
