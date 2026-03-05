import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useUser } from '@insforge/react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import type { UUID } from '../../api/models/core';
import {
  getRiskAssessment,
  listRiskAssessmentRows,
  replaceRiskAssessmentRows,
  updateRiskAssessment,
  withCalculatedRowFields,
  type MembershipScope,
  type RiskAssessmentStatus,
  type RiskAssessmentType
} from '../../api/services/riskAssessmentsService';
import { uploadFile } from '../../api/services/storageService';
import { columnsForType, typeLabel } from './riskTemplates';

type DraftRow = {
  localId: string;
  json_data: Record<string, unknown>;
  severity: number | null;
  likelihood: number | null;
  residual_severity: number | null;
  residual_likelihood: number | null;
  raw_rr: number | null;
  raw_index: 'Low' | 'Medium' | 'High' | null;
  residual_rr: number | null;
  residual_index: 'Low' | 'Medium' | 'High' | null;
  responsible_person: string | null;
  target_date: string | null;
  completion_date: string | null;
};

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

function quickRatingToSL(value: string): { severity: number; likelihood: number } {
  const v = value.toLowerCase();
  if (v === 'l' || v === 'low') return { severity: 1, likelihood: 2 };
  if (v === 'h' || v === 'high') return { severity: 4, likelihood: 4 };
  return { severity: 3, likelihood: 3 };
}

function recalcForType(row: DraftRow, type: RiskAssessmentType): DraftRow {
  let severity = row.severity;
  let likelihood = row.likelihood;

  if (type === 'prework') {
    const quick = String(row.json_data.quick_rating ?? 'Medium');
    const mapped = quickRatingToSL(quick);
    severity = mapped.severity;
    likelihood = mapped.likelihood;
  }

  const calc = withCalculatedRowFields({
    severity,
    likelihood,
    residual_severity: row.residual_severity,
    residual_likelihood: row.residual_likelihood
  });

  return {
    ...row,
    severity,
    likelihood,
    raw_rr: calc.raw_rr,
    raw_index: calc.raw_index,
    residual_rr: calc.residual_rr,
    residual_index: calc.residual_index
  };
}

export function RiskAssessmentEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useUser();
  const { activeCompanyId, activeRole, memberships } = useTenant();
  const scope = useMemo(() => getScopeForActiveMembership(memberships as any, activeCompanyId as UUID | null), [activeCompanyId, memberships]);

  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<RiskAssessmentType>('task');
  const [status, setStatus] = useState<RiskAssessmentStatus>('draft');
  const [header, setHeader] = useState<Record<string, string>>({
    title: '',
    heading: '',
    area: '',
    activity: '',
    riskAssessorName: '',
    assessmentDate: '',
    nextReviewDate: '',
    reference: ''
  });
  const [docUrl, setDocUrl] = useState('');
  const [baselineFile, setBaselineFile] = useState<File | null>(null);
  const [rows, setRows] = useState<DraftRow[]>([]);

  const columns = useMemo(() => columnsForType(type), [type]);

  useEffect(() => {
    if (!activeCompanyId || !user?.id || !id) return;
    (async () => {
      setLoaded(false);
      setError(null);
      try {
        const [assessment, rowData] = await Promise.all([
          getRiskAssessment({
            companyId: activeCompanyId as UUID,
            assessmentId: id as UUID,
            actorUserId: user.id as UUID,
            actorRole: activeRole,
            scope
          }),
          listRiskAssessmentRows({ companyId: activeCompanyId as UUID, assessmentId: id as UUID })
        ]);

        setType(assessment.type);
        setStatus(assessment.status);
        setHeader({
          title: assessment.title ?? '',
          heading: assessment.heading ?? '',
          area: assessment.area ?? '',
          activity: assessment.activity ?? '',
          riskAssessorName: assessment.risk_assessor_name ?? '',
          assessmentDate: assessment.assessment_date ?? '',
          nextReviewDate: assessment.next_review_date ?? '',
          reference: assessment.reference ?? ''
        });
        setDocUrl(assessment.doc_url ?? '');

        const mapped = rowData.map((r) => ({
          localId: r.id,
          json_data: r.json_data ?? {},
          severity: r.severity,
          likelihood: r.likelihood,
          residual_severity: r.residual_severity,
          residual_likelihood: r.residual_likelihood,
          raw_rr: r.raw_rr,
          raw_index: r.raw_index,
          residual_rr: r.residual_rr,
          residual_index: r.residual_index,
          responsible_person: r.responsible_person,
          target_date: r.target_date,
          completion_date: r.completion_date
        }));

        setRows(mapped.length ? mapped : [{
          localId: `${Date.now()}-seed`,
          json_data: {},
          severity: null,
          likelihood: null,
          residual_severity: null,
          residual_likelihood: null,
          raw_rr: null,
          raw_index: null,
          residual_rr: null,
          residual_index: null,
          responsible_person: null,
          target_date: null,
          completion_date: null
        }]);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load assessment');
      } finally {
        setLoaded(true);
      }
    })();
  }, [activeCompanyId, activeRole, id, user?.id]);

  function updateRow(rowId: string, patch: Partial<DraftRow>) {
    setRows((prev) => prev.map((r) => (r.localId !== rowId ? r : recalcForType({ ...r, ...patch }, type))));
  }

  async function save(nextStatus?: RiskAssessmentStatus) {
    if (!activeCompanyId || !user?.id || !id) return;
    if (!header.title.trim()) {
      setError('Title is required.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const appliedStatus = nextStatus ?? status;
      await updateRiskAssessment({
        companyId: activeCompanyId as UUID,
        assessmentId: id as UUID,
        actorUserId: user.id as UUID,
        actorRole: activeRole,
        scope,
        patch: {
          type,
          title: header.title.trim(),
          heading: header.heading?.trim() || null,
          area: header.area?.trim() || null,
          activity: header.activity?.trim() || null,
          risk_assessor_name: header.riskAssessorName?.trim() || null,
          assessment_date: header.assessmentDate || null,
          next_review_date: header.nextReviewDate || null,
          reference: header.reference?.trim() || null,
          doc_url: docUrl.trim() || null,
          status: appliedStatus
        }
      });

      await replaceRiskAssessmentRows({
        companyId: activeCompanyId as UUID,
        assessmentId: id as UUID,
        actorUserId: user.id as UUID,
        actorRole: activeRole,
        scope,
        rows: rows.map((r, idx) => ({
          row_index: idx,
          json_data: r.json_data,
          severity: r.severity,
          likelihood: r.likelihood,
          residual_severity: r.residual_severity,
          residual_likelihood: r.residual_likelihood,
          responsible_person: r.responsible_person,
          target_date: r.target_date,
          completion_date: r.completion_date
        }))
      });

      if (type === 'baseline' && baselineFile) {
        const uploaded = await uploadFile('sca-evidence', baselineFile, {
          key: `${activeCompanyId}/risk-baseline/${Date.now()}-${baselineFile.name}`.replace(/\s+/g, '-')
        });
        await updateRiskAssessment({
          companyId: activeCompanyId as UUID,
          assessmentId: id as UUID,
          actorUserId: user.id as UUID,
          actorRole: activeRole,
          scope,
          patch: {
            baseline_spreadsheet_bucket: uploaded.bucket,
            baseline_spreadsheet_key: uploaded.key
          }
        });
      }

      navigate(`/risk-assessments/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save assessment');
    } finally {
      setSaving(false);
    }
  }

  const readOnly = status === 'closed';

  if (!loaded) {
    return (
      <Layout title="Edit Risk Assessment">
        <div className="space-y-2">
          <div className="h-10 bg-surface-100 rounded animate-pulse" />
          <div className="h-64 bg-surface-100 rounded animate-pulse" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Edit Risk Assessment">
      <div className="space-y-5">
        <div>
          <Link to={`/risk-assessments/${id}`} className="text-sm text-charcoal-500 hover:underline">Back to details</Link>
          <h1 className="text-2xl font-bold text-charcoal">Edit {typeLabel(type)}</h1>
          {readOnly && <p className="text-sm text-critical mt-1">This assessment is closed and read-only.</p>}
        </div>

        <div className="bg-white border border-surface-300 rounded-xl p-4 shadow-card space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Type</span>
              <select disabled={readOnly} value={type} onChange={(e) => setType(e.target.value as RiskAssessmentType)} className="w-full px-3 py-2 border border-surface-300 rounded-lg">
                <option value="baseline">Baseline</option>
                <option value="task">Task</option>
                <option value="critical">Critical Tasks</option>
                <option value="prework">Pre-Work</option>
              </select>
            </label>
            <label className="text-sm md:col-span-2"><span className="block text-xs text-charcoal-500 mb-1">Title *</span><input disabled={readOnly} value={header.title ?? ''} onChange={(e) => setHeader((s) => ({ ...s, title: e.target.value }))} className="w-full px-3 py-2 border border-surface-300 rounded-lg" /></label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Heading</span><input disabled={readOnly} value={header.heading ?? ''} onChange={(e) => setHeader((s) => ({ ...s, heading: e.target.value }))} className="w-full px-3 py-2 border border-surface-300 rounded-lg" /></label>
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Area</span><input disabled={readOnly} value={header.area ?? ''} onChange={(e) => setHeader((s) => ({ ...s, area: e.target.value }))} className="w-full px-3 py-2 border border-surface-300 rounded-lg" /></label>
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Activity</span><input disabled={readOnly} value={header.activity ?? ''} onChange={(e) => setHeader((s) => ({ ...s, activity: e.target.value }))} className="w-full px-3 py-2 border border-surface-300 rounded-lg" /></label>
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Risk Assessor</span><input disabled={readOnly} value={header.riskAssessorName ?? ''} onChange={(e) => setHeader((s) => ({ ...s, riskAssessorName: e.target.value }))} className="w-full px-3 py-2 border border-surface-300 rounded-lg" /></label>
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Date</span><input disabled={readOnly} type="date" value={header.assessmentDate ?? ''} onChange={(e) => setHeader((s) => ({ ...s, assessmentDate: e.target.value }))} className="w-full px-3 py-2 border border-surface-300 rounded-lg" /></label>
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Next Review</span><input disabled={readOnly} type="date" value={header.nextReviewDate ?? ''} onChange={(e) => setHeader((s) => ({ ...s, nextReviewDate: e.target.value }))} className="w-full px-3 py-2 border border-surface-300 rounded-lg" /></label>
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Reference</span><input disabled={readOnly} value={header.reference ?? ''} onChange={(e) => setHeader((s) => ({ ...s, reference: e.target.value }))} className="w-full px-3 py-2 border border-surface-300 rounded-lg" /></label>
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Google Doc URL</span><input disabled={readOnly} value={docUrl} onChange={(e) => setDocUrl(e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg" /></label>
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Status</span><select disabled={readOnly} value={status} onChange={(e) => setStatus(e.target.value as RiskAssessmentStatus)} className="w-full px-3 py-2 border border-surface-300 rounded-lg"><option value="draft">Draft</option><option value="submitted">Submitted</option><option value="closed">Closed</option></select></label>
          </div>

          {type === 'baseline' && !readOnly && (
            <label className="text-sm block">
              <span className="block text-xs text-charcoal-500 mb-1">Upload Baseline Spreadsheet (.xlsx)</span>
              <input type="file" accept=".xlsx,.xls" onChange={(e) => setBaselineFile(e.target.files?.[0] ?? null)} className="text-sm" />
            </label>
          )}
        </div>

        <div className="bg-white border border-surface-300 rounded-xl shadow-card overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-200 flex items-center justify-between">
            <p className="font-semibold text-charcoal">Assessment Table</p>
            {!readOnly && <button type="button" onClick={() => setRows((prev) => [...prev, recalcForType({
              localId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
              json_data: {},
              severity: null,
              likelihood: null,
              residual_severity: null,
              residual_likelihood: null,
              raw_rr: null,
              raw_index: null,
              residual_rr: null,
              residual_index: null,
              responsible_person: null,
              target_date: null,
              completion_date: null
            }, type)])} className="px-3 py-1.5 rounded border border-teal text-teal text-xs font-semibold">Add Row</button>}
          </div>
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
                  {type !== 'critical' && type !== 'prework' && <th className="px-3 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">Residual</th>}
                  <th className="px-3 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-200">
                {rows.map((row, idx) => (
                  <tr key={row.localId}>
                    <td className="px-3 py-2 text-sm">{idx + 1}</td>
                    {columns.map((col) => {
                      if (type === 'prework' && col.key === 'quick_rating') {
                        return (
                          <td key={col.key} className="px-3 py-2">
                            <select
                              disabled={readOnly}
                              value={String(row.json_data.quick_rating ?? 'Medium')}
                              onChange={(e) => updateRow(row.localId, { json_data: { ...row.json_data, quick_rating: e.target.value } })}
                              className="px-2 py-1 border border-surface-300 rounded text-sm"
                            >
                              <option>Low</option>
                              <option>Medium</option>
                              <option>High</option>
                            </select>
                          </td>
                        );
                      }
                      return (
                        <td key={col.key} className="px-3 py-2">
                          <input
                            disabled={readOnly}
                            type={col.kind === 'date' ? 'date' : 'text'}
                            value={String(row.json_data[col.key] ?? '')}
                            onChange={(e) => updateRow(row.localId, { json_data: { ...row.json_data, [col.key]: e.target.value } })}
                            className="px-2 py-1 border border-surface-300 rounded text-sm min-w-[180px]"
                          />
                        </td>
                      );
                    })}
                    <td className="px-3 py-2"><input disabled={readOnly} type="number" min={1} max={5} value={row.severity ?? ''} onChange={(e) => updateRow(row.localId, { severity: e.target.value ? Number(e.target.value) : null })} className="w-14 px-2 py-1 border border-surface-300 rounded text-sm" /></td>
                    <td className="px-3 py-2"><input disabled={readOnly} type="number" min={1} max={5} value={row.likelihood ?? ''} onChange={(e) => updateRow(row.localId, { likelihood: e.target.value ? Number(e.target.value) : null })} className="w-14 px-2 py-1 border border-surface-300 rounded text-sm" /></td>
                    <td className="px-3 py-2 text-sm">{row.raw_rr ?? '-'}</td>
                    <td className="px-3 py-2 text-sm">{row.raw_index ?? '-'}</td>
                    {type !== 'critical' && type !== 'prework' && <td className="px-3 py-2 text-sm">{`${row.residual_severity ?? '-'} / ${row.residual_likelihood ?? '-'} / ${row.residual_rr ?? '-'} / ${row.residual_index ?? '-'}`}</td>}
                    <td className="px-3 py-2">{!readOnly && <button type="button" onClick={() => setRows((prev) => prev.filter((r) => r.localId !== row.localId))} className="text-xs text-critical">Remove</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {error && <div className="text-sm text-critical">{error}</div>}

        <div className="flex items-center gap-3">
          {!readOnly && <button disabled={saving} onClick={() => void save('draft')} className="px-4 py-2 rounded-lg border border-charcoal-300 text-sm">{saving ? 'Saving...' : 'Save Draft'}</button>}
          {!readOnly && <button disabled={saving} onClick={() => void save('submitted')} className="px-4 py-2 rounded-lg bg-teal text-white text-sm">{saving ? 'Saving...' : 'Submit'}</button>}
          <button onClick={() => navigate(`/risk-assessments/${id}`)} className="text-sm text-charcoal-500">Cancel</button>
        </div>
      </div>
    </Layout>
  );
}
