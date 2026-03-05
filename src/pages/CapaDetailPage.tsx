import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useUser } from '@insforge/react';
import { Layout } from '../components/layout/Layout';
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import { SelectOrType } from '../components/ui/SelectOrType';
import { EvidenceModal } from '../components/evidence/EvidenceModal';
import { listUserProfiles } from '../api/services/profilesService';
import type { OptionItem } from '../api/services/dynamicOptionsService';
import type { UUID } from '../api/models/entities';
import {
  closeCorrectiveAction,
  createCorrectiveAction,
  getCorrectiveAction,
  updateCorrectiveAction
} from '../api/services/correctiveActionsService';

type CapaSourceType = 'ncr' | 'risk_assessment' | 'incident' | 'audit' | 'observation' | 'complaint' | 'pjo' | 'kpi' | 'audit_finding';

type FormState = {
  title: string;
  description: string;
  actionType: 'corrective' | 'preventive';
  sourceType: CapaSourceType;
  sourceId: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignedToUserId: string;
  dueDate: string;
  rootCause: string;
  proposedSolution: string;
  evidenceUrl: string;
  managerSignoffUserId: string;
};

const SOURCE_OPTIONS: OptionItem[] = [
  { id: 'ncr', value: 'ncr', label: 'NCR' },
  { id: 'audit', value: 'audit', label: 'Audit' },
  { id: 'audit_finding', value: 'audit_finding', label: 'Audit finding' },
  { id: 'incident', value: 'incident', label: 'Incident' },
  { id: 'risk_assessment', value: 'risk_assessment', label: 'Risk assessment' },
  { id: 'complaint', value: 'complaint', label: 'Complaint' },
  { id: 'pjo', value: 'pjo', label: 'PJO' },
  { id: 'kpi', value: 'kpi', label: 'KPI' },
  { id: 'observation', value: 'observation', label: 'Observation' }
];

const PRIORITY_OPTIONS: OptionItem[] = [
  { id: 'low', value: 'low', label: 'Low' },
  { id: 'medium', value: 'medium', label: 'Medium' },
  { id: 'high', value: 'high', label: 'High' },
  { id: 'urgent', value: 'urgent', label: 'Urgent' }
];

function canManage(role: string | null): boolean {
  return role === 'owner' || role === 'admin' || role === 'manager' || role === 'supervisor' || role === 'consultant';
}

export function CapaDetailPage() {
  const { capaId } = useParams();
  const isCreate = !capaId || capaId === 'new';
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useUser();
  const { activeCompanyId, activeRole } = useTenant();
  const editable = canManage(activeRole ?? null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  const [form, setForm] = useState<FormState>({
    title: searchParams.get('title') ?? '',
    description: searchParams.get('description') ?? '',
    actionType: 'corrective',
    sourceType: ((searchParams.get('sourceType') ?? 'ncr') as CapaSourceType),
    sourceId: searchParams.get('sourceId') ?? '',
    priority: 'medium',
    assignedToUserId: '',
    dueDate: searchParams.get('dueDate') ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    rootCause: '',
    proposedSolution: '',
    evidenceUrl: '',
    managerSignoffUserId: ''
  });

  const { data: users } = useAsync(
    async () => (activeCompanyId ? listUserProfiles(activeCompanyId) : []),
    [activeCompanyId]
  );

  const { data: record, refresh } = useAsync(
    async () => {
      if (!activeCompanyId || isCreate || !capaId) return null;
      return await getCorrectiveAction(capaId as UUID, activeCompanyId);
    },
    [activeCompanyId, isCreate, capaId]
  );

  const { data: evidence } = useAsync(
    async () => {
      if (!activeCompanyId || isCreate || !capaId) return [];
      const { listEvidence } = await import('../api/services/evidenceService');
      return await listEvidence(activeCompanyId, { entityType: 'corrective_action', entityId: capaId as UUID, limit: 50 });
    },
    [activeCompanyId, isCreate, capaId, evidenceOpen]
  );

  useEffect(() => {
    if (!record) return;
    setForm({
      title: record.title ?? '',
      description: record.description ?? '',
      actionType: record.action_type ?? 'corrective',
      sourceType: (record.source_type as CapaSourceType) ?? 'ncr',
      sourceId: record.source_id ?? '',
      priority: record.priority ?? 'medium',
      assignedToUserId: record.assigned_to_user_id ?? '',
      dueDate: record.due_date ?? '',
      rootCause: record.root_cause ?? '',
      proposedSolution: record.proposed_solution ?? '',
      evidenceUrl: record.evidence_url ?? '',
      managerSignoffUserId: record.verified_by_user_id ?? ''
    });
  }, [record]);

  const canClose = Boolean(record && record.status !== 'closed' && editable && activeCompanyId && user?.id);
  const evidenceCount = evidence?.length ?? 0;

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSave() {
    if (!activeCompanyId || !user?.id || !editable) return;
    setError(null);
    setSuccess(null);
    if (!form.title.trim()) {
      setError('CAPA title is required.');
      return;
    }
    if (!form.sourceId.trim()) {
      setError('Source reference ID is required.');
      return;
    }
    if (!form.dueDate) {
      setError('Target date is required.');
      return;
    }

    setSaving(true);
    try {
      if (isCreate) {
        const created = await createCorrectiveAction({
          companyId: activeCompanyId,
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          actionType: form.actionType,
          sourceType: form.sourceType,
          sourceId: form.sourceId.trim() as UUID,
          priority: form.priority,
          dueDate: form.dueDate,
          assignedToUserId: (form.assignedToUserId || undefined) as UUID | undefined,
          rootCause: form.rootCause.trim() || undefined,
          proposedSolution: form.proposedSolution.trim() || undefined,
          createdByUserId: user.id as UUID
        });
        navigate(`/dashboard/management/capa/${created.id}`, { replace: true });
        return;
      }

      if (!capaId) return;
      await updateCorrectiveAction({
        actionId: capaId as UUID,
        companyId: activeCompanyId,
        status: record?.status,
        priority: form.priority,
        assignedToUserId: (form.assignedToUserId || null) as UUID | null,
        description: form.description || '',
        rootCause: form.rootCause || '',
        proposedSolution: form.proposedSolution || '',
        evidenceUrl: form.evidenceUrl || '',
        verifiedByUserId: (form.managerSignoffUserId || null) as UUID | null,
        verifiedDate: form.managerSignoffUserId ? new Date().toISOString().slice(0, 10) : null,
        updatedByUserId: user.id as UUID
      });
      await refresh();
      setSuccess('CAPA saved successfully.');
    } catch (e: any) {
      setError(e?.message ?? 'Failed to save CAPA.');
    } finally {
      setSaving(false);
    }
  }

  async function onCloseCapa() {
    if (!activeCompanyId || !user?.id || !capaId) return;
    setError(null);
    setSuccess(null);
    try {
      await closeCorrectiveAction(capaId as UUID, activeCompanyId, user.id as UUID);
      await refresh();
      setSuccess('CAPA closed successfully.');
    } catch (e: any) {
      setError(e?.message ?? 'Failed to close CAPA.');
    }
  }

  return (
    <Layout title={isCreate ? 'Create CAPA' : 'CAPA Detail'}>
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-surface-300 p-4 flex flex-wrap justify-between gap-3">
          <div>
            <Link to="/dashboard/management/tasks?view=capa" className="text-sm text-teal hover:underline">Back to CAPA</Link>
            <p className="text-lg font-semibold mt-1">{isCreate ? 'New CAPA' : `CAPA ${record?.action_number ?? capaId?.slice(0, 8)}`}</p>
          </div>
          <div className="flex items-center gap-2">
            {!isCreate && activeCompanyId && capaId && user?.id && (
              <button type="button" onClick={() => setEvidenceOpen(true)} className="px-3 py-2 rounded-lg border border-surface-300 text-sm">
                Evidence ({evidenceCount})
              </button>
            )}
            <button type="button" onClick={() => void onSave()} disabled={!editable || saving} className="px-4 py-2 rounded-lg bg-success text-white text-sm font-semibold disabled:opacity-60">
              {saving ? 'Saving...' : isCreate ? 'Create' : 'Save'}
            </button>
            {!isCreate && (
              <button type="button" onClick={() => void onCloseCapa()} disabled={!canClose} className="px-4 py-2 rounded-lg bg-navy text-white text-sm font-semibold disabled:opacity-60">
                Close
              </button>
            )}
          </div>
        </div>

        {error && <div className="bg-critical/5 border border-critical/30 rounded-xl p-3 text-sm text-critical">{error}</div>}
        {success && <div className="bg-success/5 border border-success/30 rounded-xl p-3 text-sm text-success">{success}</div>}

        <section className="bg-white rounded-xl border border-surface-300 p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-charcoal mb-1.5">CAPA title *</label>
            <input value={form.title} onChange={(e) => setField('title', e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Action type</label>
            <select value={form.actionType} onChange={(e) => setField('actionType', e.target.value as 'corrective' | 'preventive')} className="w-full px-3 py-2 border border-surface-300 rounded-lg">
              <option value="corrective">Corrective</option>
              <option value="preventive">Preventive</option>
            </select>
          </div>
          <div>
            <SelectOrType
              value={form.priority}
              onChange={(value) => setField('priority', (value || 'medium') as FormState['priority'])}
              options={PRIORITY_OPTIONS}
              label="Priority"
              placeholder="Select priority"
              allowCreate
              companyId={activeCompanyId ?? undefined}
              moduleKey="quality"
              fieldKey="capa_priority"
              createdByUserId={user?.id ?? null}
            />
          </div>
          <div>
            <SelectOrType
              value={form.sourceType}
              onChange={(value) => setField('sourceType', (value || 'ncr') as CapaSourceType)}
              options={SOURCE_OPTIONS}
              label="Source"
              placeholder="Select source"
              allowCreate
              companyId={activeCompanyId ?? undefined}
              moduleKey="quality"
              fieldKey="capa_source_type"
              createdByUserId={user?.id ?? null}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Source reference ID *</label>
            <input value={form.sourceId} onChange={(e) => setField('sourceId', e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Responsible person</label>
            <select value={form.assignedToUserId} onChange={(e) => setField('assignedToUserId', e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg">
              <option value="">Unassigned</option>
              {(users ?? []).map((u) => <option key={u.user_id} value={u.user_id}>{u.full_name || u.email || u.user_id.slice(0, 8)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Target date *</label>
            <input type="date" value={form.dueDate} onChange={(e) => setField('dueDate', e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Manager sign-off</label>
            <select value={form.managerSignoffUserId} onChange={(e) => setField('managerSignoffUserId', e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg">
              <option value="">Not signed</option>
              {(users ?? []).map((u) => <option key={u.user_id} value={u.user_id}>{u.full_name || u.email || u.user_id.slice(0, 8)}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-charcoal mb-1.5">Description</label>
            <textarea rows={3} value={form.description} onChange={(e) => setField('description', e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-charcoal mb-1.5">Root cause</label>
            <textarea rows={3} value={form.rootCause} onChange={(e) => setField('rootCause', e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-charcoal mb-1.5">Corrective / preventive action</label>
            <textarea rows={3} value={form.proposedSolution} onChange={(e) => setField('proposedSolution', e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-charcoal mb-1.5">Evidence URL (optional)</label>
            <input value={form.evidenceUrl} onChange={(e) => setField('evidenceUrl', e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg" />
          </div>
          {!isCreate && (
            <div className="md:col-span-2 text-sm text-charcoal-600">
              Status: <span className="font-semibold">{record?.status ?? '-'}</span>
            </div>
          )}
        </section>
      </div>

      {!isCreate && activeCompanyId && capaId && user?.id && (
        <EvidenceModal
          open={evidenceOpen}
          onClose={() => setEvidenceOpen(false)}
          companyId={activeCompanyId}
          actorUserId={user.id as UUID}
          entityType="corrective_action"
          entityId={capaId as UUID}
          title="CAPA Evidence"
        />
      )}
    </Layout>
  );
}
