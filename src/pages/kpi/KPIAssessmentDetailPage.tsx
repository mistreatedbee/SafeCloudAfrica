import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import {
  getKPIAssessment,
  listKPIAssessmentLines,
  updateKPIAssessment,
  getOverallRatingBand
} from '../../api/services/kpiAssessmentService';
import { updateKPIAssessmentLine } from '../../api/services/kpiAssessmentLineService';
import { createKPIFinding } from '../../api/services/kpiFindingService';
import { listKPIFindings } from '../../api/services/kpiFindingService';
import type { KPIAssessment, KPIAssessmentLine, KPIFinding } from '../../api/models/entities';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { KPI_RATING_LEGEND } from '../../constants/kpiRatingLegend';

export function KPIAssessmentDetailPage() {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const navigate = useNavigate();
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const [refresher, setRefresher] = useState(0);

  const { data: assessment, loading: loadingAssess } = useAsync<KPIAssessment | null>(
    async () => {
      if (!activeCompanyId || !assessmentId) return null;
      return getKPIAssessment(assessmentId as any, activeCompanyId);
    },
    [activeCompanyId, assessmentId, refresher]
  );

  const { data: lines, loading: loadingLines } = useAsync<KPIAssessmentLine[]>(
    async () => {
      if (!assessmentId) return [];
      return listKPIAssessmentLines(assessmentId as any);
    },
    [assessmentId, refresher]
  );

  const { data: findings } = useAsync<KPIFinding[]>(
    async () => {
      if (!activeCompanyId || !assessmentId) return [];
      return listKPIFindings({ organizationId: activeCompanyId, assessmentId: assessmentId as any });
    },
    [activeCompanyId, assessmentId, refresher]
  );

  const canEdit = activeRole === 'admin' || activeRole === 'manager' || activeRole === 'supervisor';
  const isEmployee = assessment?.employee_id === user?.id;
  const canEditOwnRating = (assessment?.status === 'draft' || assessment?.status === 'submitted') && (isEmployee || canEdit);
  const canEditManagerRating = canEdit && (assessment?.status === 'submitted' || assessment?.status === 'under_review');

  const handleStatusChange = async (status: KPIAssessment['status']) => {
    if (!activeCompanyId || !assessmentId || !user?.id) return;
    await updateKPIAssessment(
      assessmentId as any,
      activeCompanyId,
      { status },
      user.id as any
    );
    setRefresher((r) => r + 1);
  };

  const handleUpdateLine = async (
    lineId: string,
    patch: { employee_own_rating?: number; manager_rating?: number; notes?: string }
  ) => {
    if (!activeCompanyId || !assessmentId || !assessment) return;
    await updateKPIAssessmentLine(lineId as any, assessment.assessment_id, activeCompanyId, patch);
    setRefresher((r) => r + 1);
  };

  const handleUpdateAssessmentComments = async (patch: { employee_comments?: string; manager_remarks?: string }) => {
    if (!activeCompanyId || !assessmentId || !user?.id) return;
    await updateKPIAssessment(assessmentId as any, activeCompanyId, patch, user.id as any);
    setRefresher((r) => r + 1);
  };

  const handleGenerateFinding = async (line: KPIAssessmentLine) => {
    if (!activeCompanyId || !assessment || !user?.id) return;
    if (line.finding_generated) return;
    await createKPIFinding({
      organizationId: activeCompanyId,
      assessmentId: assessment.assessment_id,
      lineId: line.line_id,
      employeeId: assessment.employee_id ?? undefined,
      projectId: assessment.project_id ?? undefined,
      description: `Not achieved: ${line.kpi_title}. Corrective action required.`,
      assignedLineManagerId: assessment.manager_id,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    });
    setRefresher((r) => r + 1);
  };

  if (loadingAssess || !assessmentId) {
    return (
      <div className="flex items-center gap-3 p-6">
        <LoadingSpinner size={24} />
        <span className="text-charcoal-500">Loading assessment…</span>
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="p-6">
        <p className="text-charcoal-500">Assessment not found.</p>
        <button type="button" onClick={() => navigate('/modules/hr/kpis/assessments')} className="mt-2 text-teal hover:underline">
          Back to list
        </button>
      </div>
    );
  }

  const lineList = lines ?? [];
  const findingList = findings ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => navigate('/modules/hr/kpis/assessments')}
          className="text-sm text-charcoal-500 hover:text-charcoal"
        >
          ← Back to assessments
        </button>
      </div>

      <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <p className="text-xs text-charcoal-500">Employee / Project</p>
            <p className="font-medium text-charcoal">{assessment.employee_name_snapshot || assessment.project_name || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-charcoal-500">Manager</p>
            <p className="font-medium text-charcoal">{assessment.manager_name_snapshot || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-charcoal-500">Period</p>
            <p className="font-medium text-charcoal">{assessment.period_start_date} – {assessment.period_end_date}</p>
          </div>
          <div>
            <p className="text-xs text-charcoal-500">Overall score</p>
            <p className="font-medium text-charcoal">
              {assessment.overall_score != null ? `${assessment.overall_score.toFixed(2)} (${assessment.overall_rating_band ?? getOverallRatingBand(assessment.overall_score)})` : '—'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-surface-200 text-charcoal-700 capitalize">
            {assessment.status.replace('_', ' ')}
          </span>
          {canEdit && assessment.status === 'draft' && (
            <button
              type="button"
              onClick={() => handleStatusChange('submitted')}
              className="px-3 py-1 rounded-lg bg-teal text-white text-sm font-medium hover:bg-teal-600"
            >
              Submit
            </button>
          )}
          {canEdit && assessment.status === 'submitted' && (
            <button
              type="button"
              onClick={() => handleStatusChange('under_review')}
              className="px-3 py-1 rounded-lg bg-teal text-white text-sm font-medium hover:bg-teal-600"
            >
              Start review
            </button>
          )}
          {canEdit && (assessment.status === 'under_review' || assessment.status === 'submitted') && (
            <button
              type="button"
              onClick={() => handleStatusChange('finalized')}
              className="px-3 py-1 rounded-lg bg-navy text-white text-sm font-medium hover:bg-navy-800"
            >
              Finalize
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card">
        <h3 className="font-semibold text-charcoal mb-2">Rating scale (1–5)</h3>
        <div className="text-sm text-charcoal-600 mb-4 p-3 bg-surface-50 rounded-lg">
          {KPI_RATING_LEGEND}
        </div>

        <h3 className="font-semibold text-charcoal mb-3">KPI lines</h3>
        {loadingLines ? (
          <LoadingSpinner size={20} />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-charcoal-500 border-b border-surface-200">
                  <th className="py-2 pr-4">KPI</th>
                  <th className="py-2 pr-4">Importance</th>
                  <th className="py-2 pr-4">Own rating</th>
                  <th className="py-2 pr-4">Manager rating</th>
                  <th className="py-2 pr-4">Not achieved</th>
                  <th className="py-2 pr-4">Notes</th>
                  {canEdit && <th className="py-2 pr-4"></th>}
                </tr>
              </thead>
              <tbody>
                {lineList.map((line) => (
                  <tr key={line.line_id} className="border-b border-surface-100 last:border-0">
                    <td className="py-2 pr-4 font-medium text-charcoal">{line.kpi_title}</td>
                    <td className="py-2 pr-4 capitalize">{line.importance_rating}</td>
                    <td className="py-2 pr-4">
                      {canEditOwnRating ? (
                        <select
                          value={line.employee_own_rating ?? ''}
                          onChange={(e) => {
                            const v = e.target.value ? Number(e.target.value) : undefined;
                            handleUpdateLine(line.line_id, { employee_own_rating: v });
                          }}
                          className="text-sm border border-surface-300 rounded px-2 py-1"
                        >
                          <option value="">—</option>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      ) : (
                        line.employee_own_rating ?? '—'
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      {canEditManagerRating ? (
                        <select
                          value={line.manager_rating ?? ''}
                          onChange={(e) => {
                            const v = e.target.value ? Number(e.target.value) : undefined;
                            handleUpdateLine(line.line_id, { manager_rating: v });
                          }}
                          className="text-sm border border-surface-300 rounded px-2 py-1"
                        >
                          <option value="">—</option>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      ) : (
                        line.manager_rating ?? '—'
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      {line.not_achieved === true ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-critical/10 text-critical">Not achieved</span>
                      ) : line.achieved === true ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-teal/10 text-teal">Achieved</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2 pr-4 text-charcoal-600">
                      {canEditOwnRating || canEditManagerRating ? (
                        <input
                          type="text"
                          defaultValue={line.notes ?? ''}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v !== (line.notes ?? '')) handleUpdateLine(line.line_id, { notes: v || undefined });
                          }}
                          className="text-sm border border-surface-300 rounded px-2 py-1 w-32"
                          placeholder="Notes"
                        />
                      ) : (
                        line.notes || '—'
                      )}
                    </td>
                    {canEdit && (
                      <td className="py-2 pr-4">
                        {line.not_achieved && !line.finding_generated && (
                          <button
                            type="button"
                            onClick={() => handleGenerateFinding(line)}
                            className="text-sm text-teal hover:underline"
                          >
                            Generate finding
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card">
          <h3 className="font-semibold text-charcoal mb-2">Employee comments</h3>
          {canEditOwnRating ? (
            <>
              <textarea
                defaultValue={assessment.employee_comments ?? ''}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (assessment.employee_comments ?? ''))
                    handleUpdateAssessmentComments({ employee_comments: v || undefined });
                }}
                className="w-full text-sm border border-surface-300 rounded-lg px-3 py-2 min-h-[80px]"
                placeholder="Add your comments…"
              />
            </>
          ) : (
            <p className="text-sm text-charcoal-600 whitespace-pre-wrap">{assessment.employee_comments || '—'}</p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card">
          <h3 className="font-semibold text-charcoal mb-2">Manager remarks</h3>
          {canEditManagerRating ? (
            <textarea
              defaultValue={assessment.manager_remarks ?? ''}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== (assessment.manager_remarks ?? ''))
                  handleUpdateAssessmentComments({ manager_remarks: v || undefined });
              }}
              className="w-full text-sm border border-surface-300 rounded-lg px-3 py-2 min-h-[80px]"
              placeholder="Add manager remarks…"
            />
          ) : (
            <p className="text-sm text-charcoal-600 whitespace-pre-wrap">{assessment.manager_remarks || '—'}</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card">
        <h3 className="font-semibold text-charcoal mb-3">Findings</h3>
        {findingList.length === 0 ? (
          <p className="text-sm text-charcoal-500">No findings from this assessment.</p>
        ) : (
          <ul className="space-y-2">
            {findingList.map((f) => (
              <li key={f.finding_id} className="flex items-center justify-between py-2 border-b border-surface-100 last:border-0">
                <div>
                  <p className="text-sm font-medium text-charcoal">{f.description.slice(0, 80)}…</p>
                  <p className="text-xs text-charcoal-500">Due: {f.due_date} · Status: {f.status}</p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/modules/hr/kpis/findings')}
                  className="text-sm text-teal hover:underline"
                >
                  View
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
