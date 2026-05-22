import { useEffect, useMemo, useRef, useState } from 'react';
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
import { RiskAssessmentRowsEditor } from '../../components/risks/RiskAssessmentRowsEditor';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';

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
  const { restoreDraft, clearDraft } = useDraftManager();
  const draftKey = `risk-assessment-create:${user?.id ?? 'anon'}:${type}`;
  const serverDraftAssessmentIdStorageKey = `sca_server_risk_assessment_draft_id:${draftKey}`;
  const serverDraftAssessmentIdRef = useRef<UUID | null>(null);
  const manualSavingRef = useRef(false);

  // If a server-side draft was created by autosave, reuse that record to avoid duplicates.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(serverDraftAssessmentIdStorageKey);
      serverDraftAssessmentIdRef.current = raw ? (raw as UUID) : null;
    } catch {
      serverDraftAssessmentIdRef.current = null;
    }
  }, [serverDraftAssessmentIdStorageKey]);

  useEffect(() => {
    const t = normalizeType(searchParams.get('type'));
    setType(t);
    setHeader(defaultHeaderForType(t));
    setRows([emptyRow(t)]);
  }, [searchParams]);

  useEffect(() => {
    setRows((prev) => prev.map((r) => recalc(r)));
  }, [type]);

  useEffect(() => {
    if (!user?.id) return;
    const restored = restoreDraft<{ header: Record<string, string>; rows: DraftRow[]; docUrl: string }>(draftKey);
    if (!restored) return;
    if (Object.keys(restored.header ?? {}).length > 0) setHeader(restored.header);
    if (Array.isArray(restored.rows) && restored.rows.length > 0) setRows(restored.rows);
    if (typeof restored.docUrl === 'string') setDocUrl(restored.docUrl);
  }, [draftKey, restoreDraft, user?.id]);

  const columns = useMemo(() => columnsForType(type), [type]);
  const hasDirtyDraft = useMemo(() => {
    if ((header.title ?? '').trim()) return true;
    if ((docUrl ?? '').trim()) return true;
    return rows.some((r) => Object.keys(r.json_data ?? {}).length > 0);
  }, [docUrl, header.title, rows]);

  useDraftRegistration({
    key: draftKey,
    label: 'Risk Assessment',
    enabled: Boolean(user?.id),
    metadata: {
      organizationId: activeCompanyId ?? null,
      moduleName: 'risks',
      formType: 'risk-assessment-create',
      linkedRecordId: serverDraftAssessmentIdRef.current
    },
    isDirty: () => hasDirtyDraft,
    serialize: () => ({ header, rows, docUrl }),
    flush: async () => {
      if (!activeCompanyId || !user?.id || !activeRole) return;
      if (!header.title?.trim()) return;
      const actorUserId = user.id as UUID;
      const companyId = activeCompanyId as UUID;

      try {
        if (manualSavingRef.current) return;
        if (!serverDraftAssessmentIdRef.current) {
	          const created = await createRiskAssessment({
	            companyId,
	            actorUserId,
	            actorRole: activeRole ?? null,
	            type,
	            title: header.title.trim(),
            heading: header.heading?.trim() || null,
            area: header.area?.trim() || null,
            activity: header.activity?.trim() || null,
            riskAssessorName: header.riskAssessorName?.trim() || null,
            assessmentDate: header.assessmentDate || null,
            nextReviewDate: header.nextReviewDate || null,
            reference: header.reference?.trim() || null,
            status: 'draft',
            docUrl: docUrl.trim() || null,
            departmentId: scope?.departmentId ?? null,
            siteId: scope?.siteId ?? null
          });

	          await replaceRiskAssessmentRows({
	            companyId,
	            assessmentId: created.id,
	            actorUserId,
	            actorRole: activeRole ?? null,
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

          serverDraftAssessmentIdRef.current = created.id;
          try {
            localStorage.setItem(serverDraftAssessmentIdStorageKey, created.id);
          } catch {
            // ignore
          }
        } else {
	          const assessmentId = serverDraftAssessmentIdRef.current;
	          await updateRiskAssessment({
	            companyId,
	            assessmentId,
	            actorUserId,
	            actorRole: activeRole ?? null,
	            scope,
	            patch: {
              type,
              title: header.title.trim(),
              heading: header.heading?.trim() || null,
              area: header.area?.trim() || null,
              activity: header.activity?.trim() || null,
              risk_assessor_name: header.riskAssessorName?.trim() || null,
              department_id: scope?.departmentId ?? null,
              site_id: scope?.siteId ?? null,
              assessment_date: header.assessmentDate || null,
              next_review_date: header.nextReviewDate || null,
              reference: header.reference?.trim() || null,
              doc_url: docUrl.trim() || null,
              status: 'draft'
            }
          });

	          await replaceRiskAssessmentRows({
	            companyId,
	            assessmentId,
	            actorUserId,
	            actorRole: activeRole ?? null,
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
        }
      } catch {
        // Best-effort server draft save; local drafts still protect the user.
      }
    }
  });

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

  function friendlySaveError(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err ?? '');
    const msg = raw.toLowerCase();
    if (msg.includes('access denied')) return 'You do not have permission to save this risk assessment.';
    if (msg.includes('closed')) return 'This risk assessment is closed and cannot be edited.';
    if (msg.includes('network')) return 'Network error. Please check your connection and try again.';
    if (msg.includes('duplicate') || msg.includes('unique')) return 'A record with these details already exists.';
    return 'Failed to save risk assessment. Please try again.';
  }

  async function save(status: RiskAssessmentStatus) {
    if (!activeCompanyId || !user?.id) return;
    if (!activeRole) {
      setError('Please select an active role to save this risk assessment.');
      return;
    }
    if (!header.title?.trim()) {
      setError('Title is required.');
      return;
    }

    // Ensure we reuse an existing server-side draft if autosave already created one.
    try {
      const raw = localStorage.getItem(serverDraftAssessmentIdStorageKey);
      serverDraftAssessmentIdRef.current = raw ? (raw as UUID) : serverDraftAssessmentIdRef.current;
    } catch {
      // ignore
    }

    manualSavingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const flash = status === 'draft' ? 'Draft saved successfully.' : 'Risk assessment submitted successfully.';
      const existingAssessmentId = serverDraftAssessmentIdRef.current;

      if (existingAssessmentId) {
        await updateRiskAssessment({
          companyId: activeCompanyId as UUID,
          assessmentId: existingAssessmentId,
          actorUserId: user.id as UUID,
          actorRole: activeRole ?? null,
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
            department_id: scope?.departmentId ?? null,
            site_id: scope?.siteId ?? null,
            status
          }
        });

        await replaceRiskAssessmentRows({
          companyId: activeCompanyId as UUID,
          assessmentId: existingAssessmentId,
          actorUserId: user.id as UUID,
          actorRole: activeRole ?? null,
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
            assessmentId: existingAssessmentId,
            actorUserId: user.id as UUID,
            actorRole: activeRole ?? null,
            scope,
            patch: {
              baseline_spreadsheet_bucket: uploaded.bucket,
              baseline_spreadsheet_key: uploaded.key
            }
          });
        }

        navigate(`/risk-assessments/${existingAssessmentId}`, { state: { flash } });
      } else {
        const created = await createRiskAssessment({
          companyId: activeCompanyId as UUID,
          actorUserId: user.id as UUID,
          actorRole: activeRole ?? null,
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
          actorRole: activeRole ?? null,
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
            actorRole: activeRole ?? null,
            scope,
            patch: {
              baseline_spreadsheet_bucket: uploaded.bucket,
              baseline_spreadsheet_key: uploaded.key
            }
          });
        }

        navigate(`/risk-assessments/${created.id}`, { state: { flash } });
      }

      clearDraft(draftKey);

      try {
        localStorage.removeItem(serverDraftAssessmentIdStorageKey);
      } catch {
        // ignore
      }
      serverDraftAssessmentIdRef.current = null;
    } catch (e) {
      console.error('Risk assessment save failed', e);
      setError(friendlySaveError(e));
    } finally {
      setSaving(false);
      manualSavingRef.current = false;
    }
  }

  return (
    <Layout title="New Risk Assessment">
      <div className="space-y-5 min-w-0 max-w-full">
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

        <RiskAssessmentRowsEditor
          type={type}
          columns={columns}
          rows={rows}
          readOnly={false}
          allowResidualEditing
          onUpdateRow={updateRow}
          onAddRow={() => setRows((prev) => [...prev, emptyRow(type)])}
          onInsertRowAt={insertRowAt}
          onDuplicateRowAt={duplicateRowAt}
          onRemoveRow={(rowId) => setRows((prev) => prev.filter((r) => r.localId !== rowId))}
        />

        {error && <div className="text-sm text-critical">{error}</div>}

        <div className="flex flex-col-reverse sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => void save('draft')}
            className="min-h-[44px] inline-flex items-center justify-center px-4 rounded-lg border border-charcoal-300 text-sm w-full sm:w-auto"
          >
            {saving ? 'Saving...' : 'Save as Draft'}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save('submitted')}
            className="min-h-[44px] inline-flex items-center justify-center px-4 rounded-lg bg-teal text-white text-sm w-full sm:w-auto"
          >
            {saving ? 'Saving...' : 'Submit'}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => navigate('/risk-assessments')}
            className="min-h-[44px] inline-flex items-center justify-center text-sm text-charcoal-500 w-full sm:w-auto"
          >
            Cancel
          </button>
        </div>
      </div>
    </Layout>
  );
}
