import React, { useMemo, useState } from 'react';
import { useUser } from '@insforge/react';
import { Layout } from '../components/layout/Layout';
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import type { CompanyRole, UUID } from '../api/models/core';
import type {
  CalibrationCriticality,
  CalibrationEquipmentStatus,
  CalibrationModuleTag,
  CalibrationRecord,
  CalibrationResult
} from '../api/models/entities';
import {
  CALIBRATION_CRITICALITY_LABELS,
  CALIBRATION_EQUIPMENT_STATUS_LABELS,
  CALIBRATION_RESULT_LABELS,
  canCreateCalibrationNcr,
  canDeleteCalibration,
  canExportCalibration,
  canManageModuleTags,
  createCalibrationRecord,
  deleteCalibrationRecord,
  getCalibrationSummary,
  listCalibrationRecords,
  listCalibrationResponsiblePeople,
  updateCalibrationRecord,
  uploadCalibrationAttachments
} from '../api/services/calibrationService';
import { listEvidence } from '../api/services/evidenceService';
import { ListEmptyState } from '../components/ui/ListEmptyState';
import { ScaleIcon } from 'lucide-react';
import { downloadDocumentFile, downloadBlob } from '../api/services/documentsStorageService';
import { toCsv, downloadTextFile } from '../utils/csv';

const MODULE_TAGS: CalibrationModuleTag[] = ['Quality', 'Health', 'Safety', 'Environment', 'General'];
const CRITICALITY_OPTIONS: CalibrationCriticality[] = ['HIGH', 'MEDIUM', 'LOW'];
const EQUIPMENT_STATUS_OPTIONS: CalibrationEquipmentStatus[] = ['IN_SERVICE', 'OUT_OF_SERVICE', 'REQUIRES_ADJUSTMENT_REPAIR'];
const RESULT_OPTIONS: CalibrationResult[] = ['PASS', 'FAIL'];
const TYPE_SUGGESTIONS = ['External', 'Internal', 'Lab', 'Field'];
const FREQ_SUGGESTIONS = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annual'];

type FormMode = 'create' | 'edit' | 'view';
type FormState = {
  id?: UUID;
  equipmentName: string;
  equipmentId: string;
  location: string;
  criticality: CalibrationCriticality;
  equipmentStatus: CalibrationEquipmentStatus;
  measuringRange: string;
  calibrationType: string;
  calibrationFrequency: string;
  calibrationDate: string;
  result: CalibrationResult;
  nextCalibrationDate: string;
  responsibleUserId: UUID | '';
  responsibleNameSnapshot: string;
  moduleTags: CalibrationModuleTag[];
  notes: string;
  failureNotes: string;
  actionRequired: boolean;
  createNcrOnFailure: boolean;
};

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(value?: string | null): string {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-ZA');
}

function toForm(defaultModuleTag?: CalibrationModuleTag, row?: CalibrationRecord): FormState {
  return {
    id: row?.id,
    equipmentName: row?.equipment_name ?? '',
    equipmentId: row?.equipment_id ?? '',
    location: row?.location ?? '',
    criticality: row?.criticality ?? 'MEDIUM',
    equipmentStatus: row?.equipment_status ?? 'IN_SERVICE',
    measuringRange: row?.measuring_range ?? '',
    calibrationType: row?.calibration_type ?? '',
    calibrationFrequency: row?.calibration_frequency ?? '',
    calibrationDate: row?.calibration_date?.slice(0, 10) ?? todayDateOnly(),
    result: row?.result ?? 'PASS',
    nextCalibrationDate: row?.next_calibration_date?.slice(0, 10) ?? todayDateOnly(),
    responsibleUserId: (row?.responsible_user_id as UUID | null) ?? '',
    responsibleNameSnapshot: row?.responsible_name_snapshot ?? '',
    moduleTags: row?.module_tags?.length ? row.module_tags : defaultModuleTag ? [defaultModuleTag] : ['Quality'],
    notes: row?.notes ?? '',
    failureNotes: row?.failure_notes ?? '',
    actionRequired: row?.action_required ?? false,
    createNcrOnFailure: false
  };
}

function roleCanWrite(role: CompanyRole | null): boolean {
  return role === 'admin' || role === 'manager' || role === 'supervisor';
}

export function CalibrationPage(props: { title?: string; defaultModuleTag?: CalibrationModuleTag; forceReadOnly?: boolean }) {
  const { user } = useUser();
  const { activeCompanyId, activeRole } = useTenant();

  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [nextDateFrom, setNextDateFrom] = useState('');
  const [nextDateTo, setNextDateTo] = useState('');
  const [criticalityFilter, setCriticalityFilter] = useState<'' | CalibrationCriticality>('');
  const [statusFilter, setStatusFilter] = useState<'' | CalibrationEquipmentStatus>('');
  const [resultFilter, setResultFilter] = useState<'' | CalibrationResult>('');
  const [responsibleFilter, setResponsibleFilter] = useState<UUID | ''>('');
  const [moduleFilter, setModuleFilter] = useState<'' | CalibrationModuleTag>(props.defaultModuleTag ?? '');

  const [refreshKey, setRefreshKey] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>('create');
  const [form, setForm] = useState<FormState>(toForm(props.defaultModuleTag));
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [itemPicture, setItemPicture] = useState<File | null>(null);
  const [certFiles, setCertFiles] = useState<File[]>([]);

  const readOnlyRoute = !!props.forceReadOnly;
  const canWrite = roleCanWrite(activeRole ?? null) && !readOnlyRoute;
  const canDelete = canDeleteCalibration(activeRole ?? null) && !readOnlyRoute;
  const canTags = canManageModuleTags(activeRole ?? null) && !readOnlyRoute;
  const canNcr = canCreateCalibrationNcr(activeRole ?? null) && !readOnlyRoute;
  const canExport = canExportCalibration(activeRole ?? null);

  const { data: rows, loading, error, retry } = useAsync<CalibrationRecord[]>(async () => {
    if (!activeCompanyId || !user?.id) return [];
    return await listCalibrationRecords({
      companyId: activeCompanyId,
      actorRole: activeRole ?? null,
      actorUserId: user.id as UUID,
      moduleTag: moduleFilter || props.defaultModuleTag,
      search: search || undefined,
      calibrationDateFrom: dateFrom || undefined,
      calibrationDateTo: dateTo || undefined,
      nextCalibrationDateFrom: nextDateFrom || undefined,
      nextCalibrationDateTo: nextDateTo || undefined,
      criticality: criticalityFilter || undefined,
      equipmentStatus: statusFilter || undefined,
      result: resultFilter || undefined,
      responsibleUserId: responsibleFilter || undefined
    });
  }, [activeCompanyId, activeRole, user?.id, search, dateFrom, dateTo, nextDateFrom, nextDateTo, criticalityFilter, statusFilter, resultFilter, responsibleFilter, moduleFilter, props.defaultModuleTag, refreshKey]);

  const { data: summary } = useAsync(async () => {
    if (!activeCompanyId || !user?.id) return null;
    return await getCalibrationSummary({
      companyId: activeCompanyId,
      actorRole: activeRole ?? null,
      actorUserId: user.id as UUID,
      moduleTag: moduleFilter || props.defaultModuleTag
    });
  }, [activeCompanyId, activeRole, user?.id, moduleFilter, props.defaultModuleTag, refreshKey]);

  const { data: people } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return await listCalibrationResponsiblePeople(activeCompanyId);
  }, [activeCompanyId]);

  const personOptions = useMemo(() =>
    [...(people ?? [])].sort((a, b) => a.displayName.localeCompare(b.displayName)), [people]
  );

  function openCreate() {
    setFormMode('create');
    setForm(toForm(props.defaultModuleTag));
    setItemPicture(null);
    setCertFiles([]);
    setFormError(null);
    setModalOpen(true);
  }

  function openRow(mode: FormMode, row: CalibrationRecord) {
    setFormMode(mode);
    setForm(toForm(props.defaultModuleTag, row));
    setItemPicture(null);
    setCertFiles([]);
    setFormError(null);
    setModalOpen(true);
  }

  async function refresh() {
    setRefreshKey((v) => v + 1);
    retry();
  }

  async function save() {
    if (!activeCompanyId || !user?.id) return;
    setSaving(true);
    setFormError(null);
    try {
      let saved: CalibrationRecord;
      if (formMode === 'create') {
        saved = await createCalibrationRecord({
          companyId: activeCompanyId,
          actorUserId: user.id as UUID,
          actorRole: activeRole ?? null,
          equipmentName: form.equipmentName,
          equipmentId: form.equipmentId,
          location: form.location,
          criticality: form.criticality,
          equipmentStatus: form.equipmentStatus,
          measuringRange: form.measuringRange || null,
          calibrationType: form.calibrationType || null,
          calibrationFrequency: form.calibrationFrequency || null,
          calibrationDate: form.calibrationDate,
          result: form.result,
          nextCalibrationDate: form.nextCalibrationDate,
          responsibleUserId: form.responsibleUserId || null,
          responsibleNameSnapshot: form.responsibleNameSnapshot,
          moduleTags: form.moduleTags,
          notes: form.notes || null,
          failureNotes: form.failureNotes || null,
          actionRequired: form.actionRequired,
          createNcrOnFailure: form.createNcrOnFailure
        });
      } else if (form.id) {
        saved = await updateCalibrationRecord({
          companyId: activeCompanyId,
          recordId: form.id,
          actorUserId: user.id as UUID,
          actorRole: activeRole ?? null,
          patch: {
            equipment_name: form.equipmentName,
            equipment_id: form.equipmentId,
            location: form.location,
            criticality: form.criticality,
            equipment_status: form.equipmentStatus,
            measuring_range: form.measuringRange || null,
            calibration_type: form.calibrationType || null,
            calibration_frequency: form.calibrationFrequency || null,
            calibration_date: form.calibrationDate,
            result: form.result,
            next_calibration_date: form.nextCalibrationDate,
            responsible_user_id: form.responsibleUserId || null,
            responsible_name_snapshot: form.responsibleNameSnapshot,
            module_tags: form.moduleTags,
            notes: form.notes || null,
            failure_notes: form.failureNotes || null,
            action_required: form.actionRequired
          },
          createNcrOnFailure: form.createNcrOnFailure
        });
      } else {
        throw new Error('Missing calibration id.');
      }

      if (itemPicture || certFiles.length > 0) {
        await uploadCalibrationAttachments({
          companyId: activeCompanyId,
          recordId: saved.id,
          actorUserId: user.id as UUID,
          itemPictureFile: itemPicture,
          certificateFiles: certFiles
        });
      }

      setModalOpen(false);
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save calibration record.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: CalibrationRecord) {
    if (!activeCompanyId || !user?.id) return;
    if (!confirm(`Delete SR #${row.sr_no}?`)) return;
    await deleteCalibrationRecord({
      companyId: activeCompanyId,
      recordId: row.id,
      actorUserId: user.id as UUID,
      actorRole: activeRole ?? null
    });
    await refresh();
  }

  async function downloadCertificates(row: CalibrationRecord) {
    if (!activeCompanyId) return;
    const evidence = await listEvidence(activeCompanyId, { entityType: 'calibration_record', entityId: row.id, limit: 500 });
    const ids = new Set(row.certificate_file_ids ?? []);
    const certs = evidence.filter((file) => ids.has(file.id));
    for (const file of certs) {
      const blob = await downloadDocumentFile({ bucket: file.storage_bucket, key: file.storage_key });
      const filename = file.original_filename ?? file.storage_key.split('/').pop() ?? `certificate-${file.id}`;
      downloadBlob(blob, filename);
    }
  }

  function exportCsv(records: CalibrationRecord[]) {
    const csv = toCsv(records.map((r) => ({
      'Sr. #': r.sr_no,
      'Equipment Name': r.equipment_name,
      'Equipment I.D': r.equipment_id,
      Location: r.location,
      Criticality: CALIBRATION_CRITICALITY_LABELS[r.criticality],
      'Equipment status': CALIBRATION_EQUIPMENT_STATUS_LABELS[r.equipment_status],
      'Measuring Range': r.measuring_range ?? '',
      'Calibration Type': r.calibration_type ?? '',
      'Frequency of Calibration': r.calibration_frequency ?? '',
      'Calibration Date': r.calibration_date,
      'Pass/Fail': CALIBRATION_RESULT_LABELS[r.result],
      'Next Calibration Date': r.next_calibration_date,
      'Responsible person': r.responsible_name_snapshot,
      'Item Picture': r.item_picture_file_id ?? '',
      'Certificate(s)': (r.certificate_file_ids ?? []).join('; ')
    })));
    downloadTextFile(`calibration-register-${todayDateOnly()}.csv`, csv, 'text/csv;charset=utf-8');
  }

  const failureState = form.result === 'FAIL' || form.equipmentStatus === 'REQUIRES_ADJUSTMENT_REPAIR';

  return (
    <Layout title={props.title ?? 'Calibration Register'}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-surface-300 p-3"><p className="text-xs text-charcoal-500">Calibrations due in 30 days</p><p className="text-2xl font-semibold text-warning">{summary?.dueIn30Days ?? 0}</p></div>
          <div className="bg-white rounded-xl border border-surface-300 p-3"><p className="text-xs text-charcoal-500">Overdue calibrations</p><p className="text-2xl font-semibold text-critical">{summary?.overdue ?? 0}</p></div>
          <div className="bg-white rounded-xl border border-surface-300 p-3"><p className="text-xs text-charcoal-500">Failed calibrations (90 days)</p><p className="text-2xl font-semibold text-critical">{summary?.failedLast90Days ?? 0}</p></div>
          <div className="bg-white rounded-xl border border-surface-300 p-3"><p className="text-xs text-charcoal-500">Out of service items</p><p className="text-2xl font-semibold text-warning">{summary?.outOfServiceItems ?? 0}</p><p className="text-xs text-critical mt-1">High criticality overdue: {summary?.highCriticalityOverdue ?? 0}</p></div>
        </div>

        <div className="bg-white rounded-xl border border-surface-300 p-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
            <input type="date" value={nextDateFrom} onChange={(e) => setNextDateFrom(e.target.value)} className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
            <input type="date" value={nextDateTo} onChange={(e) => setNextDateTo(e.target.value)} className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
            <select value={criticalityFilter} onChange={(e) => setCriticalityFilter((e.target.value || '') as '' | CalibrationCriticality)} className="px-3 py-2 border border-surface-300 rounded-lg text-sm"><option value="">Criticality</option>{CRITICALITY_OPTIONS.map((v) => <option key={v} value={v}>{CALIBRATION_CRITICALITY_LABELS[v]}</option>)}</select>
            <select value={statusFilter} onChange={(e) => setStatusFilter((e.target.value || '') as '' | CalibrationEquipmentStatus)} className="px-3 py-2 border border-surface-300 rounded-lg text-sm"><option value="">Status</option>{EQUIPMENT_STATUS_OPTIONS.map((v) => <option key={v} value={v}>{CALIBRATION_EQUIPMENT_STATUS_LABELS[v]}</option>)}</select>
            <select value={resultFilter} onChange={(e) => setResultFilter((e.target.value || '') as '' | CalibrationResult)} className="px-3 py-2 border border-surface-300 rounded-lg text-sm"><option value="">Pass/Fail</option>{RESULT_OPTIONS.map((v) => <option key={v} value={v}>{CALIBRATION_RESULT_LABELS[v]}</option>)}</select>
            <select value={responsibleFilter} onChange={(e) => setResponsibleFilter((e.target.value || '') as UUID | '')} className="px-3 py-2 border border-surface-300 rounded-lg text-sm"><option value="">Responsible</option>{personOptions.map((p) => <option key={p.userId} value={p.userId}>{p.displayName}</option>)}</select>
            <select value={moduleFilter} onChange={(e) => setModuleFilter((e.target.value || '') as '' | CalibrationModuleTag)} className="px-3 py-2 border border-surface-300 rounded-lg text-sm"><option value="">Module</option>{MODULE_TAGS.map((t) => <option key={t} value={t}>{t}</option>)}</select>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search equipment name, ID, location" className="px-3 py-2 border border-surface-300 rounded-lg text-sm min-w-[220px]" />
          </div>

          <div className="flex flex-wrap gap-2">
            {canWrite && <button type="button" onClick={openCreate} className="px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600">New Calibration</button>}
            {canExport && <button type="button" onClick={() => exportCsv(rows ?? [])} className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium hover:bg-surface-50">Export CSV</button>}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-surface-300 overflow-auto">
          {error && <p className="p-4 text-sm text-critical">{error.message}</p>}
          {loading && <p className="p-4 text-sm text-charcoal-500">Loading calibration records...</p>}
          {!loading && !error && (
            <table className="w-full min-w-[2200px] text-sm">
              <thead className="bg-surface-50"><tr>
                <th className="px-3 py-2 text-left">Sr. #</th><th className="px-3 py-2 text-left">Equipment Name</th><th className="px-3 py-2 text-left">Equipment I.D</th><th className="px-3 py-2 text-left">Location</th><th className="px-3 py-2 text-left">Criticality</th><th className="px-3 py-2 text-left">Equipment status</th><th className="px-3 py-2 text-left">Measuring Range</th><th className="px-3 py-2 text-left">Calibration Type</th><th className="px-3 py-2 text-left">Frequency of Calibration</th><th className="px-3 py-2 text-left">Calibration Date</th><th className="px-3 py-2 text-left">Pass/Fail</th><th className="px-3 py-2 text-left">Next Calibration Date</th><th className="px-3 py-2 text-left">Responsible person</th><th className="px-3 py-2 text-left">Item Picture</th><th className="px-3 py-2 text-left">Certificate(s)</th><th className="px-3 py-2 text-left">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-surface-100">
                {(rows ?? []).map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2 font-semibold text-teal">{row.sr_no}</td><td className="px-3 py-2">{row.equipment_name}</td><td className="px-3 py-2">{row.equipment_id}</td><td className="px-3 py-2">{row.location}</td><td className="px-3 py-2">{CALIBRATION_CRITICALITY_LABELS[row.criticality]}</td><td className="px-3 py-2">{CALIBRATION_EQUIPMENT_STATUS_LABELS[row.equipment_status]}</td><td className="px-3 py-2">{row.measuring_range || '-'}</td><td className="px-3 py-2">{row.calibration_type || '-'}</td><td className="px-3 py-2">{row.calibration_frequency || '-'}</td><td className="px-3 py-2">{fmtDate(row.calibration_date)}</td><td className="px-3 py-2">{CALIBRATION_RESULT_LABELS[row.result]}</td><td className="px-3 py-2">{fmtDate(row.next_calibration_date)}</td><td className="px-3 py-2">{row.responsible_name_snapshot}</td><td className="px-3 py-2">{row.item_picture_file_id ? 'Available' : '-'}</td><td className="px-3 py-2">{row.certificate_file_ids?.length ?? 0}</td>
                    <td className="px-3 py-2"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => openRow('view', row)} className="px-2 py-1 rounded border border-surface-300 text-xs">View</button>{canWrite && <button type="button" onClick={() => openRow('edit', row)} className="px-2 py-1 rounded border border-surface-300 text-xs">Edit</button>}{canDelete && <button type="button" onClick={() => void remove(row)} className="px-2 py-1 rounded border border-critical/30 text-critical text-xs">Delete</button>}<button type="button" onClick={() => void downloadCertificates(row)} className="px-2 py-1 rounded border border-surface-300 text-xs">Download certificate(s)</button></div></td>
                  </tr>
                ))}
                {(rows ?? []).length === 0 && (
                  <ListEmptyState
                    tableColSpan={16}
                    icon={ScaleIcon}
                    title="No calibration records"
                    description="Track equipment, due dates, certificates, and responsible people in one register."
                    primaryAction={
                      canWrite
                        ? { kind: 'button', label: 'New calibration', onClick: openCreate }
                        : { kind: 'link', to: '/modules/quality', label: 'Quality module' }
                    }
                  />
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setModalOpen(false)} />
          <div className="relative w-full max-w-5xl bg-white rounded-2xl border border-surface-300 shadow-xl max-h-[95vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between"><h2 className="text-lg font-semibold text-charcoal">{formMode === 'create' ? 'Create Calibration' : formMode === 'edit' ? 'Edit Calibration' : 'Calibration Details'}</h2><button type="button" onClick={() => setModalOpen(false)} className="px-3 py-1.5 rounded border border-surface-300 text-sm">Close</button></div>
            <div className="p-5 space-y-4">
              {formError && <div className="bg-critical/5 border border-critical/20 rounded-xl p-3"><p className="text-sm text-critical">{formError}</p></div>}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input value={form.equipmentName} disabled={formMode === 'view'} onChange={(e) => setForm((s) => ({ ...s, equipmentName: e.target.value }))} placeholder="Equipment Name *" className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
                <input value={form.equipmentId} disabled={formMode === 'view'} onChange={(e) => setForm((s) => ({ ...s, equipmentId: e.target.value }))} placeholder="Equipment I.D *" className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
                <input value={form.location} disabled={formMode === 'view'} onChange={(e) => setForm((s) => ({ ...s, location: e.target.value }))} placeholder="Location *" className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
                <select value={form.criticality} disabled={formMode === 'view'} onChange={(e) => setForm((s) => ({ ...s, criticality: e.target.value as CalibrationCriticality }))} className="px-3 py-2 border border-surface-300 rounded-lg text-sm">{CRITICALITY_OPTIONS.map((v) => <option key={v} value={v}>{CALIBRATION_CRITICALITY_LABELS[v]}</option>)}</select>
                <select value={form.equipmentStatus} disabled={formMode === 'view'} onChange={(e) => setForm((s) => ({ ...s, equipmentStatus: e.target.value as CalibrationEquipmentStatus }))} className="px-3 py-2 border border-surface-300 rounded-lg text-sm">{EQUIPMENT_STATUS_OPTIONS.map((v) => <option key={v} value={v}>{CALIBRATION_EQUIPMENT_STATUS_LABELS[v]}</option>)}</select>
                <input value={form.measuringRange} disabled={formMode === 'view'} onChange={(e) => setForm((s) => ({ ...s, measuringRange: e.target.value }))} placeholder="Measuring Range" className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
                <input list="calibration-types" value={form.calibrationType} disabled={formMode === 'view'} onChange={(e) => setForm((s) => ({ ...s, calibrationType: e.target.value }))} placeholder="Calibration Type" className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
                <input list="calibration-freqs" value={form.calibrationFrequency} disabled={formMode === 'view'} onChange={(e) => setForm((s) => ({ ...s, calibrationFrequency: e.target.value }))} placeholder="Frequency of Calibration" className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
                <input type="date" value={form.calibrationDate} disabled={formMode === 'view'} onChange={(e) => setForm((s) => ({ ...s, calibrationDate: e.target.value }))} className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
                <select value={form.result} disabled={formMode === 'view'} onChange={(e) => setForm((s) => ({ ...s, result: e.target.value as CalibrationResult }))} className="px-3 py-2 border border-surface-300 rounded-lg text-sm">{RESULT_OPTIONS.map((v) => <option key={v} value={v}>{CALIBRATION_RESULT_LABELS[v]}</option>)}</select>
                <input type="date" value={form.nextCalibrationDate} disabled={formMode === 'view'} onChange={(e) => setForm((s) => ({ ...s, nextCalibrationDate: e.target.value }))} className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
                <select value={form.responsibleUserId} disabled={formMode === 'view'} onChange={(e) => { const id = (e.target.value || '') as UUID | ''; const selected = personOptions.find((x) => x.userId === id); setForm((s) => ({ ...s, responsibleUserId: id, responsibleNameSnapshot: selected?.displayName ?? s.responsibleNameSnapshot })); }} className="px-3 py-2 border border-surface-300 rounded-lg text-sm"><option value="">Responsible (Other/type)</option>{personOptions.map((p) => <option key={p.userId} value={p.userId}>{p.displayName}</option>)}</select>
                <input value={form.responsibleNameSnapshot} disabled={formMode === 'view'} onChange={(e) => setForm((s) => ({ ...s, responsibleNameSnapshot: e.target.value }))} placeholder="Responsible name snapshot" className="px-3 py-2 border border-surface-300 rounded-lg text-sm md:col-span-2" />
                <textarea rows={2} value={form.notes} disabled={formMode === 'view'} onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))} placeholder="Notes" className="px-3 py-2 border border-surface-300 rounded-lg text-sm md:col-span-3" />
              </div>
              <datalist id="calibration-types">{TYPE_SUGGESTIONS.map((v) => <option key={v} value={v} />)}</datalist>
              <datalist id="calibration-freqs">{FREQ_SUGGESTIONS.map((v) => <option key={v} value={v} />)}</datalist>

              {canTags && <div className="flex flex-wrap gap-3">{MODULE_TAGS.map((tag) => <label key={tag} className="inline-flex items-center gap-2 text-sm"><input type="checkbox" disabled={formMode === 'view'} checked={form.moduleTags.includes(tag)} onChange={(e) => setForm((s) => { const next = e.target.checked ? [...new Set([...s.moduleTags, tag])] : s.moduleTags.filter((x) => x !== tag); return { ...s, moduleTags: next.length ? next : ['Quality'] }; })} />{tag}</label>)}</div>}

              {failureState && <div className="bg-warning/5 border border-warning/20 rounded-xl p-3 space-y-2"><textarea rows={2} value={form.failureNotes} disabled={formMode === 'view'} onChange={(e) => setForm((s) => ({ ...s, failureNotes: e.target.value }))} placeholder="failureNotes" className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm" /><label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={form.actionRequired} disabled={formMode === 'view'} onChange={(e) => setForm((s) => ({ ...s, actionRequired: e.target.checked }))} />actionRequired</label>{canNcr && <label className="inline-flex items-center gap-2 text-sm ml-4"><input type="checkbox" checked={form.createNcrOnFailure} disabled={formMode === 'view'} onChange={(e) => setForm((s) => ({ ...s, createNcrOnFailure: e.target.checked }))} />Create NCR/CAPA</label>}</div>}

              {formMode !== 'view' && <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><div><p className="text-sm text-charcoal mb-1">Item Picture</p><input type="file" accept="image/*" onChange={(e) => setItemPicture(e.target.files?.[0] ?? null)} className="text-sm" /></div><div><p className="text-sm text-charcoal mb-1">Calibration certificate upload (multiple)</p><input type="file" multiple onChange={(e) => setCertFiles(Array.from(e.target.files ?? []))} className="text-sm" /></div></div>}
            </div>
            <div className="px-5 py-4 border-t border-surface-200 flex items-center justify-end gap-2"><button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium">Cancel</button>{formMode !== 'view' && canWrite && <button type="button" onClick={() => void save()} disabled={saving} className="px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-70">{saving ? 'Saving...' : 'Save'}</button>}</div>
          </div>
        </div>
      )}
    </Layout>
  );
}

export default CalibrationPage;
