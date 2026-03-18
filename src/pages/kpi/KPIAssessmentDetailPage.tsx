import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import {
  computeAchievementPercentage,
  computeOverallScore,
  getKPIAssessment,
  listKPIAssessmentLines,
  normalizeAssessmentStatus,
  updateKPIAssessment
} from '../../api/services/kpiAssessmentService';
import { updateKPIAssessmentLine } from '../../api/services/kpiAssessmentLineService';
import { createKPIFinding, listKPIFindings } from '../../api/services/kpiFindingService';
import { listActivityLogsByEntity } from '../../api/services/activityLogService';
import type { KPIAssessment, KPIAssessmentLine, KPIFinding, KpiAssessmentStatus } from '../../api/models/entities';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { KPI_RATING_LEGEND } from '../../constants/kpiRatingLegend';

function getAchievementLabel(line: KPIAssessmentLine): 'Not Achieved' | 'Partially Achieved' | 'Achieved' | '-' {
  const rating = line.manager_rating;
  if (rating == null) return '-';
  if (rating <= 2) return 'Not Achieved';
  if (rating === 3) return 'Partially Achieved';
  return 'Achieved';
}

type LinePatch = {
  employee_own_rating?: number;
  manager_rating?: number;
  notes?: string;
  kpi_questionnaire?: string;
};

export function KPIAssessmentDetailPage() {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const navigate = useNavigate();
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const [refresher, setRefresher] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lineDraft, setLineDraft] = useState<KPIAssessmentLine[]>([]);
  const [employeeCommentsDraft, setEmployeeCommentsDraft] = useState('');
  const [managerRemarksDraft, setManagerRemarksDraft] = useState('');
  const [savingLineIds, setSavingLineIds] = useState<Record<string, boolean>>({});
  const [savingAssessmentComments, setSavingAssessmentComments] = useState(false);

  const lineTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingLinePatchesRef = useRef<Map<string, LinePatch>>(new Map());
  const inFlightLineSavesRef = useRef<Set<string>>(new Set());
  const commentsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCommentsPatchRef = useRef<{ employee_comments?: string; manager_remarks?: string }>({});
  const inFlightCommentsSaveRef = useRef(false);

  const { data: assessment, loading: loadingAssess } = useAsync<KPIAssessment | null>(
    async () => {
      if (!activeCompanyId || !assessmentId) return null;
      return getKPIAssessment(assessmentId as any, activeCompanyId);
    },
    [activeCompanyId, assessmentId, refresher]
  );

  const { data: lines, loading: loadingLines } = useAsync<KPIAssessmentLine[]>(
    async () => {
      if (!activeCompanyId || !assessmentId) return [];
      return listKPIAssessmentLines(assessmentId as any, activeCompanyId);
    },
    [activeCompanyId, assessmentId, refresher]
  );

  const { data: findings } = useAsync<KPIFinding[]>(
    async () => {
      if (!activeCompanyId || !assessmentId) return [];
      return listKPIFindings({ organizationId: activeCompanyId, assessmentId: assessmentId as any });
    },
    [activeCompanyId, assessmentId, refresher]
  );

  const { data: auditTrail } = useAsync(
    async () => {
      if (!activeCompanyId || !assessmentId) return [];
      return listActivityLogsByEntity({
        companyId: activeCompanyId,
        entityType: 'kpi_assessment',
        entityId: assessmentId as any,
        limit: 40
      });
    },
    [activeCompanyId, assessmentId, refresher]
  );

  useEffect(() => {
    setLineDraft(lines ?? []);
  }, [lines]);

  useEffect(() => {
    setEmployeeCommentsDraft(assessment?.employee_comments ?? '');
    setManagerRemarksDraft(assessment?.manager_remarks ?? '');
  }, [assessment?.employee_comments, assessment?.manager_remarks]);

  useEffect(() => {
    const lineTimers = lineTimeoutsRef.current;
    return () => {
      for (const timer of lineTimers.values()) clearTimeout(timer);
      if (commentsTimeoutRef.current) clearTimeout(commentsTimeoutRef.current);
    };
  }, []);

  const normalizedStatus = normalizeAssessmentStatus(assessment?.status ?? 'draft');
  const isEmployeeAssignee = assessment?.employee_id === user?.id;
  const isManagerAssignee = assessment?.manager_id === user?.id;
  const isAdmin = activeRole === 'owner' || activeRole === 'admin';
  const isManagerRole = activeRole === 'manager' || activeRole === 'supervisor';

  const canView = !!assessment;
  const canEditEmployeeInputs = !!assessment && (isEmployeeAssignee || isAdmin) && (normalizedStatus === 'draft' || normalizedStatus === 'in_progress');
  const canEditManagerRatings = !!assessment && (isManagerAssignee || isManagerRole || isAdmin) && (normalizedStatus === 'under_review' || normalizedStatus === 'in_progress');
  const canCloseAssessment = !!assessment && (isManagerAssignee || isManagerRole || isAdmin);

  const unratedCount = useMemo(() => lineDraft.filter((line) => line.manager_rating == null).length, [lineDraft]);
  const localOverallScore = useMemo(
    () => computeOverallScore(lineDraft.map((line) => ({ manager_rating: line.manager_rating, importance_rating: line.importance_rating }))),
    [lineDraft]
  );
  const localAchievementPercentage = useMemo(
    () => computeAchievementPercentage(lineDraft.map((line) => ({ manager_rating: line.manager_rating, importance_rating: line.importance_rating }))),
    [lineDraft]
  );

  const flushLineSave = async (lineId: string) => {
    if (!activeCompanyId || !assessmentId || !assessment) return;
    if (inFlightLineSavesRef.current.has(lineId)) return;
    const patch = pendingLinePatchesRef.current.get(lineId);
    if (!patch) return;
    pendingLinePatchesRef.current.delete(lineId);

    inFlightLineSavesRef.current.add(lineId);
    setSavingLineIds((prev) => ({ ...prev, [lineId]: true }));
    setError(null);
    try {
      await updateKPIAssessmentLine(lineId as any, assessment.assessment_id, activeCompanyId, patch as any);
      setMessage('KPI Questionnaire changes saved.');
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save KPI Questionnaire.');
    } finally {
      inFlightLineSavesRef.current.delete(lineId);
      setSavingLineIds((prev) => ({ ...prev, [lineId]: false }));
      if (pendingLinePatchesRef.current.has(lineId)) {
        await flushLineSave(lineId);
      }
    }
  };

  const queueLineSave = (lineId: string, patch: LinePatch) => {
    const current = pendingLinePatchesRef.current.get(lineId) ?? {};
    pendingLinePatchesRef.current.set(lineId, { ...current, ...patch });
    const existingTimer = lineTimeoutsRef.current.get(lineId);
    if (existingTimer) clearTimeout(existingTimer);
    const timer = setTimeout(() => {
      void flushLineSave(lineId);
    }, 450);
    lineTimeoutsRef.current.set(lineId, timer);
  };

  const flushCommentsSave = async () => {
    if (!activeCompanyId || !assessmentId || !user?.id || inFlightCommentsSaveRef.current) return;
    const patch = pendingCommentsPatchRef.current;
    if (!patch.employee_comments && !patch.manager_remarks) return;
    pendingCommentsPatchRef.current = {};
    inFlightCommentsSaveRef.current = true;
    setSavingAssessmentComments(true);
    setError(null);
    try {
      await updateKPIAssessment(assessmentId as any, activeCompanyId, patch, user.id as any);
      setMessage('Comments saved successfully.');
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save comments.');
    } finally {
      inFlightCommentsSaveRef.current = false;
      setSavingAssessmentComments(false);
      if (pendingCommentsPatchRef.current.employee_comments || pendingCommentsPatchRef.current.manager_remarks) {
        await flushCommentsSave();
      }
    }
  };

  const queueCommentsSave = (patch: { employee_comments?: string; manager_remarks?: string }) => {
    pendingCommentsPatchRef.current = { ...pendingCommentsPatchRef.current, ...patch };
    if (commentsTimeoutRef.current) clearTimeout(commentsTimeoutRef.current);
    commentsTimeoutRef.current = setTimeout(() => {
      void flushCommentsSave();
    }, 700);
  };

  const updateLineDraft = (lineId: string, patch: LinePatch) => {
    setLineDraft((prev) => prev.map((line) => (line.line_id === lineId ? { ...line, ...patch } : line)));
    queueLineSave(lineId, patch);
  };

  const handleStatusChange = async (status: KpiAssessmentStatus) => {
    if (!activeCompanyId || !assessmentId || !user?.id) return;
    setError(null);
    setMessage(null);

    if ((status === 'completed' || status === 'closed') && unratedCount > 0) {
      setError('Manager rating is required for all KPI Questionnaires before completion or closure.');
      return;
    }

    try {
      await updateKPIAssessment(assessmentId as any, activeCompanyId, { status }, user.id as any);
      setMessage('KPI Assessment status updated successfully.');
      setRefresher((r) => r + 1);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to update KPI Assessment status.');
    }
  };

  const handleGenerateFinding = async (line: KPIAssessmentLine) => {
    if (!activeCompanyId || !assessment || !user?.id || line.finding_generated) return;
    try {
      await createKPIFinding({
        organizationId: activeCompanyId,
        assessmentId: assessment.assessment_id,
        lineId: line.line_id,
        employeeId: assessment.employee_id ?? undefined,
        projectId: assessment.project_id ?? undefined,
        description: `Not Achieved KPI Questionnaire: ${line.kpi_title}. Corrective action required.`,
        assignedLineManagerId: assessment.manager_id,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      });
      setMessage('Corrective action finding generated.');
      setRefresher((r) => r + 1);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to generate finding.');
    }
  };

  if (loadingAssess || !assessmentId) {
    return (
      <div className="flex items-center gap-3 p-6">
        <LoadingSpinner size={24} />
        <span className="text-charcoal-500">Loading KPI Assessment...</span>
      </div>
    );
  }

  if (!canView || !assessment) {
    return (
      <div className="p-6">
        <p className="text-charcoal-500">KPI Assessment not found.</p>
        <button type="button" onClick={() => navigate('/modules/hr/kpis/assessments')} className="mt-2 text-teal hover:underline">
          Back to KPI Assessment
        </button>
      </div>
    );
  }

  const findingList = findings ?? [];
  const isSavingAnyLine = Object.values(savingLineIds).some(Boolean);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <button type="button" onClick={() => navigate('/modules/hr/kpis/assessments')} className="text-sm text-charcoal-500 hover:text-charcoal">
          Back to KPI Assessment
        </button>
        {(isSavingAnyLine || savingAssessmentComments) && (
          <div className="inline-flex items-center gap-2 text-xs text-charcoal-500">
            <LoadingSpinner size={14} />
            Saving changes...
          </div>
        )}
      </div>

      {error && <div className="bg-critical/5 border border-critical/20 rounded-lg p-3 text-sm text-critical">{error}</div>}
      {message && <div className="bg-teal/5 border border-teal/20 rounded-lg p-3 text-sm text-teal-700">{message}</div>}

      <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <p className="text-xs text-charcoal-500">KPI Assessment</p>
            <p className="font-medium text-charcoal">{assessment.assessment_name || 'KPI Assessment'}</p>
          </div>
          <div>
            <p className="text-xs text-charcoal-500">Employee / Project</p>
            <p className="font-medium text-charcoal">{assessment.employee_name_snapshot || assessment.project_name || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-charcoal-500">Manager</p>
            <p className="font-medium text-charcoal">{assessment.manager_name_snapshot || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-charcoal-500">Period</p>
            <p className="font-medium text-charcoal">{assessment.period_start_date} to {assessment.period_end_date}</p>
          </div>
          <div>
            <p className="text-xs text-charcoal-500">Overall score</p>
            <p className="font-medium text-charcoal">{localOverallScore != null ? localOverallScore.toFixed(2) : '-'}</p>
          </div>
          <div>
            <p className="text-xs text-charcoal-500">Achievement percentage</p>
            <p className="font-medium text-charcoal">{localAchievementPercentage != null ? `${localAchievementPercentage.toFixed(1)}%` : '-'}</p>
          </div>
          <div>
            <p className="text-xs text-charcoal-500">Unrated Questionnaires</p>
            <p className="font-medium text-charcoal">{unratedCount}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-surface-200 text-charcoal-700 capitalize">
            {normalizedStatus.replace('_', ' ')}
          </span>

          {canCloseAssessment && normalizedStatus === 'draft' && (
            <button type="button" onClick={() => handleStatusChange('in_progress')} className="px-3 py-1 rounded-lg bg-teal text-white text-sm font-medium hover:bg-teal-600">
              Start
            </button>
          )}
          {canCloseAssessment && normalizedStatus === 'in_progress' && (
            <button type="button" onClick={() => handleStatusChange('under_review')} className="px-3 py-1 rounded-lg bg-teal text-white text-sm font-medium hover:bg-teal-600">
              Send to Review
            </button>
          )}
          {canCloseAssessment && normalizedStatus === 'under_review' && (
            <button type="button" onClick={() => handleStatusChange('completed')} className="px-3 py-1 rounded-lg bg-navy text-white text-sm font-medium hover:bg-navy-800">
              Complete
            </button>
          )}
          {canCloseAssessment && normalizedStatus === 'completed' && (
            <button type="button" onClick={() => handleStatusChange('closed')} className="px-3 py-1 rounded-lg bg-charcoal text-white text-sm font-medium hover:bg-charcoal-800">
              Close Assessment
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card">
        <h3 className="font-semibold text-charcoal mb-2">Rating scale (1-5)</h3>
        <div className="text-sm text-charcoal-600 mb-4 p-3 bg-surface-50 rounded-lg">{KPI_RATING_LEGEND}</div>

        <h3 className="font-semibold text-charcoal mb-3">KPI Assessment</h3>
        {loadingLines ? (
          <LoadingSpinner size={20} />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-charcoal-500 border-b border-surface-200">
                  <th className="py-2 pr-4">KPI Questionnaire</th>
                  <th className="py-2 pr-4">Importance</th>
                  <th className="py-2 pr-4">Employee input</th>
                  <th className="py-2 pr-4">Manager rating</th>
                  <th className="py-2 pr-4">Achievement status</th>
                  <th className="py-2 pr-4">Weighted score</th>
                  <th className="py-2 pr-4">Comments</th>
                  {canCloseAssessment && <th className="py-2 pr-4"></th>}
                </tr>
              </thead>
              <tbody>
                {lineDraft.map((line) => {
                  const label = getAchievementLabel(line);
                  return (
                    <tr key={line.line_id} className="border-b border-surface-100 last:border-0">
                      <td className="py-2 pr-4 font-medium text-charcoal">{line.kpi_questionnaire || line.kpi_title}</td>
                      <td className="py-2 pr-4 capitalize">{line.importance_rating}</td>
                      <td className="py-2 pr-4">
                        {canEditEmployeeInputs ? (
                          <select
                            value={line.employee_own_rating ?? ''}
                            onChange={(e) => {
                              const v = e.target.value ? Number(e.target.value) : undefined;
                              updateLineDraft(line.line_id, { employee_own_rating: v });
                            }}
                            className="text-sm border border-surface-300 rounded px-2 py-1"
                          >
                            <option value="">-</option>
                            {[1, 2, 3, 4, 5].map((n) => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                        ) : (
                          line.employee_own_rating ?? '-'
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        {canEditManagerRatings ? (
                          <select
                            value={line.manager_rating ?? ''}
                            onChange={(e) => {
                              const v = e.target.value ? Number(e.target.value) : undefined;
                              updateLineDraft(line.line_id, { manager_rating: v });
                            }}
                            className="text-sm border border-surface-300 rounded px-2 py-1"
                          >
                            <option value="">Select</option>
                            {[1, 2, 3, 4, 5].map((n) => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                        ) : (
                          line.manager_rating ?? '-'
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        {label === 'Not Achieved' && <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-critical/10 text-critical">Not Achieved</span>}
                        {label === 'Partially Achieved' && <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">Partially Achieved</span>}
                        {label === 'Achieved' && <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-teal/10 text-teal">Achieved</span>}
                        {label === '-' && '-'}
                      </td>
                      <td className="py-2 pr-4">{line.weighted_score != null ? line.weighted_score.toFixed(2) : '-'}</td>
                      <td className="py-2 pr-4 text-charcoal-600">
                        {(canEditEmployeeInputs || canEditManagerRatings) ? (
                          <input
                            type="text"
                            value={line.notes ?? ''}
                            onChange={(e) => updateLineDraft(line.line_id, { notes: e.target.value })}
                            className="text-sm border border-surface-300 rounded px-2 py-1 w-40"
                            placeholder="Comments"
                          />
                        ) : (
                          line.notes || '-'
                        )}
                      </td>
                      {canCloseAssessment && (
                        <td className="py-2 pr-4">
                          {label === 'Not Achieved' && !line.finding_generated && (
                            <button type="button" onClick={() => handleGenerateFinding(line)} className="text-sm text-teal hover:underline">
                              Create action
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card">
          <h3 className="font-semibold text-charcoal mb-2">Employee comments</h3>
          {canEditEmployeeInputs ? (
            <textarea
              value={employeeCommentsDraft}
              onChange={(e) => {
                const v = e.target.value;
                setEmployeeCommentsDraft(v);
                queueCommentsSave({ employee_comments: v.trim() || undefined });
              }}
              className="w-full text-sm border border-surface-300 rounded-lg px-3 py-2 min-h-[90px]"
              placeholder="Add employee comments"
            />
          ) : (
            <p className="text-sm text-charcoal-600 whitespace-pre-wrap">{assessment.employee_comments || '-'}</p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card">
          <h3 className="font-semibold text-charcoal mb-2">Manager comments</h3>
          {canEditManagerRatings ? (
            <textarea
              value={managerRemarksDraft}
              onChange={(e) => {
                const v = e.target.value;
                setManagerRemarksDraft(v);
                queueCommentsSave({ manager_remarks: v.trim() || undefined });
              }}
              className="w-full text-sm border border-surface-300 rounded-lg px-3 py-2 min-h-[90px]"
              placeholder="Add manager comments"
            />
          ) : (
            <p className="text-sm text-charcoal-600 whitespace-pre-wrap">{assessment.manager_remarks || '-'}</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card">
        <h3 className="font-semibold text-charcoal mb-3">Corrective actions</h3>
        {findingList.length === 0 ? (
          <p className="text-sm text-charcoal-500">No corrective actions from this KPI Assessment.</p>
        ) : (
          <ul className="space-y-2">
            {findingList.map((f) => (
              <li key={f.finding_id} className="flex items-center justify-between py-2 border-b border-surface-100 last:border-0">
                <div>
                  <p className="text-sm font-medium text-charcoal">{f.description.slice(0, 90)}</p>
                  <p className="text-xs text-charcoal-500">Due: {f.due_date} | Status: {f.status.replace('_', ' ')}</p>
                </div>
                <button type="button" onClick={() => navigate('/modules/hr/kpis/findings')} className="text-sm text-teal hover:underline">
                  View
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card">
        <h3 className="font-semibold text-charcoal mb-2">Audit trail</h3>
        {(auditTrail ?? []).length === 0 ? (
          <p className="text-sm text-charcoal-500">No audit records found for this assessment.</p>
        ) : (
          <ul className="space-y-2">
            {(auditTrail ?? []).map((entry: any) => (
              <li key={entry.id} className="text-sm text-charcoal-600 border-b border-surface-100 pb-2">
                <span className="font-medium text-charcoal">{entry.action}</span> at {new Date(entry.created_at).toLocaleString()}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
