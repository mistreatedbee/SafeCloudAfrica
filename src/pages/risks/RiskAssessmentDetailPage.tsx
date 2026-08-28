import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toUserFacingError } from '../../utils/userFacingMessage';
import { useUser } from '@insforge/react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import type { UUID } from '../../api/models/core';
import {
  addRiskAssessmentSignoff,
  approveRiskAssessment,
  archiveRiskAssessment,
  createRiskAssessmentQna,
  createRiskAssessmentTemplate,
  deleteRiskAssessment,
  deleteRiskAssessmentQna,
  getRiskAssessment,
  listRiskAssessmentQna,
  listRiskAssessmentRows,
  listRiskAssessmentSignoffs,
  rejectRiskAssessment,
  supervisorSignoffRiskAssessment,
  updateRiskAssessment,
  type MembershipScope,
  type RiskAssessment,
  type RiskAssessmentQna,
  type RiskAssessmentRow,
  type RiskAssessmentSignoff
} from '../../api/services/riskAssessmentsService';
import { getHrEmployeeByUserId } from '../../api/services/hrService';
import { listQualityNcrs } from '../../api/services/qualityNcrsService';
import { listLegalRequirementsForLinkedRecord } from '../../api/services/legalRequirementsService';
import type { LegalRequirement, QualityNcr } from '../../api/models/entities';
import { getPublicUrl } from '../../api/services/storageService';
import { columnsForType, typeLabel } from './riskTemplates';
import { buildRiskTableLayout } from '../../utils/riskTableLayout';

const tableHeaderCell = 'px-3 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase align-top whitespace-normal min-w-[120px]';
const tableDataCell = 'px-3 py-3 align-top whitespace-normal';

/**
 * status_v2 only has draft/submitted/active/archived (rejection sends a document back to
 * 'draft' rather than a separate value — see risk_assessment_active_archive_2026_08_27.sql),
 * so a rejected-but-not-yet-resubmitted draft is distinguished by the `rejected` flag.
 */
function RiskAssessmentStatusBadge({ status, rejected }: { status: string; rejected: boolean }) {
  if (rejected) {
    return <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-700 text-xs font-semibold">Rejected</span>;
  }
  const styles: Record<string, string> = {
    draft: 'bg-surface-200 text-charcoal-600',
    submitted: 'bg-amber-100 text-amber-700',
    active: 'bg-emerald-100 text-emerald-700',
    archived: 'bg-charcoal-100 text-charcoal-500'
  };
  const labels: Record<string, string> = {
    draft: 'Draft',
    submitted: 'Submitted',
    active: 'Active',
    archived: 'Archived'
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${styles[status] ?? 'bg-surface-200 text-charcoal-600'}`}>
      {labels[status] ?? status}
    </span>
  );
}

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

export function RiskAssessmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useUser();
  const { activeCompanyId, activeRole, memberships } = useTenant();
  const scope = useMemo(() => getScopeForActiveMembership(memberships as any, activeCompanyId as UUID | null), [activeCompanyId, memberships]);

  const [assessment, setAssessment] = useState<RiskAssessment | null>(null);
  const [rows, setRows] = useState<RiskAssessmentRow[]>([]);
  const [qna, setQna] = useState<RiskAssessmentQna[]>([]);
  const [signoffs, setSignoffs] = useState<RiskAssessmentSignoff[]>([]);
  const [linkedNcrs, setLinkedNcrs] = useState<QualityNcr[]>([]);
  const [linkedLegalRequirements, setLinkedLegalRequirements] = useState<
    Array<Pick<LegalRequirement, 'id' | 'requirement_standard' | 'compliance_status'>>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [a, setA] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [employeeSignature, setEmployeeSignature] = useState('');
  const [flash, setFlash] = useState<string | null>(null);
  const [myHrEmployeeId, setMyHrEmployeeId] = useState<UUID | null>(null);
  const [approving, setApproving] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  const columns = useMemo(() => (assessment ? columnsForType(assessment.type) : []), [assessment]);
  const tableLayout = useMemo(() => (assessment ? buildRiskTableLayout(assessment.type, columns) : []), [assessment, columns]);
  const showResidualCol = assessment ? assessment.type !== 'critical' && assessment.type !== 'prework' : false;
  const rawVariant: 'compact' | 'separate' = assessment?.type === 'task' ? 'compact' : 'separate';

  const canEdit = ['owner', 'admin', 'manager', 'supervisor', 'consultant'].includes(String(activeRole));
  const canDelete = ['owner', 'admin'].includes(String(activeRole));
  const canSupervisorSign = ['owner', 'admin', 'manager', 'supervisor'].includes(String(activeRole));

  const isAdminOrManager = ['owner', 'admin', 'manager'].includes(String(activeRole));
  const isAssignedSupervisor = Boolean(
    assessment?.supervisor_id && myHrEmployeeId && String(assessment.supervisor_id) === String(myHrEmployeeId)
  );
  const canApproveOrReject = assessment?.status === 'submitted' && (isAdminOrManager || isAssignedSupervisor);
  const canResubmit = assessment?.status === 'draft' && assessment.rejected_at != null && assessment.created_by_user_id === user?.id;

  async function load() {
    if (!activeCompanyId || !user?.id || !id) return;
    setLoading(true);
    setError(null);
    try {
      const [one, rowData, qnaRows, signoffRows] = await Promise.all([
        getRiskAssessment({
          companyId: activeCompanyId as UUID,
          assessmentId: id as UUID,
          actorUserId: user.id as UUID,
          actorRole: activeRole ?? null,
          scope
        }),
        listRiskAssessmentRows({ companyId: activeCompanyId as UUID, assessmentId: id as UUID }),
        listRiskAssessmentQna({ companyId: activeCompanyId as UUID, assessmentId: id as UUID }),
        listRiskAssessmentSignoffs({ companyId: activeCompanyId as UUID, assessmentId: id as UUID })
      ]);
      setAssessment(one);
      setRows(rowData);
      setQna(qnaRows);
      setSignoffs(signoffRows);
      const [ncrs, legalReqs] = await Promise.all([
        listQualityNcrs({
          companyId: activeCompanyId as UUID,
          sourceEntityType: 'risk',
          sourceEntityId: id as UUID,
          actorUserId: user.id as UUID,
          actorRole: activeRole ?? null,
          limit: 200
        }),
        listLegalRequirementsForLinkedRecord({
          companyId: activeCompanyId as UUID,
          moduleType: 'risk_assessment',
          recordId: id as UUID
        })
      ]);
      setLinkedNcrs(ncrs);
      setLinkedLegalRequirements(legalReqs);
    } catch (e) {
      setError(toUserFacingError(e, 'Failed to load assessment'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [activeCompanyId, activeRole, id, user?.id]);

  useEffect(() => {
    if (!activeCompanyId || !user?.id) return;
    getHrEmployeeByUserId(activeCompanyId as UUID, user.id as UUID)
      .then((emp) => setMyHrEmployeeId(emp?.id ?? null))
      .catch(() => setMyHrEmployeeId(null));
  }, [activeCompanyId, user?.id]);

  useEffect(() => {
    const msg = (location.state as any)?.flash;
    if (typeof msg === 'string' && msg.trim()) {
      setFlash(msg.trim());
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  async function onDelete() {
    if (!activeCompanyId || !user?.id || !id) return;
    if (!window.confirm('Delete this risk assessment? This cannot be undone.')) return;
    try {
      await deleteRiskAssessment({
        companyId: activeCompanyId as UUID,
        assessmentId: id as UUID,
        actorUserId: user.id as UUID,
        actorRole: activeRole ?? null,
        scope
      });
      navigate('/risk-assessments');
    } catch (e) {
      setError(toUserFacingError(e, 'Failed to delete assessment'));
    }
  }

  async function onApprove() {
    if (!activeCompanyId || !user?.id || !assessment) return;
    if (!window.confirm('Approve this risk assessment? It will become the ACTIVE version.')) return;
    setError(null);
    setApproving(true);
    try {
      await approveRiskAssessment({
        companyId: activeCompanyId as UUID,
        assessmentId: assessment.id,
        actorUserId: user.id as UUID,
        actorRole: activeRole,
        scope
      });
      await load();
    } catch (e) {
      console.error('Risk assessment approval failed', e);
      setError(toUserFacingError(e, 'Failed to approve this risk assessment.'));
    } finally {
      setApproving(false);
    }
  }

  async function onReject() {
    if (!activeCompanyId || !user?.id || !assessment) return;
    if (!rejectReason.trim()) return;
    setError(null);
    setRejecting(true);
    try {
      await rejectRiskAssessment({
        companyId: activeCompanyId as UUID,
        assessmentId: assessment.id,
        actorUserId: user.id as UUID,
        actorRole: activeRole,
        scope,
        reason: rejectReason.trim()
      });
      setShowRejectForm(false);
      setRejectReason('');
      await load();
    } catch (e) {
      console.error('Risk assessment rejection failed', e);
      setError(toUserFacingError(e, 'Failed to reject this risk assessment.'));
    } finally {
      setRejecting(false);
    }
  }

  async function onResubmit() {
    if (!activeCompanyId || !user?.id || !assessment) return;
    setError(null);
    try {
      await updateRiskAssessment({
        companyId: activeCompanyId as UUID,
        assessmentId: assessment.id,
        actorUserId: user.id as UUID,
        actorRole: activeRole,
        scope,
        patch: { status: 'submitted' }
      });
      await load();
    } catch (e) {
      console.error('Risk assessment resubmit failed', e);
      setError(toUserFacingError(e, 'Failed to resubmit this risk assessment.'));
    }
  }

  async function onArchive() {
    if (!activeCompanyId || !user?.id || !assessment) return;
    if (!window.confirm('Archive this risk assessment? It will become read-only.')) return;
    try {
      await archiveRiskAssessment({
        companyId: activeCompanyId as UUID,
        assessmentId: assessment.id,
        actorUserId: user.id as UUID,
        actorRole: activeRole,
        scope
      });
      await load();
    } catch (e) {
      setError(toUserFacingError(e, 'Failed to archive assessment'));
    }
  }

  async function onSaveTemplate() {
    if (!activeCompanyId || !user?.id || !assessment) return;
    const name = window.prompt('Template name', `${assessment.title} Template`);
    if (!name?.trim()) return;
    try {
      await createRiskAssessmentTemplate({
        companyId: activeCompanyId as UUID,
        actorUserId: user.id as UUID,
        name: name.trim(),
        type: assessment.type,
        headerJson: {
          heading: assessment.heading,
          area: assessment.area,
          activity: assessment.activity,
          reference: assessment.reference,
          doc_url: assessment.doc_url
        },
        rowsJson: rows.map((r) => ({
          ...r.json_data,
          severity: r.severity,
          likelihood: r.likelihood,
          residual_severity: r.residual_severity,
          residual_likelihood: r.residual_likelihood,
          responsible_person: r.responsible_person,
          target_date: r.target_date,
          completion_date: r.completion_date
        }))
      });
      alert('Template saved.');
    } catch (e) {
      setError(toUserFacingError(e, 'Failed to save template'));
    }
  }

  async function onAddQna() {
    if (!activeCompanyId || !user?.id || !assessment || !q.trim()) return;
    try {
      await createRiskAssessmentQna({
        companyId: activeCompanyId as UUID,
        assessmentId: assessment.id,
        actorUserId: user.id as UUID,
        question: q.trim(),
        answer: a.trim() || null
      });
      setQ('');
      setA('');
      await load();
    } catch (e) {
      setError(toUserFacingError(e, 'Failed to add Q&A'));
    }
  }

  async function onDeleteQna(qnaId: UUID) {
    if (!activeCompanyId || !user?.id) return;
    if (!window.confirm('Delete this Q&A note? This cannot be undone.')) return;
    try {
      await deleteRiskAssessmentQna({ companyId: activeCompanyId as UUID, qnaId, actorUserId: user.id as UUID });
      await load();
    } catch (e) {
      setError(toUserFacingError(e, 'Failed to delete Q&A'));
    }
  }

  async function onEmployeeSignoff() {
    if (!activeCompanyId || !user?.id || !assessment || !employeeName.trim()) return;
    try {
      await addRiskAssessmentSignoff({
        companyId: activeCompanyId as UUID,
        assessmentId: assessment.id,
        actorUserId: user.id as UUID,
        employeeName: employeeName.trim(),
        signature: employeeSignature.trim() || null
      });
      setEmployeeName('');
      setEmployeeSignature('');
      await load();
    } catch (e) {
      setError(toUserFacingError(e, 'Failed to sign off'));
    }
  }

  async function onSupervisorSignoff(signoffId?: UUID) {
    if (!activeCompanyId || !user?.id || !assessment) return;
    try {
      await supervisorSignoffRiskAssessment({
        companyId: activeCompanyId as UUID,
        assessmentId: assessment.id,
        signoffId,
        actorUserId: user.id as UUID
      });
      await load();
    } catch (e) {
      // Log the raw error so the real cause (RLS denial, missing/invalid signoff row,
      // etc.) is visible in the console instead of only ever showing the generic fallback.
      console.error('Supervisor sign-off failed', e);
      setError(toUserFacingError(e, 'Supervisor sign-off failed. See console for details, or contact your administrator.'));
    }
  }

  if (loading) {
    return (
      <Layout title="Risk Assessment">
        <div className="space-y-2">
          <div className="h-10 bg-surface-100 rounded animate-pulse" />
          <div className="h-64 bg-surface-100 rounded animate-pulse" />
        </div>
      </Layout>
    );
  }

  if (!assessment) {
    return (
      <Layout title="Risk Assessment">
        <div className="text-sm text-critical">{error ?? 'Risk assessment not found.'}</div>
      </Layout>
    );
  }

  const baselineFileUrl = assessment.baseline_spreadsheet_bucket && assessment.baseline_spreadsheet_key
    ? getPublicUrl(assessment.baseline_spreadsheet_bucket as any, assessment.baseline_spreadsheet_key)
    : null;

  return (
    <Layout title={assessment.title}>
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <Link to="/risk-assessments" className="text-sm text-charcoal-500 hover:underline">Back to list</Link>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-charcoal">{assessment.title}</h1>
              <RiskAssessmentStatusBadge status={assessment.status} rejected={assessment.status === 'draft' && assessment.rejected_at != null} />
            </div>
            <p className="text-sm text-charcoal-500">{typeLabel(assessment.type)}</p>
            <p className="text-xs text-charcoal-500 mt-0.5">
              Reference: <span className="font-mono text-charcoal">{assessment.reference || '-'}</span>
            </p>
            {assessment.supervisor_name_snapshot && (
              <p className="text-xs text-charcoal-500 mt-0.5">Supervisor / Approver: <span className="text-charcoal">{assessment.supervisor_name_snapshot}</span></p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {assessment.doc_url && <a href={assessment.doc_url} target="_blank" rel="noreferrer" className="px-3 py-2 rounded border border-charcoal-300 text-sm">Open Google Doc</a>}
            {canEdit && assessment.status !== 'archived' && <button onClick={() => navigate(`/risk-assessments/${assessment.id}/edit`)} className="px-3 py-2 rounded bg-teal text-white text-sm">Edit</button>}
            {canEdit && assessment.status !== 'archived' && (
              <button onClick={() => void onArchive()} className="px-3 py-2 rounded border border-charcoal-300 text-sm">Archive</button>
            )}
            <button onClick={() => void onSaveTemplate()} className="px-3 py-2 rounded border border-teal text-teal text-sm">Save as Template</button>
            {canDelete && <button onClick={() => void onDelete()} className="px-3 py-2 rounded border border-critical text-critical text-sm">Delete</button>}
          </div>
        </div>

        {canApproveOrReject && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-charcoal">Awaiting your approval</p>
            <div className="flex flex-wrap gap-2">
              <button disabled={approving} onClick={() => void onApprove()} className="px-4 py-2 rounded-lg bg-success text-white text-sm font-semibold disabled:opacity-60">
                {approving ? 'Approving...' : 'Approve'}
              </button>
              <button onClick={() => setShowRejectForm((v) => !v)} className="px-4 py-2 rounded-lg border border-critical text-critical text-sm font-semibold">
                Reject
              </button>
            </div>
            {showRejectForm && (
              <div className="space-y-2 pt-1">
                <label className="text-sm block">
                  <span className="block text-xs text-charcoal-500 mb-1">Reason for rejection *</span>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
                    placeholder="Explain what needs to change before this can be approved."
                  />
                </label>
                <button
                  disabled={rejecting || !rejectReason.trim()}
                  onClick={() => void onReject()}
                  className="px-4 py-2 rounded-lg bg-critical text-white text-sm font-semibold disabled:opacity-60"
                >
                  {rejecting ? 'Rejecting...' : 'Submit rejection'}
                </button>
              </div>
            )}
          </div>
        )}

        {assessment.status === 'draft' && assessment.rejected_at != null && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
            <p className="text-sm font-semibold text-critical">This risk assessment was rejected</p>
            <p className="text-sm text-charcoal-600">Reason: {assessment.rejection_reason || 'No reason given.'}</p>
            {canResubmit && (
              <button onClick={() => void onResubmit()} className="px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold">
                Resubmit
              </button>
            )}
          </div>
        )}

        {error && <div className="text-sm text-critical">{error}</div>}
        {flash && (
          <div className="text-sm border border-success/30 bg-success/10 text-success rounded-lg px-3 py-2">
            {flash}
          </div>
        )}

        <div className="bg-white border border-surface-300 rounded-xl p-4 shadow-card">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
            <p><span className="text-charcoal-500">Heading:</span> {assessment.heading || '-'}</p>
            <p><span className="text-charcoal-500">Area:</span> {assessment.area || '-'}</p>
            <p><span className="text-charcoal-500">Activity:</span> {assessment.activity || '-'}</p>
            <p><span className="text-charcoal-500">Reference:</span> {assessment.reference || '-'}</p>
            <p><span className="text-charcoal-500">Assessor:</span> {assessment.risk_assessor_name || '-'}</p>
            <p><span className="text-charcoal-500">Date:</span> {assessment.assessment_date || '-'}</p>
            <p><span className="text-charcoal-500">Next review:</span> {assessment.next_review_date || '-'}</p>
            <p><span className="text-charcoal-500">Google Doc ID:</span> {assessment.doc_id || '-'}</p>
            {baselineFileUrl && (
              <p className="md:col-span-4">
                <span className="text-charcoal-500">Baseline spreadsheet:</span>{' '}
                <a href={baselineFileUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Open uploaded file</a>
              </p>
            )}
          </div>
        </div>

        <div className="bg-white border border-surface-300 rounded-xl p-4 shadow-card space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-charcoal">Linked NCRs</h2>
            <p className="text-xs text-charcoal-500">
              Risk reference: <span className="font-mono">{assessment.reference || 'n/a'}</span>
            </p>
          </div>
          {linkedNcrs.length === 0 ? (
            <p className="text-sm text-charcoal-500">No non-conformance reports are linked to this risk assessment yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-surface-200 text-sm">
                <thead className="bg-surface-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">NC Number</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">Title</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">Severity</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">Status</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-200">
                  {linkedNcrs.map((ncr) => (
                    <tr key={ncr.id}>
                      <td className="px-3 py-2 font-mono text-charcoal">{ncr.nc_number}</td>
                      <td className="px-3 py-2 text-charcoal">{ncr.title}</td>
                      <td className="px-3 py-2 text-charcoal-600 capitalize">{ncr.severity}</td>
                      <td className="px-3 py-2 text-charcoal-600 capitalize">{ncr.status}</td>
                      <td className="px-3 py-2 text-charcoal-600">
                        {ncr.occurrence_date ? new Date(ncr.occurrence_date).toLocaleDateString() : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

	        <div className="bg-white border border-surface-300 rounded-xl shadow-card overflow-hidden">
	          <div className="px-4 py-3 border-b border-surface-200 font-semibold text-charcoal">Assessment Table</div>
	          {rows.length === 0 ? (
	            <div className="p-4 text-sm text-charcoal-500">No rows captured.</div>
	          ) : (
	            <div className="overflow-x-auto">
	              <table className="min-w-full w-max table-auto divide-y divide-surface-200">
	                <thead className="bg-surface-50">
	                  <tr>
	                    <th className={`${tableHeaderCell} min-w-[64px]`}>#</th>
	                    {tableLayout.map((item, idx) => {
	                      if (item.kind === 'data') {
	                        return (
	                          <th key={item.col.key} className={tableHeaderCell}>
	                            {item.col.label}
	                          </th>
	                        );
	                      }
	                      if (item.kind === 'raw_scoring') {
	                        if (rawVariant === 'compact') {
	                          return (
	                            <React.Fragment key={`raw-${idx}`}>
	                              <th className={tableHeaderCell}>SL</th>
	                              <th className={tableHeaderCell}>RR</th>
	                              <th className={tableHeaderCell}>Index</th>
	                            </React.Fragment>
	                          );
	                        }
	                        return (
	                          <React.Fragment key={`raw-${idx}`}>
	                            <th className={tableHeaderCell}>S</th>
	                            <th className={tableHeaderCell}>L</th>
	                            <th className={tableHeaderCell}>S*L</th>
	                            <th className={tableHeaderCell}>Index</th>
	                          </React.Fragment>
	                        );
	                      }
	                      if (item.kind === 'residual' && showResidualCol) {
	                        return (
	                          <th key={`residual-${idx}`} className={tableHeaderCell}>
	                            Residual
	                          </th>
	                        );
	                      }
	                      return null;
	                    })}
	                  </tr>
	                </thead>
	                <tbody className="divide-y divide-surface-200">
	                  {rows.map((row, idx) => (
	                    <tr key={row.id}>
	                      <td className={`${tableDataCell} text-sm font-medium text-charcoal`}>{idx + 1}</td>
	                      {tableLayout.map((item, itemIdx) => {
	                        if (item.kind === 'data') {
	                          return (
	                            <td key={`${row.id}-${item.col.key}`} className={`${tableDataCell} text-sm text-charcoal min-w-[160px]`}>
	                              {String(row.json_data?.[item.col.key] ?? '-')}
	                            </td>
	                          );
	                        }
	                        if (item.kind === 'raw_scoring') {
	                          if (rawVariant === 'compact') {
	                            return (
	                              <React.Fragment key={`${row.id}-raw-${itemIdx}`}>
	                                <td className={`${tableDataCell} text-sm min-w-[120px]`}>{row.severity ?? '-'} / {row.likelihood ?? '-'}</td>
	                                <td className={`${tableDataCell} text-sm min-w-[96px]`}>{row.raw_rr ?? '-'}</td>
	                                <td className={`${tableDataCell} text-sm min-w-[96px]`}>{row.raw_index ?? '-'}</td>
	                              </React.Fragment>
	                            );
	                          }
	                          return (
	                            <React.Fragment key={`${row.id}-raw-${itemIdx}`}>
	                              <td className={`${tableDataCell} text-sm min-w-[88px]`}>{row.severity ?? '-'}</td>
	                              <td className={`${tableDataCell} text-sm min-w-[88px]`}>{row.likelihood ?? '-'}</td>
	                              <td className={`${tableDataCell} text-sm min-w-[88px]`}>{row.raw_rr ?? '-'}</td>
	                              <td className={`${tableDataCell} text-sm min-w-[96px]`}>{row.raw_index ?? '-'}</td>
	                            </React.Fragment>
	                          );
	                        }
	                        if (item.kind === 'residual' && showResidualCol) {
	                          return (
	                            <td key={`${row.id}-residual-${itemIdx}`} className={`${tableDataCell} text-sm min-w-[120px]`}>
	                              {row.residual_rr ?? '-'} / {row.residual_index ?? '-'}
	                            </td>
	                          );
	                        }
	                        return null;
	                      })}
	                    </tr>
	                  ))}
	                </tbody>
	              </table>
	            </div>
	          )}
	        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-surface-300 rounded-xl p-4 shadow-card space-y-3">
            <h2 className="font-semibold text-charcoal">Q&A Notes</h2>
            <div className="space-y-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Question" className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm" />
              <textarea value={a} onChange={(e) => setA(e.target.value)} placeholder="Answer" className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm" rows={3} />
              <button onClick={() => void onAddQna()} className="px-3 py-2 rounded bg-teal text-white text-sm">Add Q&A</button>
            </div>
            <div className="space-y-2">
              {qna.map((item) => (
                <div key={item.id} className="border border-surface-200 rounded p-2">
                  <p className="text-sm font-semibold text-charcoal">Q: {item.question}</p>
                  <p className="text-sm text-charcoal-600">A: {item.answer || '-'}</p>
                  <div className="mt-1 text-xs text-charcoal-500 flex items-center justify-between">
                    <span>{new Date(item.created_at).toLocaleString()}</span>
                    <button onClick={() => void onDeleteQna(item.id)} className="text-critical">Delete</button>
                  </div>
                </div>
              ))}
              {qna.length === 0 && <p className="text-sm text-charcoal-500">No Q&A notes yet.</p>}
            </div>
          </div>

          {assessment.type === 'prework' && (
            <div className="bg-white border border-surface-300 rounded-xl p-4 shadow-card space-y-3">
              <h2 className="font-semibold text-charcoal">Pre-Work Sign-offs</h2>
              {assessment.status !== 'archived' && (
                <div className="space-y-2">
                  <input value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} placeholder="Employee name" className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm" />
                  <input value={employeeSignature} onChange={(e) => setEmployeeSignature(e.target.value)} placeholder="Signature (typed initials or token)" className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm" />
                  <button onClick={() => void onEmployeeSignoff()} className="px-3 py-2 rounded bg-teal text-white text-sm">Employee Sign</button>
                </div>
              )}

              <div className="space-y-2">
                {signoffs.map((s) => (
                  <div key={s.id} className="border border-surface-200 rounded p-2">
                    <p className="text-sm text-charcoal"><strong>{s.employee_name}</strong> signed at {new Date(s.signed_at).toLocaleString()}</p>
                    <p className="text-xs text-charcoal-500">Signature: {s.signature || '-'}</p>
                    {s.supervisor_signed_at ? (
                      <p className="text-xs text-success">Supervisor signed at {new Date(s.supervisor_signed_at).toLocaleString()}</p>
                    ) : (
                      canSupervisorSign && assessment.status !== 'archived' && (
                        <button onClick={() => void onSupervisorSignoff(s.id)} className="mt-1 px-2 py-1 rounded border border-teal text-teal text-xs">Supervisor Sign-off</button>
                      )
                    )}
                  </div>
                ))}
                {signoffs.length === 0 && <p className="text-sm text-charcoal-500">No employee signatures yet.</p>}
              </div>

              {canSupervisorSign && assessment.status !== 'archived' && (
                <button onClick={() => void onSupervisorSignoff()} className="px-3 py-2 rounded border border-charcoal-300 text-sm">Approve as Active (Supervisor)</button>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
