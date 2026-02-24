import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useUser } from '@insforge/react';
import { Layout } from '../components/layout/Layout';
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import { SelectOrType } from '../components/ui/SelectOrType';
import { EvidenceModal } from '../components/evidence/EvidenceModal';
import { listUserProfiles } from '../api/services/profilesService';
import { listDepartments } from '../api/services/departmentsService';
import { listSites } from '../api/services/sitesService';
import { listEvidence } from '../api/services/evidenceService';
import type {
  ImprovementClosureStatus,
  ImprovementSourceType,
  ImprovementType,
  ImprovementVerificationMethod,
  ImprovementWorkflowStatus,
  UUID
} from '../api/models/entities';
import {
  addImprovementComment,
  createImprovement,
  getImprovement,
  IMPROVEMENT_SOURCE_LABELS,
  IMPROVEMENT_STATUS_LABELS,
  IMPROVEMENT_TYPE_LABELS,
  IMPROVEMENT_VERIFICATION_METHOD_LABELS,
  listImprovementComments,
  updateImprovement
} from '../api/services/improvementService';

type FormState = {
  dateRaised: string;
  raisedByUserId: string;
  departmentSite: string;
  improvementType: ImprovementType;
  improvementTypeOtherText: string;
  description: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  actionRequired: string;
  responsibleUserId: string;
  resourcesNeeded: string;
  targetDate: string;
  status: ImprovementWorkflowStatus;
  verificationMethods: ImprovementVerificationMethod[];
  verificationMethodOtherText: string;
  verifiedByUserId: string;
  dateVerified: string;
  wasActionEffective: '' | 'yes' | 'no';
  managementReviewedByUserId: string;
  managementReviewDate: string;
  managementRecommendations: string;
  managementDecision: '' | 'approve' | 'monitor' | 'escalate' | 'rework';
  closedByUserId: string;
  closureDate: string;
  closureStatus: '' | ImprovementClosureStatus;
  lessonsLearned: string;
  sourceType: ImprovementSourceType;
  sourceId: string;
  sourceOtherText: string;
};

const VERIFICATION_METHODS = Object.keys(IMPROVEMENT_VERIFICATION_METHOD_LABELS) as ImprovementVerificationMethod[];

function canEdit(role: string | null): boolean {
  return role === 'owner' || role === 'admin' || role === 'manager' || role === 'supervisor';
}

function toDate(v: string | null): string {
  return v ? new Date(v).toISOString().slice(0, 10) : '';
}

function defaultForm(userId: string, sourceType: ImprovementSourceType | null, sourceId: string | null): FormState {
  return {
    dateRaised: new Date().toISOString().slice(0, 10),
    raisedByUserId: userId,
    departmentSite: '',
    improvementType: 'process_improvement',
    improvementTypeOtherText: '',
    description: '',
    riskLevel: 'medium',
    actionRequired: '',
    responsibleUserId: '',
    resourcesNeeded: '',
    targetDate: '',
    status: 'open',
    verificationMethods: [],
    verificationMethodOtherText: '',
    verifiedByUserId: '',
    dateVerified: '',
    wasActionEffective: '',
    managementReviewedByUserId: '',
    managementReviewDate: '',
    managementRecommendations: '',
    managementDecision: '',
    closedByUserId: '',
    closureDate: '',
    closureStatus: '',
    lessonsLearned: '',
    sourceType: sourceType ?? 'other',
    sourceId: sourceId ?? '',
    sourceOtherText: ''
  };
}

export function ImprovementDetailPage() {
  const { improvementId } = useParams();
  const [query, setQuery] = useSearchParams();
  const isCreate = !improvementId || improvementId === 'new';
  const navigate = useNavigate();
  const { user } = useUser();
  const { activeCompanyId, activeRole } = useTenant();
  const editable = canEdit(activeRole ?? null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const sourceType = (query.get('sourceType') as ImprovementSourceType | null) || null;
  const sourceId = query.get('sourceId');
  const quickComment = query.get('comment');
  const [form, setForm] = useState<FormState>(() => defaultForm(user?.id ?? '', sourceType, sourceId));

  const { data: profiles } = useAsync(async () => (activeCompanyId ? listUserProfiles(activeCompanyId) : []), [activeCompanyId]);
  const { data: departments } = useAsync(async () => (activeCompanyId ? listDepartments(activeCompanyId) : []), [activeCompanyId]);
  const { data: sites } = useAsync(async () => (activeCompanyId ? listSites(activeCompanyId) : []), [activeCompanyId]);
  const { data: record, refresh } = useAsync(async () => (activeCompanyId && !isCreate && improvementId ? getImprovement(activeCompanyId, improvementId as UUID) : null), [activeCompanyId, isCreate, improvementId]);
  const { data: comments, refresh: refreshComments } = useAsync(async () => (activeCompanyId && !isCreate && improvementId ? listImprovementComments(activeCompanyId, improvementId as UUID) : []), [activeCompanyId, isCreate, improvementId]);
  const { data: evidence } = useAsync(async () => (activeCompanyId && !isCreate && improvementId ? listEvidence(activeCompanyId, { entityType: 'improvement', entityId: improvementId as UUID }) : []), [activeCompanyId, isCreate, improvementId, evidenceOpen]);

  useEffect(() => {
    if (!record) return;
    setForm({
      dateRaised: toDate(record.date_raised),
      raisedByUserId: record.raised_by_user_id,
      departmentSite: record.department_site || '',
      improvementType: record.improvement_type,
      improvementTypeOtherText: record.improvement_type_other_text || '',
      description: record.description || '',
      riskLevel: record.risk_level,
      actionRequired: record.action_required || '',
      responsibleUserId: record.responsible_user_id || '',
      resourcesNeeded: record.resources_needed || '',
      targetDate: record.target_date ? String(record.target_date).slice(0, 10) : '',
      status: record.status,
      verificationMethods: record.verification_methods || [],
      verificationMethodOtherText: record.verification_method_other_text || '',
      verifiedByUserId: record.verified_by_user_id || '',
      dateVerified: toDate(record.date_verified),
      wasActionEffective: record.was_action_effective == null ? '' : record.was_action_effective ? 'yes' : 'no',
      managementReviewedByUserId: record.management_reviewed_by_user_id || '',
      managementReviewDate: toDate(record.management_review_date),
      managementRecommendations: record.management_recommendations || '',
      managementDecision: (record.management_decision as any) || '',
      closedByUserId: record.closed_by_user_id || '',
      closureDate: toDate(record.closure_date),
      closureStatus: (record.closure_status as any) || '',
      lessonsLearned: record.lessons_learned || '',
      sourceType: record.source_type,
      sourceId: record.source_id || '',
      sourceOtherText: record.source_other_text || ''
    });
  }, [record]);

  useEffect(() => {
    if (!quickComment || !activeCompanyId || !improvementId || !user?.id || isCreate) return;
    void addImprovementComment({ companyId: activeCompanyId, improvementId: improvementId as UUID, userId: user.id as UUID, message: quickComment }).finally(() => {
      setQuery((prev) => {
        prev.delete('comment');
        return prev;
      });
      void refreshComments();
    });
  }, [activeCompanyId, improvementId, isCreate, quickComment, refreshComments, setQuery, user?.id]);

  const userOptions = profiles ?? [];
  const deptOptions = useMemo(() => {
    const vals = [...(departments ?? []).map((d) => d.name), ...(sites ?? []).map((s) => s.name)];
    return [...new Set(vals)].map((v) => ({ id: v, value: v, label: v }));
  }, [departments, sites]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((p) => ({ ...p, [key]: value }));

  async function save() {
    if (!activeCompanyId || !user?.id) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        dateRaised: form.dateRaised ? new Date(form.dateRaised).toISOString() : undefined,
        raisedByUserId: (form.raisedByUserId || user.id) as UUID,
        departmentSite: form.departmentSite || null,
        improvementType: form.improvementType,
        improvementTypeOtherText: form.improvementTypeOtherText || null,
        description: form.description || null,
        riskLevel: form.riskLevel,
        actionRequired: form.actionRequired || null,
        responsibleUserId: (form.responsibleUserId || null) as UUID | null,
        resourcesNeeded: form.resourcesNeeded || null,
        targetDate: form.targetDate || null,
        status: form.status,
        verificationMethods: form.verificationMethods,
        verificationMethodOtherText: form.verificationMethodOtherText || null,
        verifiedByUserId: (form.verifiedByUserId || null) as UUID | null,
        dateVerified: form.dateVerified || null,
        wasActionEffective: form.wasActionEffective === '' ? null : form.wasActionEffective === 'yes',
        managementReviewedByUserId: (form.managementReviewedByUserId || null) as UUID | null,
        managementReviewDate: form.managementReviewDate || null,
        managementRecommendations: form.managementRecommendations || null,
        managementDecision: (form.managementDecision || null) as any,
        closedByUserId: (form.closedByUserId || null) as UUID | null,
        closureDate: form.closureDate || null,
        closureStatus: (form.closureStatus || null) as any,
        lessonsLearned: form.lessonsLearned || null,
        sourceType: form.sourceType,
        sourceId: (form.sourceId || null) as UUID | null,
        sourceOtherText: form.sourceOtherText || null
      };
      if (isCreate) {
        const created = await createImprovement({
          companyId: activeCompanyId,
          actorUserId: user.id as UUID,
          actorRole: activeRole ?? null,
          ...payload
        });
        navigate(`/improvement/${created.id}`);
      } else if (improvementId) {
        await updateImprovement({
          companyId: activeCompanyId,
          improvementId: improvementId as UUID,
          actorUserId: user.id as UUID,
          actorRole: activeRole ?? null,
          patch: {
            date_raised: payload.dateRaised,
            raised_by_user_id: payload.raisedByUserId,
            department_site: payload.departmentSite,
            improvement_type: payload.improvementType,
            improvement_type_other_text: payload.improvementTypeOtherText,
            description: payload.description,
            risk_level: payload.riskLevel,
            action_required: payload.actionRequired,
            responsible_user_id: payload.responsibleUserId,
            resources_needed: payload.resourcesNeeded,
            target_date: payload.targetDate,
            status: payload.status,
            verification_methods: payload.verificationMethods,
            verification_method_other_text: payload.verificationMethodOtherText,
            verified_by_user_id: payload.verifiedByUserId,
            date_verified: payload.dateVerified,
            was_action_effective: payload.wasActionEffective,
            management_reviewed_by_user_id: payload.managementReviewedByUserId,
            management_review_date: payload.managementReviewDate,
            management_recommendations: payload.managementRecommendations,
            management_decision: payload.managementDecision,
            closed_by_user_id: payload.closedByUserId,
            closure_date: payload.closureDate,
            closure_status: payload.closureStatus,
            lessons_learned: payload.lessonsLearned,
            source_type: payload.sourceType,
            source_id: payload.sourceId,
            source_other_text: payload.sourceOtherText,
            evidence_file_ids: (evidence ?? []).map((e) => e.id) as UUID[]
          }
        });
        await refresh();
      }
    } catch (e: any) {
      setError(e?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function postComment() {
    if (!activeCompanyId || !improvementId || !user?.id || !newComment.trim()) return;
    await addImprovementComment({ companyId: activeCompanyId, improvementId: improvementId as UUID, userId: user.id as UUID, message: newComment.trim() });
    setNewComment('');
    await refreshComments();
  }

  return (
    <Layout title={isCreate ? 'Create Improvement' : 'Improvement Detail'}>
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-surface-300 p-4 flex justify-between">
          <div>
            <Link to="/improvement" className="text-sm text-teal hover:underline">Back to register</Link>
            <p className="text-lg font-semibold">{record?.reference_number || 'New Improvement'}</p>
          </div>
          <button type="button" onClick={() => void save()} disabled={saving || (!isCreate && !editable)} className="px-4 py-2 rounded-lg bg-success text-white text-sm font-semibold disabled:opacity-60">{saving ? 'Saving...' : isCreate ? 'Create' : 'Save'}</button>
        </div>
        {error && <div className="bg-critical/5 border border-critical/30 rounded-xl p-3 text-sm text-critical">{error}</div>}

        <section className="bg-white rounded-xl border border-surface-300 p-4 space-y-3">
          <h3 className="font-semibold">SECTION 1: GENERAL INFORMATION</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input value={record?.reference_number || '(Auto)'} disabled className="px-3 py-2 border border-surface-300 rounded-lg bg-surface-50" />
            <input type="date" value={form.dateRaised} onChange={(e) => setField('dateRaised', e.target.value)} className="px-3 py-2 border border-surface-300 rounded-lg" />
            <select value={form.raisedByUserId} onChange={(e) => setField('raisedByUserId', e.target.value)} className="px-3 py-2 border border-surface-300 rounded-lg">{userOptions.map((u) => <option key={u.user_id} value={u.user_id}>{u.full_name || u.email || u.user_id.slice(0, 8)}</option>)}</select>
          </div>
          <SelectOrType value={form.departmentSite} onChange={(v) => setField('departmentSite', v)} options={deptOptions} label="Department/Site" allowCreate companyId={activeCompanyId} moduleKey="improvement" fieldKey="department_site" createdByUserId={user?.id ?? null} />
          <select value={form.improvementType} onChange={(e) => setField('improvementType', e.target.value as ImprovementType)} className="px-3 py-2 border border-surface-300 rounded-lg w-full">{(Object.keys(IMPROVEMENT_TYPE_LABELS) as ImprovementType[]).map((t) => <option key={t} value={t}>{IMPROVEMENT_TYPE_LABELS[t]}</option>)}</select>
          {form.improvementType === 'other' && <input value={form.improvementTypeOtherText} onChange={(e) => setField('improvementTypeOtherText', e.target.value)} className="px-3 py-2 border border-surface-300 rounded-lg w-full" placeholder="Other type" />}
        </section>

        <section className="bg-white rounded-xl border border-surface-300 p-4 space-y-3"><h3 className="font-semibold">SECTION 2: DESCRIPTION</h3><textarea rows={4} value={form.description} onChange={(e) => setField('description', e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg" />{!isCreate && <button type="button" onClick={() => setEvidenceOpen(true)} className="px-3 py-2 rounded-lg border border-surface-300 text-sm">Manage Attachments ({(evidence ?? []).length})</button>}</section>
        <section className="bg-white rounded-xl border border-surface-300 p-4"><h3 className="font-semibold">SECTION 3: IMMEDIATE RISK LEVEL</h3><select value={form.riskLevel} onChange={(e) => setField('riskLevel', e.target.value as any)} className="mt-2 px-3 py-2 border border-surface-300 rounded-lg"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></section>
        <section className="bg-white rounded-xl border border-surface-300 p-4 space-y-2"><h3 className="font-semibold">SECTION 4: IMPROVEMENT ACTION PLAN</h3><textarea rows={3} value={form.actionRequired} onChange={(e) => setField('actionRequired', e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg" placeholder="Action required" /><select value={form.responsibleUserId} onChange={(e) => setField('responsibleUserId', e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg"><option value="">Responsible person</option>{userOptions.map((u) => <option key={u.user_id} value={u.user_id}>{u.full_name || u.email || u.user_id.slice(0, 8)}</option>)}</select><textarea rows={2} value={form.resourcesNeeded} onChange={(e) => setField('resourcesNeeded', e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg" placeholder="Resources needed" /><input type="date" value={form.targetDate} onChange={(e) => setField('targetDate', e.target.value)} className="px-3 py-2 border border-surface-300 rounded-lg" /><select value={form.status} onChange={(e) => setField('status', e.target.value as ImprovementWorkflowStatus)} className="px-3 py-2 border border-surface-300 rounded-lg">{(Object.keys(IMPROVEMENT_STATUS_LABELS) as ImprovementWorkflowStatus[]).map((s) => <option key={s} value={s}>{IMPROVEMENT_STATUS_LABELS[s]}</option>)}</select></section>
        <section className="bg-white rounded-xl border border-surface-300 p-4 space-y-2"><h3 className="font-semibold">SECTION 5: VERIFICATION</h3><div className="grid grid-cols-2 gap-2">{VERIFICATION_METHODS.map((m) => <label key={m} className="text-xs"><input type="checkbox" checked={form.verificationMethods.includes(m)} onChange={(e) => setField('verificationMethods', e.target.checked ? [...form.verificationMethods, m] : form.verificationMethods.filter((x) => x !== m))} /> {IMPROVEMENT_VERIFICATION_METHOD_LABELS[m]}</label>)}</div>{form.verificationMethods.includes('other') && <input value={form.verificationMethodOtherText} onChange={(e) => setField('verificationMethodOtherText', e.target.value)} className="px-3 py-2 border border-surface-300 rounded-lg w-full" placeholder="Other verification method" />}<select value={form.verifiedByUserId} onChange={(e) => setField('verifiedByUserId', e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg"><option value="">Confirmed by</option>{userOptions.map((u) => <option key={u.user_id} value={u.user_id}>{u.full_name || u.email || u.user_id.slice(0, 8)}</option>)}</select><input type="date" value={form.dateVerified} onChange={(e) => setField('dateVerified', e.target.value)} className="px-3 py-2 border border-surface-300 rounded-lg" /><select value={form.wasActionEffective} onChange={(e) => setField('wasActionEffective', e.target.value as any)} className="px-3 py-2 border border-surface-300 rounded-lg"><option value="">Action effective?</option><option value="yes">Yes</option><option value="no">No</option></select></section>
        <section className="bg-white rounded-xl border border-surface-300 p-4 space-y-2"><h3 className="font-semibold">SECTION 6: COMMENTS</h3><div className="space-y-1 max-h-36 overflow-auto">{(comments ?? []).map((c) => <div key={c.id} className="text-sm border border-surface-200 rounded p-2"><p className="text-xs text-charcoal-500">{new Date(c.created_at).toLocaleString('en-ZA')}</p>{c.message}</div>)}</div>{!isCreate && <><textarea rows={2} value={newComment} onChange={(e) => setNewComment(e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg" /><button type="button" onClick={() => void postComment()} className="px-3 py-2 rounded-lg border border-surface-300 text-sm">Add Comment</button></>}</section>
        <section className="bg-white rounded-xl border border-surface-300 p-4 space-y-2"><h3 className="font-semibold">SECTION 7: MANAGEMENT REVIEW</h3><select value={form.managementReviewedByUserId} onChange={(e) => setField('managementReviewedByUserId', e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg"><option value="">Reviewed by</option>{userOptions.map((u) => <option key={u.user_id} value={u.user_id}>{u.full_name || u.email || u.user_id.slice(0, 8)}</option>)}</select><input type="date" value={form.managementReviewDate} onChange={(e) => setField('managementReviewDate', e.target.value)} className="px-3 py-2 border border-surface-300 rounded-lg" /><textarea rows={3} value={form.managementRecommendations} onChange={(e) => setField('managementRecommendations', e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg" placeholder="Recommendations" /><select value={form.managementDecision} onChange={(e) => setField('managementDecision', e.target.value as any)} className="px-3 py-2 border border-surface-300 rounded-lg"><option value="">Decision</option><option value="approve">Approve</option><option value="monitor">Monitor</option><option value="escalate">Escalate</option><option value="rework">Rework</option></select></section>
        <section className="bg-white rounded-xl border border-surface-300 p-4 space-y-2"><h3 className="font-semibold">SECTION 8: CLOSURE</h3><select value={form.closedByUserId} onChange={(e) => setField('closedByUserId', e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg"><option value="">Closed by</option>{userOptions.map((u) => <option key={u.user_id} value={u.user_id}>{u.full_name || u.email || u.user_id.slice(0, 8)}</option>)}</select><input type="date" value={form.closureDate} onChange={(e) => setField('closureDate', e.target.value)} className="px-3 py-2 border border-surface-300 rounded-lg" /><select value={form.closureStatus} onChange={(e) => setField('closureStatus', e.target.value as any)} className="px-3 py-2 border border-surface-300 rounded-lg"><option value="">Closure Status</option><option value="closed">Closed</option><option value="monitoring_required">Monitoring Required</option><option value="escalated">Escalated</option></select></section>
        <section className="bg-white rounded-xl border border-surface-300 p-4"><h3 className="font-semibold">LESSONS LEARNED</h3><textarea rows={3} value={form.lessonsLearned} onChange={(e) => setField('lessonsLearned', e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg" placeholder="What can be improved in future to prevent recurrence?" /></section>
        <section className="bg-white rounded-xl border border-surface-300 p-4 space-y-2"><h3 className="font-semibold">Linked Source</h3><select value={form.sourceType} onChange={(e) => setField('sourceType', e.target.value as ImprovementSourceType)} className="px-3 py-2 border border-surface-300 rounded-lg">{(Object.keys(IMPROVEMENT_SOURCE_LABELS) as ImprovementSourceType[]).map((s) => <option key={s} value={s}>{IMPROVEMENT_SOURCE_LABELS[s]}</option>)}</select><input value={form.sourceId} onChange={(e) => setField('sourceId', e.target.value)} className="px-3 py-2 border border-surface-300 rounded-lg" placeholder="Source ID" />{form.sourceType === 'other' && <input value={form.sourceOtherText} onChange={(e) => setField('sourceOtherText', e.target.value)} className="px-3 py-2 border border-surface-300 rounded-lg" placeholder="Other source text" />}</section>
      </div>
      {!isCreate && activeCompanyId && improvementId && user?.id && <EvidenceModal open={evidenceOpen} onClose={() => setEvidenceOpen(false)} companyId={activeCompanyId} actorUserId={user.id as UUID} entityType="improvement" entityId={improvementId as UUID} title="Improvement Attachments" />}
    </Layout>
  );
}
