import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useUser } from '@insforge/react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import type { UUID } from '../../api/models/core';
import {
  createRiskAssessment,
  replaceRiskAssessmentRows,
  updateRiskAssessment,
  withCalculatedRowFields,
  type MembershipScope,
  type RiskAssessmentStatus,
  type RiskAssessmentType
} from '../../api/services/riskAssessmentsService';
import { uploadFile } from '../../api/services/storageService';
import { columnsForType, defaultHeaderForType, typeLabel } from './riskTemplates';

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

function emptyRow(type: RiskAssessmentType): DraftRow {
  const base: DraftRow = {
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
  };
  if (type === 'prework') {
    base.json_data.quick_rating = 'Medium';
  }
  return base;
}

function normalizeType(value: string | null): RiskAssessmentType {
  if (value === 'baseline') return 'baseline';
  if (value === 'critical') return 'critical';
  if (value === 'prework') return 'prework';
  return 'task';
}

function quickRatingToSL(value: string): { severity: number; likelihood: number } {
  const v = value.toLowerCase();
  if (v === 'l' || v === 'low') return { severity: 1, likelihood: 2 };
  if (v === 'h' || v === 'high') return { severity: 4, likelihood: 4 };
  return { severity: 3, likelihood: 3 };
}

export function RiskAssessmentCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useUser();
  const { activeCompanyId, activeRole, memberships } = useTenant();
  const scope = useMemo(() => getScopeForActiveMembership(memberships as any, activeCompanyId as UUID | null), [activeCompanyId, memberships]);

  const [type, setType] = useState<RiskAssessmentType>(normalizeType(searchParams.get('type')));
  const [header, setHeader] = useState<Record<string, string>>(defaultHeaderForType(normalizeType(searchParams.get('type'))));
  const [rows, setRows] = useState<DraftRow[]>([emptyRow(normalizeType(searchParams.get('type')))]);
  const [docUrl, setDocUrl] = useState('');
  const [baselineFile, setBaselineFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = normalizeType(searchParams.get('type'));
    setType(t);
    setHeader(defaultHeaderForType(t));
    setRows([emptyRow(t)]);
  }, [searchParams]);

  useEffect(() => {
    setRows((prev) => prev.map((r) => recalc(r)));
  }, [type]);

  const columns = useMemo(() => columnsForType(type), [type]);

  function recalc(row: DraftRow): DraftRow {
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

  function updateRow(rowId: string, patch: Partial<DraftRow>) {
    setRows((prev) => prev.map((r) => (r.localId !== rowId ? r : recalc({ ...r, ...patch }))));
  }

  function insertRowAt(index: number, base?: DraftRow) {
    setRows((prev) => {
      const next = [...prev];
      const source = base ?? emptyRow(type);
      const newRow = recalc({
        ...source,
        localId: `${Date.now()}-${Math.random().toString(16).slice(2)}`
      });
      next.splice(index, 0, newRow);
      return next;
    });
  }

  function duplicateRowAt(index: number) {
    setRows((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      const clone: DraftRow = recalc({
        ...current,
        localId: `${Date.now()}-${Math.random().toString(16).slice(2)}`
      });
      next.splice(index + 1, 0, clone);
      return next;
    });
  }

  async function save(status: RiskAssessmentStatus) {
    if (!activeCompanyId || !user?.id) return;
    if (!header.title?.trim()) {
      setError('Title is required.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const created = await createRiskAssessment({
        companyId: activeCompanyId as UUID,
        actorUserId: user.id as UUID,
        actorRole: activeRole,
        type,
        title: header.title.trim(),
        heading: header.heading?.trim() || null,
        area: header.area?.trim() || null,
        activity: header.activity?.trim() || null,
        riskAssessorName: header.riskAssessorName?.trim() || null,
        assessmentDate: header.assessmentDate || null,
        nextReviewDate: header.nextReviewDate || null,
        reference: header.reference?.trim() || null,
        status,
        docUrl: docUrl.trim() || null,
        departmentId: scope?.departmentId ?? null,
        siteId: scope?.siteId ?? null
      });

      await replaceRiskAssessmentRows({
        companyId: activeCompanyId as UUID,
        assessmentId: created.id,
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
          assessmentId: created.id,
          actorUserId: user.id as UUID,
          actorRole: activeRole,
          scope,
          patch: {
            baseline_spreadsheet_bucket: uploaded.bucket,
            baseline_spreadsheet_key: uploaded.key
          }
        });
      }

      navigate(`/risk-assessments/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create assessment');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout title="New Risk Assessment">
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-charcoal">{typeLabel(type)}</h1>
          <p className="text-sm text-charcoal-500">Create and populate the assessment table in one flow.</p>
        </div>

        <div className="bg-white border border-surface-300 rounded-xl p-4 shadow-card space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Risk Assessment Type</span>
              <select value={type} onChange={(e) => setType(normalizeType(e.target.value))} className="w-full px-3 py-2 border border-surface-300 rounded-lg">
                <option value="baseline">Baseline</option>
                <option value="task">Task</option>
                <option value="critical">Critical Tasks</option>
                <option value="prework">Pre-Work</option>
              </select>
            </label>
            <label className="text-sm md:col-span-2">
              <span className="block text-xs text-charcoal-500 mb-1">Title *</span>
              <input value={header.title ?? ''} onChange={(e) => setHeader((s) => ({ ...s, title: e.target.value }))} className="w-full px-3 py-2 border border-surface-300 rounded-lg" />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Heading</span><input value={header.heading ?? ''} onChange={(e) => setHeader((s) => ({ ...s, heading: e.target.value }))} className="w-full px-3 py-2 border border-surface-300 rounded-lg" /></label>
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Area</span><input value={header.area ?? ''} onChange={(e) => setHeader((s) => ({ ...s, area: e.target.value }))} className="w-full px-3 py-2 border border-surface-300 rounded-lg" /></label>
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Activity</span><input value={header.activity ?? ''} onChange={(e) => setHeader((s) => ({ ...s, activity: e.target.value }))} className="w-full px-3 py-2 border border-surface-300 rounded-lg" /></label>
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Risk Assessor</span><input value={header.riskAssessorName ?? ''} onChange={(e) => setHeader((s) => ({ ...s, riskAssessorName: e.target.value }))} className="w-full px-3 py-2 border border-surface-300 rounded-lg" /></label>
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Date</span><input type="date" value={header.assessmentDate ?? ''} onChange={(e) => setHeader((s) => ({ ...s, assessmentDate: e.target.value }))} className="w-full px-3 py-2 border border-surface-300 rounded-lg" /></label>
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Next Review</span><input type="date" value={header.nextReviewDate ?? ''} onChange={(e) => setHeader((s) => ({ ...s, nextReviewDate: e.target.value }))} className="w-full px-3 py-2 border border-surface-300 rounded-lg" /></label>
            <label className="text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Reference</span>
              <input
                value={header.reference ?? ''}
                onChange={(e) => setHeader((s) => ({ ...s, reference: e.target.value }))}
                placeholder="e.g. RA-2026-001"
                className="w-full px-3 py-2 border border-surface-300 rounded-lg"
              />
              <span className="mt-1 block text-[11px] text-charcoal-400">
                Used as the cross-reference for NCRs, incidents, audits, CAPA and documents.
              </span>
            </label>
            <label className="text-sm md:col-span-1"><span className="block text-xs text-charcoal-500 mb-1">Google Doc URL</span><input value={docUrl} onChange={(e) => setDocUrl(e.target.value)} placeholder="https://docs.google.com/..." className="w-full px-3 py-2 border border-surface-300 rounded-lg" /></label>
          </div>

          {type === 'baseline' && (
            <label className="text-sm block">
              <span className="block text-xs text-charcoal-500 mb-1">Upload Baseline Spreadsheet (.xlsx) (optional)</span>
              <input type="file" accept=".xlsx,.xls" onChange={(e) => setBaselineFile(e.target.files?.[0] ?? null)} className="text-sm" />
            </label>
          )}
        </div>

        <div className="bg-white border border-surface-300 rounded-xl shadow-card overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-200 flex items-center justify-between">
            <p className="font-semibold text-charcoal">Assessment Table</p>
            <button type="button" onClick={() => setRows((prev) => [...prev, emptyRow(type)])} className="px-3 py-1.5 rounded border border-teal text-teal text-xs font-semibold">Add Row</button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-surface-200">
              <thead className="bg-surface-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">#</th>
                  {columns.map((col) => (
                    <th key={col.key} className="px-3 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">
                      {col.label}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">S</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">L</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">S*L</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">Index</th>
                  {type !== 'critical' && type !== 'prework' && (
                    <th className="px-3 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">
                      Residual S/L/S*L/Index
                    </th>
                  )}
                  <th className="px-3 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase">Row Actions</th>
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
                            type={col.kind === 'date' ? 'date' : 'text'}
                            value={String(row.json_data[col.key] ?? '')}
                            onChange={(e) => updateRow(row.localId, { json_data: { ...row.json_data, [col.key]: e.target.value } })}
                            className="px-2 py-1 border border-surface-300 rounded text-sm min-w-[180px]"
                          />
                        </td>
                      );
                    })}
                    <td className="px-3 py-2"><input type="number" min={1} max={5} value={row.severity ?? ''} onChange={(e) => updateRow(row.localId, { severity: e.target.value ? Number(e.target.value) : null })} className="w-14 px-2 py-1 border border-surface-300 rounded text-sm" /></td>
                    <td className="px-3 py-2"><input type="number" min={1} max={5} value={row.likelihood ?? ''} onChange={(e) => updateRow(row.localId, { likelihood: e.target.value ? Number(e.target.value) : null })} className="w-14 px-2 py-1 border border-surface-300 rounded text-sm" /></td>
                    <td className="px-3 py-2 text-sm">{row.raw_rr ?? '-'}</td>
                    <td className="px-3 py-2 text-sm">{row.raw_index ?? '-'}</td>
                    {type !== 'critical' && type !== 'prework' && (
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1 text-sm">
                          <input type="number" min={1} max={5} value={row.residual_severity ?? ''} onChange={(e) => updateRow(row.localId, { residual_severity: e.target.value ? Number(e.target.value) : null })} className="w-12 px-1 py-1 border border-surface-300 rounded" />
                          <input type="number" min={1} max={5} value={row.residual_likelihood ?? ''} onChange={(e) => updateRow(row.localId, { residual_likelihood: e.target.value ? Number(e.target.value) : null })} className="w-12 px-1 py-1 border border-surface-300 rounded" />
                          <span>{row.residual_rr ?? '-'}</span>
                          <span>{row.residual_index ?? '-'}</span>
                        </div>
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <div className="flex flex-col items-start gap-1 text-xs">
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            onClick={() => insertRowAt(idx)}
                            className="px-1.5 py-0.5 rounded border border-surface-300 text-charcoal-700 hover:bg-surface-50"
                          >
                            Insert Above
                          </button>
                          <button
                            type="button"
                            onClick={() => insertRowAt(idx + 1)}
                            className="px-1.5 py-0.5 rounded border border-surface-300 text-charcoal-700 hover:bg-surface-50"
                          >
                            Insert Below
                          </button>
                          <button
                            type="button"
                            onClick={() => duplicateRowAt(idx)}
                            className="px-1.5 py-0.5 rounded border border-surface-300 text-charcoal-700 hover:bg-surface-50"
                          >
                            Duplicate
                          </button>
                          <button
                            type="button"
                            onClick={() => setRows((prev) => prev.filter((r) => r.localId !== row.localId))}
                            className="px-1.5 py-0.5 rounded border border-critical/40 text-critical hover:bg-critical/5"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {error && <div className="text-sm text-critical">{error}</div>}

        <div className="flex items-center gap-3">
          <button disabled={saving} onClick={() => void save('draft')} className="px-4 py-2 rounded-lg border border-charcoal-300 text-sm">{saving ? 'Saving...' : 'Save Draft'}</button>
          <button disabled={saving} onClick={() => void save('submitted')} className="px-4 py-2 rounded-lg bg-teal text-white text-sm">{saving ? 'Saving...' : 'Submit'}</button>
          <button disabled={saving} onClick={() => navigate('/risk-assessments')} className="text-sm text-charcoal-500">Cancel</button>
        </div>
      </div>
    </Layout>
  );
}
