import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useUser } from '@insforge/react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import type { UUID } from '../../api/models/core';
import {
  addRiskAssessmentSignoff,
  createRiskAssessmentQna,
  createRiskAssessmentTemplate,
  deleteRiskAssessment,
  deleteRiskAssessmentQna,
  getRiskAssessment,
  listRiskAssessmentQna,
  listRiskAssessmentRows,
  listRiskAssessmentSignoffs,
  supervisorSignoffRiskAssessment,
  type MembershipScope,
  type RiskAssessment,
  type RiskAssessmentQna,
  type RiskAssessmentRow,
  type RiskAssessmentSignoff
} from '../../api/services/riskAssessmentsService';
import { listQualityNcrs } from '../../api/services/qualityNcrsService';
import type { QualityNcr, UUID } from '../../api/models/entities';
import { getPublicUrl } from '../../api/services/storageService';
import { columnsForType, typeLabel } from './riskTemplates';

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
  const { user } = useUser();
  const { activeCompanyId, activeRole, memberships } = useTenant();
  const scope = useMemo(() => getScopeForActiveMembership(memberships as any, activeCompanyId as UUID | null), [activeCompanyId, memberships]);

  const [assessment, setAssessment] = useState<RiskAssessment | null>(null);
  const [rows, setRows] = useState<RiskAssessmentRow[]>([]);
  const [qna, setQna] = useState<RiskAssessmentQna[]>([]);
  const [signoffs, setSignoffs] = useState<RiskAssessmentSignoff[]>([]);
  const [linkedNcrs, setLinkedNcrs] = useState<QualityNcr[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [a, setA] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [employeeSignature, setEmployeeSignature] = useState('');

  const columns = useMemo(() => (assessment ? columnsForType(assessment.type) : []), [assessment]);

  const canEdit = ['owner', 'admin', 'manager', 'supervisor', 'consultant'].includes(String(activeRole));
  const canDelete = ['owner', 'admin'].includes(String(activeRole));
  const canSupervisorSign = ['owner', 'admin', 'manager', 'supervisor'].includes(String(activeRole));

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
          actorRole: activeRole,
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
      const ncrs = await listQualityNcrs({
        companyId: activeCompanyId as UUID,
        sourceEntityType: 'risk',
        sourceEntityId: id as UUID,
        actorUserId: user.id as UUID,
        actorRole: activeRole ?? null,
        limit: 200
      });
      setLinkedNcrs(ncrs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load assessment');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [activeCompanyId, activeRole, id, user?.id]);

  async function onDelete() {
    if (!activeCompanyId || !user?.id || !id) return;
    if (!window.confirm('Delete this risk assessment? This cannot be undone.')) return;
    try {
      await deleteRiskAssessment({
        companyId: activeCompanyId as UUID,
        assessmentId: id as UUID,
        actorUserId: user.id as UUID,
        actorRole: activeRole,
        scope
      });
      navigate('/risk-assessments');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete assessment');
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
        rowsJson: rows.map((r) => r.json_data)
      });
      alert('Template saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save template');
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
      setError(e instanceof Error ? e.message : 'Failed to add Q&A');
    }
  }

  async function onDeleteQna(qnaId: UUID) {
    if (!activeCompanyId || !user?.id) return;
    try {
      await deleteRiskAssessmentQna({ companyId: activeCompanyId as UUID, qnaId, actorUserId: user.id as UUID });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete Q&A');
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
      setError(e instanceof Error ? e.message : 'Failed to sign off');
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
      setError(e instanceof Error ? e.message : 'Failed supervisor sign-off');
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
            <h1 className="text-2xl font-bold text-charcoal">{assessment.title}</h1>
            <p className="text-sm text-charcoal-500">{typeLabel(assessment.type)} | {assessment.status}</p>
            <p className="text-xs text-charcoal-500 mt-0.5">
              Reference: <span className="font-mono text-charcoal">{assessment.reference || '-'}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {assessment.doc_url && <a href={assessment.doc_url} target="_blank" rel="noreferrer" className="px-3 py-2 rounded border border-charcoal-300 text-sm">Open Google Doc</a>}
            {canEdit && assessment.status !== 'closed' && <button onClick={() => navigate(`/risk-assessments/${assessment.id}/edit`)} className="px-3 py-2 rounded bg-teal text-white text-sm">Edit</button>}
            <button onClick={() => void onSaveTemplate()} className="px-3 py-2 rounded border border-teal text-teal text-sm">Save as Template</button>
            {canDelete && <button onClick={() => void onDelete()} className="px-3 py-2 rounded border border-critical text-critical text-sm">Delete</button>}
          </div>
        </div>

        {error && <div className="text-sm text-critical">{error}</div>}

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
              <table className="min-w-full divide-y divide-surface-200">
                <thead className="bg-surface-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">#</th>
                    {columns.map((col) => <th key={col.key} className="px-3 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">{col.label}</th>)}
                    <th className="px-3 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">S</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">L</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">RR</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">Index</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">Residual RR/Index</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-200">
                  {rows.map((row, idx) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2 text-sm">{idx + 1}</td>
                      {columns.map((col) => <td key={col.key} className="px-3 py-2 text-sm text-charcoal">{String(row.json_data?.[col.key] ?? '-')}</td>)}
                      <td className="px-3 py-2 text-sm">{row.severity ?? '-'}</td>
                      <td className="px-3 py-2 text-sm">{row.likelihood ?? '-'}</td>
                      <td className="px-3 py-2 text-sm">{row.raw_rr ?? '-'}</td>
                      <td className="px-3 py-2 text-sm">{row.raw_index ?? '-'}</td>
                      <td className="px-3 py-2 text-sm">{row.residual_rr ?? '-'} / {row.residual_index ?? '-'}</td>
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
              {assessment.status !== 'closed' && (
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
                      canSupervisorSign && assessment.status !== 'closed' && (
                        <button onClick={() => void onSupervisorSignoff(s.id)} className="mt-1 px-2 py-1 rounded border border-teal text-teal text-xs">Supervisor Sign-off</button>
                      )
                    )}
                  </div>
                ))}
                {signoffs.length === 0 && <p className="text-sm text-charcoal-500">No employee signatures yet.</p>}
              </div>

              {canSupervisorSign && assessment.status !== 'closed' && (
                <button onClick={() => void onSupervisorSignoff()} className="px-3 py-2 rounded border border-charcoal-300 text-sm">Close Assessment (Supervisor)</button>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
