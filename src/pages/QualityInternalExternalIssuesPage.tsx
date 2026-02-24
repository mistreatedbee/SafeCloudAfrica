import React, { useEffect, useMemo, useState } from 'react';
import { useUser } from '@insforge/react';
import { Layout } from '../components/layout/Layout';
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import type { CompanyRole, UUID } from '../api/models/core';
import type { InternalExternalIssueStatus, QualityInternalExternalIssue, QualityInternalExternalIssuesRegister } from '../api/models/entities';
import {
  approveInternalExternalIssueRegister,
  createInternalExternalIssue,
  createInternalExternalIssueRegister,
  getInternalExternalIssuesSummary,
  IE_DOC_NO_DEFAULT,
  IE_RISK_OR_OPP_OPTIONS,
  IE_SCOPE_OPTIONS,
  IE_STATUS_OPTIONS,
  listInternalExternalIssueRegisters,
  listInternalExternalIssues,
  mapIssueNature,
  updateInternalExternalIssue,
  updateInternalExternalIssueRegister
} from '../api/services/internalExternalIssuesService';
import { listUserProfiles } from '../api/services/profilesService';
import { SelectOrType } from '../components/ui/SelectOrType';
import { downloadTextFile, toCsv } from '../utils/csv';

type FormMode = 'create' | 'edit' | 'view';
type RegisterForm = {
  docNo: string;
  issueNo: string;
  assessmentDoneByUserId: UUID | '';
  assessmentDoneByNameSnapshot: string;
  assessmentDoneOn: string;
};
type IssueForm = {
  id?: UUID;
  refNo?: number;
  scope: string;
  issueIdentification: string;
  riskOrOpp: string;
  likelihood: number;
  severity: number;
  nature: string;
  natureOverride: boolean;
  controlMeasure: string;
  responsibleUserId: UUID | '';
  responsibleNameSnapshot: string;
  targetDate: string;
  status: InternalExternalIssueStatus;
  closureDate: string;
  closureEvidence: string;
};

const SCOPE_OPTIONS = IE_SCOPE_OPTIONS.map((value) => ({ id: value, value, label: value }));
const RISK_OR_OPP_OPTIONS = IE_RISK_OR_OPP_OPTIONS.map((value) => ({ id: value, value, label: value }));
const NATURE_OPTIONS = ['Low', 'Medium', 'Serious', 'Critical'].map((value) => ({ id: value, value, label: value }));
const EMPTY_ISSUE_FORM: IssueForm = {
  scope: 'Internal',
  issueIdentification: '',
  riskOrOpp: 'Risk',
  likelihood: 1,
  severity: 1,
  nature: 'Low',
  natureOverride: false,
  controlMeasure: '',
  responsibleUserId: '',
  responsibleNameSnapshot: '',
  targetDate: '',
  status: 'Open',
  closureDate: '',
  closureEvidence: ''
};

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-ZA');
}
function roleCanWrite(role: CompanyRole | null): boolean {
  return role === 'owner' || role === 'admin' || role === 'manager' || role === 'supervisor';
}
function roleCanApprove(role: CompanyRole | null): boolean {
  return role === 'owner' || role === 'admin';
}
function roleCanExport(role: CompanyRole | null): boolean {
  return role === 'owner' || role === 'admin';
}
function roleCanEditIssueNo(role: CompanyRole | null): boolean {
  return role === 'admin';
}
function natureClass(nature: string): string {
  const value = nature.trim().toLowerCase();
  if (value === 'critical') return 'bg-critical/15 text-critical';
  if (value === 'serious' || value === 'high') return 'bg-warning/20 text-warning';
  if (value === 'medium') return 'bg-yellow-100 text-yellow-700';
  return 'bg-surface-100 text-charcoal-600';
}
function toIssueForm(row?: QualityInternalExternalIssue): IssueForm {
  return {
    id: row?.id,
    refNo: row?.ref_no,
    scope: row?.scope ?? 'Internal',
    issueIdentification: row?.issue_identification ?? '',
    riskOrOpp: row?.risk_or_opp ?? 'Risk',
    likelihood: row?.likelihood ?? 1,
    severity: row?.severity ?? 1,
    nature: String(row?.nature ?? 'Low'),
    natureOverride: !!row?.nature_override,
    controlMeasure: row?.control_measure ?? '',
    responsibleUserId: (row?.responsible_user_id as UUID | null) ?? '',
    responsibleNameSnapshot: row?.responsible_name_snapshot ?? '',
    targetDate: row?.target_date ?? '',
    status: row?.status ?? 'Open',
    closureDate: row?.closure_date ?? '',
    closureEvidence: (row?.closure_evidence_file_ids ?? []).join(', ')
  };
}

export default function QualityInternalExternalIssuesPage() {
  const { user } = useUser();
  const { activeCompanyId, activeRole } = useTenant();
  const canWrite = roleCanWrite(activeRole ?? null);
  const canApprove = roleCanApprove(activeRole ?? null);
  const canExport = roleCanExport(activeRole ?? null);
  const canEditIssueNo = roleCanEditIssueNo(activeRole ?? null);

  const now = new Date();
  const [dateFrom, setDateFrom] = useState<string>(dateOnly(new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())));
  const [dateTo, setDateTo] = useState<string>(dateOnly(now));
  const [scopeFilter, setScopeFilter] = useState('');
  const [riskOrOppFilter, setRiskOrOppFilter] = useState('');
  const [natureFilter, setNatureFilter] = useState('');
  const [responsibleFilter, setResponsibleFilter] = useState<UUID | ''>('');
  const [search, setSearch] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const [selectedRegisterId, setSelectedRegisterId] = useState<UUID | ''>('');
  const [registerForm, setRegisterForm] = useState<RegisterForm>({
    docNo: IE_DOC_NO_DEFAULT,
    issueNo: '',
    assessmentDoneByUserId: '',
    assessmentDoneByNameSnapshot: '',
    assessmentDoneOn: dateOnly(new Date())
  });
  const [approvalSignature, setApprovalSignature] = useState('');
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerSaving, setRegisterSaving] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>('create');
  const [issueForm, setIssueForm] = useState<IssueForm>(EMPTY_ISSUE_FORM);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [issueSaving, setIssueSaving] = useState(false);

  const { data: profiles } = useAsync(async () => (activeCompanyId ? listUserProfiles(activeCompanyId) : []), [activeCompanyId]);
  const userLabel = useMemo(() => new Map((profiles ?? []).map((p) => [p.user_id, p.full_name || p.email || p.user_id])), [profiles]);

  const { data: registers, loading: registersLoading, error: registersError, refresh: refreshRegisters } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return await listInternalExternalIssueRegisters({ companyId: activeCompanyId, actorRole: activeRole ?? null, dateFrom, dateTo });
  }, [activeCompanyId, activeRole, dateFrom, dateTo, refreshKey]);

  const selectedRegister = useMemo(() => (registers ?? []).find((r) => r.id === selectedRegisterId) ?? null, [registers, selectedRegisterId]);

  useEffect(() => {
    if (!registers || registers.length === 0) {
      setSelectedRegisterId('');
      return;
    }
    if (!selectedRegisterId || !registers.some((r) => r.id === selectedRegisterId)) setSelectedRegisterId(registers[0].id);
  }, [registers, selectedRegisterId]);

  useEffect(() => {
    if (!selectedRegister) {
      setRegisterForm({ docNo: IE_DOC_NO_DEFAULT, issueNo: '', assessmentDoneByUserId: (user?.id as UUID | undefined) ?? '', assessmentDoneByNameSnapshot: '', assessmentDoneOn: dateOnly(new Date()) });
      setApprovalSignature('');
      return;
    }
    setRegisterForm({
      docNo: selectedRegister.doc_no,
      issueNo: selectedRegister.issue_no,
      assessmentDoneByUserId: (selectedRegister.assessment_done_by_user_id as UUID | null) ?? '',
      assessmentDoneByNameSnapshot: selectedRegister.assessment_done_by_name_snapshot,
      assessmentDoneOn: selectedRegister.assessment_done_on
    });
    setApprovalSignature(selectedRegister.approval_signature ?? '');
  }, [selectedRegister, user?.id]);

  const { data: rows, loading: rowsLoading, error: rowsError, refresh: refreshRows } = useAsync(async () => {
    if (!activeCompanyId || !selectedRegisterId) return [];
    return await listInternalExternalIssues({
      companyId: activeCompanyId,
      actorRole: activeRole ?? null,
      registerId: selectedRegisterId as UUID,
      scope: scopeFilter || undefined,
      riskOrOpp: riskOrOppFilter || undefined,
      nature: natureFilter || undefined,
      responsibleUserId: responsibleFilter || undefined,
      issueSearch: search || undefined
    });
  }, [activeCompanyId, activeRole, selectedRegisterId, scopeFilter, riskOrOppFilter, natureFilter, responsibleFilter, search, refreshKey]);

  const { data: summary } = useAsync(async () => {
    if (!activeCompanyId || !selectedRegisterId) return { totalIssues: 0, internalCount: 0, externalCount: 0, highSeriousCount: 0, overdueActions: 0 };
    return await getInternalExternalIssuesSummary({
      companyId: activeCompanyId,
      actorRole: activeRole ?? null,
      registerId: selectedRegisterId as UUID,
      scope: scopeFilter || undefined,
      riskOrOpp: riskOrOppFilter || undefined,
      nature: natureFilter || undefined,
      responsibleUserId: responsibleFilter || undefined,
      issueSearch: search || undefined
    });
  }, [activeCompanyId, activeRole, selectedRegisterId, scopeFilter, riskOrOppFilter, natureFilter, responsibleFilter, search, refreshKey]);

  const currentRiskRating = useMemo(() => Number(issueForm.likelihood || 1) * Number(issueForm.severity || 1), [issueForm.likelihood, issueForm.severity]);
  const autoNature = useMemo(() => mapIssueNature(currentRiskRating), [currentRiskRating]);
  useEffect(() => {
    if (!issueForm.natureOverride) setIssueForm((prev) => ({ ...prev, nature: autoNature }));
  }, [autoNature, issueForm.natureOverride]);

  async function refreshAll() {
    setRefreshKey((x) => x + 1);
    await Promise.all([refreshRegisters(), refreshRows()]);
  }
  function confirmRevisionIfNeeded(): boolean {
    return !selectedRegister?.approved_by_user_id || window.confirm('This register is approved. Editing will start a new revision and clear approval. Continue?');
  }

  async function handleSaveRegister() {
    if (!activeCompanyId || !user?.id || !canWrite) return;
    setRegisterSaving(true);
    setRegisterError(null);
    try {
      if (selectedRegister) {
        if (!confirmRevisionIfNeeded()) return;
        await updateInternalExternalIssueRegister({
          companyId: activeCompanyId,
          registerId: selectedRegister.id,
          actorUserId: user.id as UUID,
          actorRole: activeRole ?? null,
          patch: {
            doc_no: registerForm.docNo.trim() || IE_DOC_NO_DEFAULT,
            issue_no: canEditIssueNo ? registerForm.issueNo.trim() : selectedRegister.issue_no,
            assessment_done_by_user_id: registerForm.assessmentDoneByUserId || null,
            assessment_done_by_name_snapshot: registerForm.assessmentDoneByNameSnapshot.trim(),
            assessment_done_on: registerForm.assessmentDoneOn
          } as Partial<QualityInternalExternalIssuesRegister>
        });
      } else {
        const created = await createInternalExternalIssueRegister({
          companyId: activeCompanyId,
          actorUserId: user.id as UUID,
          actorRole: activeRole ?? null,
          docNo: registerForm.docNo.trim() || IE_DOC_NO_DEFAULT,
          issueNo: canEditIssueNo ? registerForm.issueNo.trim() || undefined : undefined,
          assessmentDoneByUserId: registerForm.assessmentDoneByUserId || null,
          assessmentDoneByNameSnapshot: registerForm.assessmentDoneByNameSnapshot.trim(),
          assessmentDoneOn: registerForm.assessmentDoneOn
        });
        setSelectedRegisterId(created.id);
      }
      await refreshAll();
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : 'Failed to save register.');
    } finally {
      setRegisterSaving(false);
    }
  }

  async function handleApproveRegister() {
    if (!activeCompanyId || !selectedRegister || !user?.id || !canApprove) return;
    try {
      await approveInternalExternalIssueRegister({
        companyId: activeCompanyId,
        registerId: selectedRegister.id,
        actorUserId: user.id as UUID,
        actorRole: activeRole ?? null,
        approvalSignature: approvalSignature.trim() || null
      });
      await refreshAll();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to approve register.');
    }
  }

  function openCreateIssue() {
    setIssueError(null);
    setFormMode('create');
    setIssueForm({ ...EMPTY_ISSUE_FORM, nature: mapIssueNature(1), responsibleNameSnapshot: registerForm.assessmentDoneByNameSnapshot });
    setModalOpen(true);
  }
  function openViewIssue(row: QualityInternalExternalIssue) {
    setIssueError(null);
    setFormMode('view');
    setIssueForm(toIssueForm(row));
    setModalOpen(true);
  }
  function openEditIssue(row: QualityInternalExternalIssue) {
    setIssueError(null);
    setFormMode('edit');
    setIssueForm(toIssueForm(row));
    setModalOpen(true);
  }

  async function handleSaveIssue() {
    if (!activeCompanyId || !selectedRegisterId || !user?.id || !canWrite) return;
    if (!confirmRevisionIfNeeded()) return;
    setIssueSaving(true);
    setIssueError(null);
    try {
      const evidenceIds = issueForm.closureEvidence.split(',').map((x) => x.trim()).filter(Boolean) as UUID[];
      const payload = {
        companyId: activeCompanyId,
        actorUserId: user.id as UUID,
        actorRole: activeRole ?? null,
        scope: issueForm.scope.trim(),
        issueIdentification: issueForm.issueIdentification.trim(),
        riskOrOpp: issueForm.riskOrOpp.trim(),
        likelihood: Number(issueForm.likelihood),
        severity: Number(issueForm.severity),
        nature: issueForm.natureOverride ? issueForm.nature.trim() : null,
        natureOverride: issueForm.natureOverride,
        controlMeasure: issueForm.controlMeasure.trim() || null,
        responsibleUserId: issueForm.responsibleUserId || null,
        responsibleNameSnapshot: issueForm.responsibleNameSnapshot.trim(),
        targetDate: issueForm.targetDate || null,
        status: issueForm.status,
        closureDate: issueForm.closureDate || null,
        closureEvidenceFileIds: evidenceIds.length ? evidenceIds : null
      };
      if (formMode === 'create') {
        await createInternalExternalIssue({ ...payload, registerId: selectedRegisterId as UUID });
      } else if (formMode === 'edit' && issueForm.id) {
        await updateInternalExternalIssue({
          companyId: activeCompanyId,
          issueId: issueForm.id,
          actorUserId: user.id as UUID,
          actorRole: activeRole ?? null,
          patch: {
            scope: payload.scope,
            issue_identification: payload.issueIdentification,
            risk_or_opp: payload.riskOrOpp,
            likelihood: payload.likelihood,
            severity: payload.severity,
            nature: payload.nature ?? undefined,
            nature_override: payload.natureOverride,
            control_measure: payload.controlMeasure,
            responsible_user_id: payload.responsibleUserId,
            responsible_name_snapshot: payload.responsibleNameSnapshot,
            target_date: payload.targetDate,
            status: payload.status,
            closure_date: payload.closureDate,
            closure_evidence_file_ids: payload.closureEvidenceFileIds
          }
        });
      }
      setModalOpen(false);
      await refreshAll();
    } catch (err) {
      setIssueError(err instanceof Error ? err.message : 'Failed to save issue row.');
    } finally {
      setIssueSaving(false);
    }
  }

  function exportRows(rowsToExport: QualityInternalExternalIssue[], filePrefix = 'internal-external-issues') {
    if (!selectedRegister) return;
    const csvRows = rowsToExport.map((row) => ({
      'DOC. NO.': selectedRegister.doc_no,
      'ISSUE NO.': selectedRegister.issue_no,
      'Ref #': row.ref_no,
      'Internal/External': row.scope,
      'Issues Identification': row.issue_identification,
      'Risk/ Opp.': row.risk_or_opp,
      L: row.likelihood,
      S: row.severity,
      R: row.risk_rating,
      Nature: row.nature,
      'Control Measure': row.control_measure ?? '',
      'Responsible person': row.responsible_name_snapshot,
      'Target date': row.target_date ?? '',
      Status: row.status,
      'Closure date': row.closure_date ?? ''
    }));
    const csv = toCsv(csvRows);
    downloadTextFile(`${filePrefix}-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8');
  }

  return (
    <Layout title="Internal & External Issues">
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-surface-300 p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <select value={selectedRegisterId} onChange={(e) => setSelectedRegisterId((e.target.value || '') as UUID | '')} className="px-3 py-2 border border-surface-300 rounded-lg text-sm min-w-[220px]">
              <option value="">Select register</option>
              {(registers ?? []).map((register) => (
                <option key={register.id} value={register.id}>
                  {register.issue_no} - {register.doc_no} ({register.assessment_done_on})
                </option>
              ))}
            </select>
            {canWrite && (
              <button
                type="button"
                onClick={() => {
                  setSelectedRegisterId('');
                  setRegisterForm({ docNo: IE_DOC_NO_DEFAULT, issueNo: '', assessmentDoneByUserId: (user?.id as UUID | undefined) ?? '', assessmentDoneByNameSnapshot: '', assessmentDoneOn: dateOnly(new Date()) });
                }}
                className="px-3 py-2 border border-surface-300 rounded-lg text-sm hover:bg-surface-50"
              >
                New Register
              </button>
            )}
            {registersLoading && <span className="text-xs text-charcoal-500">Loading registers...</span>}
            {registersError && <span className="text-xs text-critical">{registersError.message}</span>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">DOC. NO.</span><input value={registerForm.docNo} onChange={(e) => setRegisterForm((prev) => ({ ...prev, docNo: e.target.value }))} className="w-full px-3 py-2 border border-surface-300 rounded-lg" disabled={!canWrite} /></label>
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">ISSUE NO.</span><input value={registerForm.issueNo} onChange={(e) => setRegisterForm((prev) => ({ ...prev, issueNo: e.target.value }))} className="w-full px-3 py-2 border border-surface-300 rounded-lg" disabled={!canWrite || !canEditIssueNo} placeholder={canEditIssueNo ? '01' : 'Auto'} /></label>
            <label className="text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Assessment done by</span>
              <select value={registerForm.assessmentDoneByUserId} onChange={(e) => {
                const userId = (e.target.value || '') as UUID | '';
                setRegisterForm((prev) => ({ ...prev, assessmentDoneByUserId: userId, assessmentDoneByNameSnapshot: userId ? userLabel.get(userId) ?? prev.assessmentDoneByNameSnapshot : prev.assessmentDoneByNameSnapshot }));
              }} className="w-full px-3 py-2 border border-surface-300 rounded-lg" disabled={!canWrite}>
                <option value="">Select user</option>
                {(profiles ?? []).map((profile) => <option key={profile.user_id} value={profile.user_id}>{profile.full_name || profile.email || profile.user_id}</option>)}
              </select>
            </label>
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Assessment done on</span><input type="date" value={registerForm.assessmentDoneOn} onChange={(e) => setRegisterForm((prev) => ({ ...prev, assessmentDoneOn: e.target.value }))} className="w-full px-3 py-2 border border-surface-300 rounded-lg" disabled={!canWrite} /></label>
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Assessment updated on</span><input value={selectedRegister?.assessment_updated_on ?? '-'} readOnly className="w-full px-3 py-2 border border-surface-300 rounded-lg bg-surface-50" /></label>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Approved by (signature)</span><input value={approvalSignature} onChange={(e) => setApprovalSignature(e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg" disabled={!canApprove || !selectedRegister} placeholder="Digital sign-off text" /></label>
            <div className="text-sm text-charcoal-600">
              <p>Approved by: {selectedRegister?.approved_by_user_id ? userLabel.get(selectedRegister.approved_by_user_id) ?? selectedRegister.approved_by_user_id : '-'}</p>
              <p>Approved at: {formatDate(selectedRegister?.approved_at ?? null)}</p>
              <p>Revision: {selectedRegister?.revision_number ?? 1}</p>
            </div>
            <div className="flex items-end gap-2">
              {canWrite && <button type="button" onClick={() => void handleSaveRegister()} disabled={registerSaving} className="px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-70">{registerSaving ? 'Saving...' : selectedRegister ? 'Save Register' : 'Create Register'}</button>}
              {canApprove && selectedRegister && <button type="button" onClick={() => void handleApproveRegister()} className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium hover:bg-surface-50">Approve Register</button>}
            </div>
          </div>
          {registerError && <p className="text-sm text-critical">{registerError}</p>}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-surface-300 p-3"><p className="text-xs text-charcoal-500">Total Issues</p><p className="text-2xl font-semibold text-charcoal">{summary?.totalIssues ?? 0}</p></div>
          <div className="bg-white rounded-xl border border-surface-300 p-3"><p className="text-xs text-charcoal-500">Internal / External</p><p className="text-2xl font-semibold text-charcoal">{summary?.internalCount ?? 0} / {summary?.externalCount ?? 0}</p></div>
          <div className="bg-white rounded-xl border border-surface-300 p-3"><p className="text-xs text-charcoal-500">High/Serious</p><p className="text-2xl font-semibold text-warning">{summary?.highSeriousCount ?? 0}</p></div>
          <div className="bg-white rounded-xl border border-surface-300 p-3"><p className="text-xs text-charcoal-500">Overdue Actions</p><p className="text-2xl font-semibold text-critical">{summary?.overdueActions ?? 0}</p></div>
        </div>

        <div className="bg-white rounded-xl border border-surface-300 p-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-charcoal-500">Date range</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
            <select value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)} className="px-3 py-2 border border-surface-300 rounded-lg text-sm"><option value="">All Internal/External</option>{IE_SCOPE_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}</select>
            <select value={riskOrOppFilter} onChange={(e) => setRiskOrOppFilter(e.target.value)} className="px-3 py-2 border border-surface-300 rounded-lg text-sm"><option value="">All Risk/Opp.</option>{IE_RISK_OR_OPP_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}</select>
            <select value={natureFilter} onChange={(e) => setNatureFilter(e.target.value)} className="px-3 py-2 border border-surface-300 rounded-lg text-sm"><option value="">All Nature</option>{['Low', 'Medium', 'Serious', 'Critical'].map((nature) => <option key={nature} value={nature}>{nature}</option>)}</select>
            <select value={responsibleFilter} onChange={(e) => setResponsibleFilter((e.target.value || '') as UUID | '')} className="px-3 py-2 border border-surface-300 rounded-lg text-sm min-w-[220px]"><option value="">All Responsible persons</option>{(profiles ?? []).map((profile) => <option key={profile.user_id} value={profile.user_id}>{profile.full_name || profile.email || profile.user_id}</option>)}</select>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by issue text" className="px-3 py-2 border border-surface-300 rounded-lg text-sm min-w-[220px]" />
          </div>
          <div className="flex flex-wrap gap-2">
            {canWrite && selectedRegisterId && <button type="button" onClick={openCreateIssue} className="px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600">Add Issue</button>}
            {canExport && <button type="button" onClick={() => exportRows(rows ?? [], 'internal-external-issues-register')} className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium hover:bg-surface-50">Export CSV</button>}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-surface-300 overflow-auto">
          {rowsError && <p className="p-4 text-sm text-critical">{rowsError.message}</p>}
          {rowsLoading && <p className="p-4 text-sm text-charcoal-500">Loading issues...</p>}
          {!rowsLoading && !rowsError && (
            <table className="w-full min-w-[1900px] text-sm">
              <thead className="bg-surface-50"><tr><th className="px-3 py-2 text-left">Ref #</th><th className="px-3 py-2 text-left">Internal/External</th><th className="px-3 py-2 text-left">Issues Identification</th><th className="px-3 py-2 text-left">Risk/ Opp.</th><th className="px-3 py-2 text-left">L</th><th className="px-3 py-2 text-left">S</th><th className="px-3 py-2 text-left">R</th><th className="px-3 py-2 text-left">Nature</th><th className="px-3 py-2 text-left">Control Measure</th><th className="px-3 py-2 text-left">Responsible person</th><th className="px-3 py-2 text-left">Target date</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-left">Actions</th></tr></thead>
              <tbody className="divide-y divide-surface-100">
                {(rows ?? []).map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-3 py-2 font-semibold text-teal">{row.ref_no}</td><td className="px-3 py-2">{row.scope}</td><td className="px-3 py-2">{row.issue_identification}</td><td className="px-3 py-2">{row.risk_or_opp}</td><td className="px-3 py-2">{row.likelihood}</td><td className="px-3 py-2">{row.severity}</td><td className="px-3 py-2 font-semibold">{row.risk_rating}</td><td className="px-3 py-2"><span className={`inline-flex px-2 py-1 rounded text-xs font-semibold ${natureClass(String(row.nature))}`}>{row.nature}</span></td><td className="px-3 py-2">{row.control_measure || '-'}</td><td className="px-3 py-2">{row.responsible_name_snapshot}</td><td className="px-3 py-2">{formatDate(row.target_date)}</td><td className="px-3 py-2">{row.status}</td>
                    <td className="px-3 py-2"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => openViewIssue(row)} className="px-2 py-1 rounded border border-surface-300 text-xs hover:bg-surface-50">View</button>{canWrite && <button type="button" onClick={() => openEditIssue(row)} className="px-2 py-1 rounded border border-surface-300 text-xs hover:bg-surface-50">Edit</button>}{canApprove && <button type="button" onClick={() => void handleApproveRegister()} className="px-2 py-1 rounded border border-surface-300 text-xs hover:bg-surface-50">Approve</button>}{canExport && <button type="button" onClick={() => exportRows([row], `internal-external-issue-${row.ref_no}`)} className="px-2 py-1 rounded border border-surface-300 text-xs hover:bg-surface-50">Export</button>}</div></td>
                  </tr>
                ))}
                {(rows ?? []).length === 0 && <tr><td colSpan={13} className="px-3 py-6 text-center text-charcoal-500">No issues found for the selected filters.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-5xl bg-white rounded-xl border border-surface-300 overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-200">
              <h2 className="text-lg font-semibold">{formMode === 'create' ? 'Add Issue Row' : formMode === 'edit' ? `Edit Issue #${issueForm.refNo ?? ''}` : `View Issue #${issueForm.refNo ?? ''}`}</h2>
            </div>
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {issueError && <p className="text-sm text-critical">{issueError}</p>}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <SelectOrType label="Internal/External" value={issueForm.scope} options={SCOPE_OPTIONS} onChange={(value) => setIssueForm((prev) => ({ ...prev, scope: value }))} companyId={activeCompanyId ?? undefined} moduleKey="quality" fieldKey="internal_external_scope" createdByUserId={(user?.id as UUID | undefined) ?? undefined} allowCreate={!!activeCompanyId} required disabled={formMode === 'view'} />
                <label className="text-sm md:col-span-2"><span className="block text-xs text-charcoal-500 mb-1">Issues Identification</span><input value={issueForm.issueIdentification} onChange={(e) => setIssueForm((prev) => ({ ...prev, issueIdentification: e.target.value }))} className="w-full px-3 py-2 border border-surface-300 rounded-lg" disabled={formMode === 'view'} required /></label>
                <SelectOrType label="Risk/ Opp." value={issueForm.riskOrOpp} options={RISK_OR_OPP_OPTIONS} onChange={(value) => setIssueForm((prev) => ({ ...prev, riskOrOpp: value }))} companyId={activeCompanyId ?? undefined} moduleKey="quality" fieldKey="internal_external_risk_or_opp" createdByUserId={(user?.id as UUID | undefined) ?? undefined} allowCreate={!!activeCompanyId} required disabled={formMode === 'view'} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">L</span><input type="number" min={1} max={5} value={issueForm.likelihood} onChange={(e) => setIssueForm((prev) => ({ ...prev, likelihood: Number(e.target.value || 1) }))} className="w-full px-3 py-2 border border-surface-300 rounded-lg" disabled={formMode === 'view'} /></label>
                <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">S</span><input type="number" min={1} max={5} value={issueForm.severity} onChange={(e) => setIssueForm((prev) => ({ ...prev, severity: Number(e.target.value || 1) }))} className="w-full px-3 py-2 border border-surface-300 rounded-lg" disabled={formMode === 'view'} /></label>
                <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">R</span><input value={currentRiskRating} readOnly className="w-full px-3 py-2 border border-surface-300 rounded-lg bg-surface-50 font-semibold" /></label>
                <label className="text-sm md:col-span-2"><span className="block text-xs text-charcoal-500 mb-1">Nature</span><SelectOrType value={issueForm.nature} options={NATURE_OPTIONS} onChange={(value) => setIssueForm((prev) => ({ ...prev, nature: value }))} companyId={activeCompanyId ?? undefined} moduleKey="quality" fieldKey="internal_external_nature" createdByUserId={(user?.id as UUID | undefined) ?? undefined} allowCreate={!!activeCompanyId} required disabled={formMode === 'view' || !issueForm.natureOverride} /></label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={issueForm.natureOverride} onChange={(e) => setIssueForm((prev) => ({ ...prev, natureOverride: e.target.checked, nature: e.target.checked ? prev.nature : mapIssueNature(currentRiskRating) }))} disabled={formMode === 'view'} />Override Nature</label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="text-sm md:col-span-2"><span className="block text-xs text-charcoal-500 mb-1">Control Measure</span><textarea value={issueForm.controlMeasure} onChange={(e) => setIssueForm((prev) => ({ ...prev, controlMeasure: e.target.value }))} rows={3} className="w-full px-3 py-2 border border-surface-300 rounded-lg" disabled={formMode === 'view'} /></label>
                <div className="space-y-2">
                  <label className="text-sm block"><span className="block text-xs text-charcoal-500 mb-1">Responsible person</span><select value={issueForm.responsibleUserId} onChange={(e) => {
                    const value = (e.target.value || '') as UUID | '';
                    setIssueForm((prev) => ({ ...prev, responsibleUserId: value, responsibleNameSnapshot: value ? userLabel.get(value) ?? prev.responsibleNameSnapshot : prev.responsibleNameSnapshot }));
                  }} className="w-full px-3 py-2 border border-surface-300 rounded-lg" disabled={formMode === 'view'}><option value="">Other / Type manually</option>{(profiles ?? []).map((profile) => <option key={profile.user_id} value={profile.user_id}>{profile.full_name || profile.email || profile.user_id}</option>)}</select></label>
                  <input value={issueForm.responsibleNameSnapshot} onChange={(e) => setIssueForm((prev) => ({ ...prev, responsibleNameSnapshot: e.target.value }))} placeholder="Responsible name (manual)" className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm" disabled={formMode === 'view' || !!issueForm.responsibleUserId} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Target date</span><input type="date" value={issueForm.targetDate} onChange={(e) => setIssueForm((prev) => ({ ...prev, targetDate: e.target.value }))} className="w-full px-3 py-2 border border-surface-300 rounded-lg" disabled={formMode === 'view'} /></label>
                <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Status</span><select value={issueForm.status} onChange={(e) => setIssueForm((prev) => ({ ...prev, status: e.target.value as InternalExternalIssueStatus }))} className="w-full px-3 py-2 border border-surface-300 rounded-lg" disabled={formMode === 'view'}>{IE_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
                <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Closure date</span><input type="date" value={issueForm.closureDate} onChange={(e) => setIssueForm((prev) => ({ ...prev, closureDate: e.target.value }))} className="w-full px-3 py-2 border border-surface-300 rounded-lg" disabled={formMode === 'view' || issueForm.status !== 'Closed'} /></label>
                <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Closure evidence file IDs</span><input value={issueForm.closureEvidence} onChange={(e) => setIssueForm((prev) => ({ ...prev, closureEvidence: e.target.value }))} placeholder="uuid1, uuid2" className="w-full px-3 py-2 border border-surface-300 rounded-lg" disabled={formMode === 'view' || issueForm.status !== 'Closed'} /></label>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-surface-200 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium">Close</button>
              {formMode !== 'view' && canWrite && <button type="button" onClick={() => void handleSaveIssue()} disabled={issueSaving} className="px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-70">{issueSaving ? 'Saving...' : 'Save'}</button>}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
