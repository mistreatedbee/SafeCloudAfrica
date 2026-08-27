import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { PlusIcon, PencilIcon, TrashIcon, DownloadIcon, ChevronDownIcon, ChevronUpIcon, PaperclipIcon } from 'lucide-react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import {
  listOperationalInputsMonthly,
  upsertOperationalInputsMonthly
} from '../../api/services/operationalInputsService';
import {
  listOperationalInputRecords,
  createOperationalInputRecord,
  updateOperationalInputRecord,
  deleteOperationalInputRecord,
  type OperationalInputRecord
} from '../../api/services/operationalInputRecordsService';
import type { OperationalInputsMonthly } from '../../api/models/entities';
import type { UUID } from '../../api/models/core';
import {
  OPERATIONAL_AREAS,
  OPERATIONAL_AREA_LABELS,
  OPERATIONAL_PRIORITIES,
  OPERATIONAL_PRIORITY_LABELS,
  OPERATIONAL_STATUSES,
  OPERATIONAL_STATUS_LABELS,
  type OperationalArea,
  type OperationalPriority,
  type OperationalRecordStatus
} from '../../api/constants/operationalInputs';
import { listUserProfiles } from '../../api/services/profilesService';
import { uploadFile } from '../../api/services/storageService';
import { createEvidence } from '../../api/services/evidenceService';
import { EVIDENCE_BUCKET } from '../../components/evidence/EvidenceModal';
import { MANAGEMENT_ROLES } from '../../constants/roles';
import { toCsv, downloadTextFile } from '../../utils/csv';
import { toUserFacingError } from '../../utils/userFacingMessage';

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type RecordFormState = {
  recordDate: string;
  area: OperationalArea | '';
  operationalOutput: string;
  planned: string;
  done: string;
  findingsChallenges: string;
  actionRequired: string;
  resourcesNeeded: string;
  priority: OperationalPriority;
  startDate: string;
  endDate: string;
  status: OperationalRecordStatus;
  responsiblePersonUserId: string;
  responsiblePersonName: string;
  completionDate: string;
  objectiveAchieved: '' | 'yes' | 'no';
  objectiveAchievedComments: string;
};

function emptyFormState(): RecordFormState {
  return {
    recordDate: new Date().toISOString().slice(0, 10),
    area: '',
    operationalOutput: '',
    planned: '',
    done: '',
    findingsChallenges: '',
    actionRequired: '',
    resourcesNeeded: '',
    priority: 'medium',
    startDate: '',
    endDate: '',
    status: 'not_started',
    responsiblePersonUserId: '',
    responsiblePersonName: '',
    completionDate: '',
    objectiveAchieved: '',
    objectiveAchievedComments: ''
  };
}

function formFromRecord(record: OperationalInputRecord): RecordFormState {
  return {
    recordDate: record.record_date,
    area: record.area,
    operationalOutput: record.operational_output,
    planned: record.planned ?? '',
    done: record.done ?? '',
    findingsChallenges: record.findings_challenges ?? '',
    actionRequired: record.action_required ?? '',
    resourcesNeeded: record.resources_needed ?? '',
    priority: record.priority,
    startDate: record.start_date ?? '',
    endDate: record.end_date ?? '',
    status: record.status,
    responsiblePersonUserId: record.responsible_person_user_id ?? '',
    responsiblePersonName: record.responsible_person_name ?? '',
    completionDate: record.completion_date ?? '',
    objectiveAchieved: record.objective_achieved == null ? '' : record.objective_achieved ? 'yes' : 'no',
    objectiveAchievedComments: record.objective_achieved_comments ?? ''
  };
}

function profileLabel(profiles: Map<string, string>, userId: string | null | undefined, fallback?: string | null): string {
  if (userId && profiles.has(userId)) return profiles.get(userId)!;
  if (fallback?.trim()) return fallback;
  if (!userId) return '—';
  return `${userId.slice(0, 8)}…`;
}

function StatusBadge({ status }: { status: OperationalRecordStatus }) {
  const cls: Record<OperationalRecordStatus, string> = {
    not_started: 'bg-surface-200 text-charcoal-600',
    in_progress: 'bg-blue-100 text-blue-800',
    completed: 'bg-emerald-100 text-emerald-800',
    delayed: 'bg-amber-100 text-amber-800',
    overdue: 'bg-critical/10 text-critical'
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${cls[status]}`}>
      {OPERATIONAL_STATUS_LABELS[status]}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: OperationalPriority }) {
  const cls: Record<OperationalPriority, string> = {
    low: 'bg-surface-100 text-charcoal-600',
    medium: 'bg-amber-50 text-amber-800',
    high: 'bg-critical/10 text-critical'
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cls[priority]}`}>
      {OPERATIONAL_PRIORITY_LABELS[priority]}
    </span>
  );
}

function CellText({ value, max = 48 }: { value: string | null | undefined; max?: number }) {
  if (!value?.trim()) return <span className="text-charcoal-400">—</span>;
  const trimmed = value.trim();
  if (trimmed.length <= max) return <span className="text-charcoal">{trimmed}</span>;
  return <span className="text-charcoal" title={trimmed}>{trimmed.slice(0, max)}…</span>;
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <span className="block text-xs font-medium text-charcoal-500 mb-1">
      {children}
      {required && <span className="text-critical ml-0.5" aria-hidden>*</span>}
    </span>
  );
}

function OperationalRecordFormModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  userId: UUID;
  existing: OperationalInputRecord | null;
  profiles: Map<string, string>;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<RecordFormState>(emptyFormState);
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!props.open) return;
    setForm(props.existing ? formFromRecord(props.existing) : emptyFormState());
    setEvidenceFiles([]);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [props.open, props.existing?.id]);

  function setField<K extends keyof RecordFormState>(key: K, value: RecordFormState[K]) {
    setForm((s) => ({ ...s, [key]: value }));
  }

  async function uploadEvidence(recordId: UUID) {
    for (const file of evidenceFiles) {
      const key = `${props.companyId}/operational_input_record/${recordId}/${Date.now()}-${file.name}`.replace(/\s+/g, '_');
      const uploaded = await uploadFile(EVIDENCE_BUCKET as any, file, { key });
      await createEvidence({
        companyId: props.companyId,
        entityType: 'operational_input_record',
        entityId: recordId,
        title: file.name,
        displayTitle: file.name,
        originalFilename: file.name,
        fileKind: file.type.startsWith('image/') ? 'image' : 'document',
        storageBucket: uploaded.bucket,
        storageKey: uploaded.key,
        createdByUserId: props.userId
      });
    }
  }

  async function saveRecord(closeAfter: boolean) {
    setError('');
    if (!form.area) {
      setError('Area is required.');
      return;
    }
    if (!form.operationalOutput.trim()) {
      setError('Operational output / task is required.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        companyId: props.companyId,
        recordDate: form.recordDate,
        area: form.area as OperationalArea,
        operationalOutput: form.operationalOutput,
        planned: form.planned || null,
        done: form.done || null,
        findingsChallenges: form.findingsChallenges || null,
        actionRequired: form.actionRequired || null,
        resourcesNeeded: form.resourcesNeeded || null,
        priority: form.priority,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        status: form.status,
        responsiblePersonUserId: (form.responsiblePersonUserId || null) as UUID | null,
        responsiblePersonName: form.responsiblePersonName || null,
        completionDate: form.completionDate || null,
        objectiveAchieved: form.objectiveAchieved === '' ? null : form.objectiveAchieved === 'yes',
        objectiveAchievedComments: form.objectiveAchievedComments || null,
        actorUserId: props.userId
      };

      let saved: OperationalInputRecord;
      if (props.existing) {
        saved = await updateOperationalInputRecord({ ...payload, recordId: props.existing.id });
      } else {
        saved = await createOperationalInputRecord(payload);
      }

      if (evidenceFiles.length > 0) {
        await uploadEvidence(saved.id);
      }

      props.onSaved();
      if (closeAfter) {
        props.onClose();
      } else {
        setForm(emptyFormState());
        setEvidenceFiles([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    } catch (err) {
      setError(toUserFacingError(err, 'Failed to save operational input.'));
    } finally {
      setSaving(false);
    }
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} aria-hidden />
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[92dvh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white border-b border-surface-200 px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-charcoal">{props.existing ? 'Edit' : 'Add'} Operational Input</h2>
            <p className="text-xs text-charcoal-500 mt-0.5">Fields marked <span className="text-critical">*</span> are required.</p>
          </div>
          <button type="button" onClick={props.onClose} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-surface-100 text-charcoal-500 text-xl" aria-label="Close">×</button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void saveRecord(true);
          }}
          className="p-5 space-y-4"
        >
          {error && <div className="bg-critical/10 border border-critical/30 rounded-lg p-3 text-sm text-critical">{error}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-sm">
              <FieldLabel required>Date</FieldLabel>
              <input type="date" required value={form.recordDate} onChange={(e) => setField('recordDate', e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm" />
            </label>
            <label className="text-sm">
              <FieldLabel required>Area</FieldLabel>
              <select required value={form.area} onChange={(e) => setField('area', e.target.value as OperationalArea | '')} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm">
                <option value="">Select area…</option>
                {OPERATIONAL_AREAS.map((a) => <option key={a} value={a}>{OPERATIONAL_AREA_LABELS[a]}</option>)}
              </select>
            </label>
            <label className="text-sm md:col-span-2">
              <FieldLabel required>Operational output / task</FieldLabel>
              <input required value={form.operationalOutput} onChange={(e) => setField('operationalOutput', e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm" placeholder="Describe the output or task" />
            </label>
            <label className="text-sm md:col-span-2">
              <FieldLabel>What was planned?</FieldLabel>
              <textarea rows={2} value={form.planned} onChange={(e) => setField('planned', e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm" />
            </label>
            <label className="text-sm md:col-span-2">
              <FieldLabel>What was done?</FieldLabel>
              <textarea rows={2} value={form.done} onChange={(e) => setField('done', e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm" />
            </label>
            <label className="text-sm md:col-span-2">
              <FieldLabel>Findings / challenges</FieldLabel>
              <textarea rows={2} value={form.findingsChallenges} onChange={(e) => setField('findingsChallenges', e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm" />
            </label>
            <label className="text-sm md:col-span-2">
              <FieldLabel>Action required</FieldLabel>
              <textarea rows={2} value={form.actionRequired} onChange={(e) => setField('actionRequired', e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm" />
            </label>
            <label className="text-sm md:col-span-2">
              <FieldLabel>Resources needed</FieldLabel>
              <textarea rows={2} value={form.resourcesNeeded} onChange={(e) => setField('resourcesNeeded', e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm" />
            </label>
            <label className="text-sm">
              <FieldLabel required>Priority</FieldLabel>
              <select value={form.priority} onChange={(e) => setField('priority', e.target.value as OperationalPriority)} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm">
                {OPERATIONAL_PRIORITIES.map((p) => <option key={p} value={p}>{OPERATIONAL_PRIORITY_LABELS[p]}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <FieldLabel required>Status</FieldLabel>
              <select value={form.status} onChange={(e) => setField('status', e.target.value as OperationalRecordStatus)} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm">
                {OPERATIONAL_STATUSES.map((s) => <option key={s} value={s}>{OPERATIONAL_STATUS_LABELS[s]}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <FieldLabel>Start date</FieldLabel>
              <input type="date" value={form.startDate} onChange={(e) => setField('startDate', e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm" />
            </label>
            <label className="text-sm">
              <FieldLabel>End date</FieldLabel>
              <input type="date" value={form.endDate} onChange={(e) => setField('endDate', e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm" />
            </label>
            <label className="text-sm">
              <FieldLabel>Responsible person</FieldLabel>
              <select value={form.responsiblePersonUserId} onChange={(e) => setField('responsiblePersonUserId', e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm">
                <option value="">Select user…</option>
                {[...props.profiles.entries()].map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <FieldLabel>Or name (if not in list)</FieldLabel>
              <input value={form.responsiblePersonName} onChange={(e) => setField('responsiblePersonName', e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm" placeholder="External / contractor name" />
            </label>
            <label className="text-sm">
              <FieldLabel>Completion date</FieldLabel>
              <input type="date" value={form.completionDate} onChange={(e) => setField('completionDate', e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm" />
            </label>
            <label className="text-sm">
              <FieldLabel>Objective achieved</FieldLabel>
              <select value={form.objectiveAchieved} onChange={(e) => setField('objectiveAchieved', e.target.value as '' | 'yes' | 'no')} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm">
                <option value="">Select…</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
            <label className="text-sm md:col-span-2">
              <FieldLabel>Objective achieved comments</FieldLabel>
              <textarea rows={2} value={form.objectiveAchievedComments} onChange={(e) => setField('objectiveAchievedComments', e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm" placeholder="Explain outcome or gaps" />
            </label>
            <div className="text-sm md:col-span-2">
              <FieldLabel>Evidence</FieldLabel>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={(e) => setEvidenceFiles(Array.from(e.target.files ?? []))}
                className="w-full text-sm file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-surface-100 file:text-charcoal"
              />
              {evidenceFiles.length > 0 && (
                <p className="text-xs text-charcoal-500 mt-1 flex items-center gap-1">
                  <PaperclipIcon className="w-3 h-3" />
                  {evidenceFiles.length} file{evidenceFiles.length === 1 ? '' : 's'} selected
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-surface-200">
            <button type="button" onClick={props.onClose} className="px-4 py-2 rounded-lg border border-surface-300 text-charcoal text-sm">Cancel</button>
            {!props.existing && (
              <button type="button" disabled={saving} onClick={() => void saveRecord(false)} className="px-4 py-2 rounded-lg border border-teal text-teal text-sm disabled:opacity-50">
                {saving ? 'Saving…' : 'Save & add another'}
              </button>
            )}
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-teal text-white text-sm disabled:opacity-50">
              {saving ? 'Saving…' : props.existing ? 'Update record' : 'Save record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MonthlyKpiSection(props: { companyId: UUID; userId: UUID; canManage: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [fields, setFields] = useState({
    totalDeliveries: '',
    totalItemsInspected: '',
    productionOutput: '',
    totalEnergyUsed: '',
    recycledWaste: '',
    totalWasteGenerated: '',
    ppeObserved: '',
    ppeWearing: ''
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: monthlyRows, refetch } = useAsync(
    async () => listOperationalInputsMonthly({ companyId: props.companyId, limit: 24 }),
    [props.companyId]
  );

  function openAdd() {
    setYear(new Date().getFullYear());
    setMonth(new Date().getMonth() + 1);
    setFields({ totalDeliveries: '', totalItemsInspected: '', productionOutput: '', totalEnergyUsed: '', recycledWaste: '', totalWasteGenerated: '', ppeObserved: '', ppeWearing: '' });
    setError('');
    setModalOpen(true);
  }

  async function saveMonthly(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await upsertOperationalInputsMonthly({
        companyId: props.companyId,
        year,
        month,
        totalDeliveries: fields.totalDeliveries === '' ? null : parseFloat(fields.totalDeliveries),
        totalItemsInspected: fields.totalItemsInspected === '' ? null : parseFloat(fields.totalItemsInspected),
        productionOutput: fields.productionOutput === '' ? null : parseFloat(fields.productionOutput),
        totalEnergyUsed: fields.totalEnergyUsed === '' ? null : parseFloat(fields.totalEnergyUsed),
        recycledWaste: fields.recycledWaste === '' ? null : parseFloat(fields.recycledWaste),
        totalWasteGenerated: fields.totalWasteGenerated === '' ? null : parseFloat(fields.totalWasteGenerated),
        ppeEmployeesObserved: fields.ppeObserved === '' ? null : parseInt(fields.ppeObserved, 10),
        ppeEmployeesWearing: fields.ppeWearing === '' ? null : parseInt(fields.ppeWearing, 10),
        createdByUserId: props.userId
      });
      setModalOpen(false);
      await refetch();
    } catch (err) {
      setError(toUserFacingError(err, 'Failed to save monthly KPI data.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border border-surface-200 rounded-xl overflow-hidden">
      <button type="button" onClick={() => setExpanded((v) => !v)} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-surface-50">
        <div>
          <p className="font-semibold text-charcoal text-sm">Monthly KPI denominators</p>
          <p className="text-xs text-charcoal-500">Optional totals used by Quality, Environment and PPE analytics.</p>
        </div>
        {expanded ? <ChevronUpIcon className="w-4 h-4 text-charcoal-500" /> : <ChevronDownIcon className="w-4 h-4 text-charcoal-500" />}
      </button>
      {expanded && (
        <div className="border-t border-surface-200 p-4 space-y-3">
          {props.canManage && (
            <button type="button" onClick={openAdd} className="text-sm px-3 py-1.5 rounded-lg border border-teal text-teal">Add monthly totals</button>
          )}
          {(monthlyRows ?? []).length === 0 ? (
            <p className="text-sm text-charcoal-500">No monthly KPI data entered yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-surface-100">
                  <tr>
                    <th className="text-left px-3 py-2">Period</th>
                    <th className="text-right px-3 py-2">Deliveries</th>
                    <th className="text-right px-3 py-2">Items inspected</th>
                    <th className="text-right px-3 py-2">PPE observed</th>
                  </tr>
                </thead>
                <tbody>
                  {(monthlyRows ?? []).map((r) => (
                    <tr key={r.id} className="border-t border-surface-100">
                      <td className="px-3 py-2">{MONTH_NAMES[r.month - 1]} {r.year}</td>
                      <td className="px-3 py-2 text-right">{r.total_deliveries ?? '—'}</td>
                      <td className="px-3 py-2 text-right">{r.total_items_inspected ?? '—'}</td>
                      <td className="px-3 py-2 text-right">{r.ppe_employees_observed ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setModalOpen(false)} />
          <form onSubmit={(e) => void saveMonthly(e)} className="relative bg-white rounded-xl border border-surface-200 p-5 w-full max-w-md space-y-3 max-h-[90dvh] overflow-y-auto">
            <h3 className="font-semibold text-charcoal">Monthly KPI totals</h3>
            {error && <p className="text-sm text-critical">{error}</p>}
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm"><FieldLabel required>Year</FieldLabel><input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-full px-3 py-2 border rounded-lg text-sm" /></label>
              <label className="text-sm"><FieldLabel required>Month</FieldLabel>
                <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-full px-3 py-2 border rounded-lg text-sm">
                  {MONTHS.map((m) => <option key={m} value={m}>{MONTH_NAMES[m - 1]}</option>)}
                </select>
              </label>
            </div>
            {[
              ['totalDeliveries', 'Total deliveries'],
              ['totalItemsInspected', 'Total items inspected'],
              ['productionOutput', 'Production output'],
              ['totalEnergyUsed', 'Total energy used'],
              ['recycledWaste', 'Recycled waste'],
              ['totalWasteGenerated', 'Total waste generated'],
              ['ppeObserved', 'PPE employees observed'],
              ['ppeWearing', 'PPE employees wearing']
            ].map(([key, label]) => (
              <label key={key} className="text-sm block">
                <FieldLabel>{label}</FieldLabel>
                <input type="number" min={0} value={(fields as any)[key]} onChange={(e) => setFields((s) => ({ ...s, [key]: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </label>
            ))}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setModalOpen(false)} className="px-3 py-2 border rounded-lg text-sm">Cancel</button>
              <button type="submit" disabled={saving} className="px-3 py-2 bg-teal text-white rounded-lg text-sm disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export function OperationalInputsPage() {
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<OperationalInputRecord | null>(null);
  const [areaFilter, setAreaFilter] = useState<'all' | OperationalArea>('all');
  const canManage = MANAGEMENT_ROLES.includes(activeRole as (typeof MANAGEMENT_ROLES)[number]) || activeRole === 'consultant';

  const { data: records, loading, refetch } = useAsync(
    async () => {
      if (!activeCompanyId) return [];
      return listOperationalInputRecords({ companyId: activeCompanyId as UUID, limit: 500 });
    },
    [activeCompanyId]
  );

  const { data: profilesList } = useAsync(
    async () => (activeCompanyId ? listUserProfiles(activeCompanyId as UUID) : []),
    [activeCompanyId]
  );

  const profileMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of profilesList ?? []) {
      map.set(p.user_id, [p.full_name, p.email].filter(Boolean).join(' • ') || p.user_id);
    }
    return map;
  }, [profilesList]);

  const filtered = useMemo(() => {
    const list = records ?? [];
    if (areaFilter === 'all') return list;
    return list.filter((r) => r.area === areaFilter);
  }, [records, areaFilter]);

  const handleExportCsv = () => {
    const rowsForCsv = filtered.map((r) => ({
      Date: r.record_date,
      Area: OPERATIONAL_AREA_LABELS[r.area],
      'Operational output': r.operational_output,
      Planned: r.planned ?? '',
      Done: r.done ?? '',
      'Findings/challenges': r.findings_challenges ?? '',
      'Action required': r.action_required ?? '',
      'Resources needed': r.resources_needed ?? '',
      Priority: OPERATIONAL_PRIORITY_LABELS[r.priority],
      'Start date': r.start_date ?? '',
      'End date': r.end_date ?? '',
      Status: OPERATIONAL_STATUS_LABELS[r.status],
      'Responsible person': profileLabel(profileMap, r.responsible_person_user_id, r.responsible_person_name),
      'Completion date': r.completion_date ?? '',
      'Objective achieved': r.objective_achieved == null ? '' : r.objective_achieved ? 'Yes' : 'No',
      Comments: r.objective_achieved_comments ?? ''
    }));
    downloadTextFile(`operational-inputs-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rowsForCsv));
  };

  async function onDelete(record: OperationalInputRecord) {
    if (!activeCompanyId || !user?.id) return;
    if (!window.confirm('Delete this operational input record?')) return;
    try {
      await deleteOperationalInputRecord({
        companyId: activeCompanyId as UUID,
        recordId: record.id,
        actorUserId: user.id as UUID
      });
      await refetch();
    } catch (err) {
      alert(toUserFacingError(err, 'Failed to delete record.'));
    }
  }

  return (
    <Layout title="Operational Inputs">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        <div className="bg-white border border-surface-300 rounded-xl p-5 shadow-card">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-charcoal">Operational Inputs</h1>
              <p className="text-sm text-charcoal-500 mt-1">
                Capture operational activities across Safety, Health, Environment, Quality, Risk and Compliance. Add multiple records per area.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canManage && (
                <button type="button" onClick={() => { setEditing(null); setModalOpen(true); }} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm">
                  <PlusIcon className="w-4 h-4" /> Add operational input
                </button>
              )}
              <button type="button" onClick={handleExportCsv} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-300 text-charcoal text-sm">
                <DownloadIcon className="w-4 h-4" /> Export CSV
              </button>
            </div>
          </div>
          <div className="mt-4">
            <label className="text-sm inline-flex items-center gap-2">
              <span className="text-charcoal-500">Filter by area:</span>
              <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value as 'all' | OperationalArea)} className="px-3 py-1.5 border border-surface-300 rounded-lg text-sm">
                <option value="all">All areas</option>
                {OPERATIONAL_AREAS.map((a) => <option key={a} value={a}>{OPERATIONAL_AREA_LABELS[a]}</option>)}
              </select>
            </label>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-charcoal-500">Loading operational inputs…</p>
        ) : filtered.length === 0 ? (
          <div className="bg-surface-50 rounded-xl p-8 text-center text-charcoal-500 border border-surface-200">
            No operational input records yet. {canManage ? 'Click “Add operational input” to create your first entry.' : ''}
          </div>
        ) : (
          <div className="bg-white border border-surface-200 rounded-xl overflow-hidden shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[1800px]">
                <thead className="bg-surface-100 border-b border-surface-200">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-charcoal whitespace-nowrap">Date</th>
                    <th className="text-left px-3 py-2 font-medium text-charcoal whitespace-nowrap">Area</th>
                    <th className="text-left px-3 py-2 font-medium text-charcoal min-w-[140px]">Output / task</th>
                    <th className="text-left px-3 py-2 font-medium text-charcoal min-w-[120px]">Planned</th>
                    <th className="text-left px-3 py-2 font-medium text-charcoal min-w-[120px]">Done</th>
                    <th className="text-left px-3 py-2 font-medium text-charcoal min-w-[120px]">Findings</th>
                    <th className="text-left px-3 py-2 font-medium text-charcoal min-w-[100px]">Action</th>
                    <th className="text-left px-3 py-2 font-medium text-charcoal min-w-[100px]">Resources</th>
                    <th className="text-left px-3 py-2 font-medium text-charcoal">Priority</th>
                    <th className="text-left px-3 py-2 font-medium text-charcoal whitespace-nowrap">Start</th>
                    <th className="text-left px-3 py-2 font-medium text-charcoal whitespace-nowrap">End</th>
                    <th className="text-left px-3 py-2 font-medium text-charcoal">Status</th>
                    <th className="text-left px-3 py-2 font-medium text-charcoal min-w-[120px]">Responsible</th>
                    <th className="text-left px-3 py-2 font-medium text-charcoal whitespace-nowrap">Completed</th>
                    <th className="text-left px-3 py-2 font-medium text-charcoal">Objective</th>
                    <th className="text-left px-3 py-2 font-medium text-charcoal min-w-[100px]">Comments</th>
                    {canManage && <th className="px-3 py-2 w-20" />}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-b border-surface-100 hover:bg-surface-50 align-top">
                      <td className="px-3 py-2 whitespace-nowrap text-charcoal">{r.record_date}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-charcoal">{OPERATIONAL_AREA_LABELS[r.area]}</td>
                      <td className="px-3 py-2"><CellText value={r.operational_output} max={60} /></td>
                      <td className="px-3 py-2"><CellText value={r.planned} /></td>
                      <td className="px-3 py-2"><CellText value={r.done} /></td>
                      <td className="px-3 py-2"><CellText value={r.findings_challenges} /></td>
                      <td className="px-3 py-2"><CellText value={r.action_required} /></td>
                      <td className="px-3 py-2"><CellText value={r.resources_needed} /></td>
                      <td className="px-3 py-2"><PriorityBadge priority={r.priority} /></td>
                      <td className="px-3 py-2 whitespace-nowrap text-charcoal-500">{r.start_date ?? '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-charcoal-500">{r.end_date ?? '—'}</td>
                      <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                      <td className="px-3 py-2 text-charcoal">{profileLabel(profileMap, r.responsible_person_user_id, r.responsible_person_name)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-charcoal-500">{r.completion_date ?? '—'}</td>
                      <td className="px-3 py-2 text-charcoal-500">{r.objective_achieved == null ? '—' : r.objective_achieved ? 'Yes' : 'No'}</td>
                      <td className="px-3 py-2"><CellText value={r.objective_achieved_comments} /></td>
                      {canManage && (
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <button type="button" onClick={() => { setEditing(r); setModalOpen(true); }} className="p-1.5 rounded hover:bg-surface-200 text-charcoal-500" title="Edit"><PencilIcon className="w-4 h-4" /></button>
                            <button type="button" onClick={() => void onDelete(r)} className="p-1.5 rounded hover:bg-critical/10 text-critical" title="Delete"><TrashIcon className="w-4 h-4" /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeCompanyId && user?.id && (
          <MonthlyKpiSection companyId={activeCompanyId as UUID} userId={user.id as UUID} canManage={canManage} />
        )}

        {activeCompanyId && user?.id && (
          <OperationalRecordFormModal
            open={modalOpen}
            onClose={() => { setModalOpen(false); setEditing(null); }}
            companyId={activeCompanyId as UUID}
            userId={user.id as UUID}
            existing={editing}
            profiles={profileMap}
            onSaved={() => void refetch()}
          />
        )}
      </motion.div>
    </Layout>
  );
}
