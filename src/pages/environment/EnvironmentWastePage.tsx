import React, { useEffect, useMemo, useState } from 'react';
import { useUser } from '@insforge/react';
import { Trash2Icon } from 'lucide-react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { listHrEmployees } from '../../api/services/hrService';
import { buildEnvironmentReportCsv, downloadEnvironmentReportCsv, printEnvironmentReportPdf, renderEnvironmentReportHtml } from '../../api/services/environmentReportsService';
import { createActivityLog } from '../../api/services/activityLogService';
import { deleteEnvWasteDisposal, listEnvWasteDisposal, upsertEnvWasteDisposal, uploadEnvironmentAttachmentFiles } from '../../api/services/environmentService';
import { ListEmptyState } from '../../components/ui/ListEmptyState';
import { HrEmployeeSelect } from '../../components/ui/HrEmployeeSelect';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';
import { toUserFacingError } from '../../utils/userFacingMessage';

const currentYear = new Date().getFullYear();
const OTHER_WASTE_TYPE_VALUE = '__OTHER__';
const BASE_WASTE_TYPES = [
  'General waste (paper, packaging, food waste)',
  'Hazardous waste (chemicals, oils, paints)',
  'Construction waste (concrete, rubble, metals)',
  'Medical waste',
  'Electronic waste (E-waste)'
];

function emptyForm() {
  return {
    refNo: '',
    date: new Date().toISOString().slice(0, 10),
    siteDepartment: '',
    wasteCategory: 'General waste',
    wasteTypeName: '',
    wasteClassification: 'General',
    quantityValue: '',
    quantityUnit: 'kg',
    storageLocation: '',
    disposalMethod: '',
    disposalSite: '',
    contractorName: '',
    contractorLicenceExpiryDate: '',
    facilityName: '',
    facilityPermitExpiryDate: '',
    responsibleEmployeeId: '',
    responsibleUserId: '',
    responsibleNameSnapshot: '',
    responsibleExternalName: '',
    remarks: '',
    nonConformancesDeviations: [] as string[],
    reviewedByEmployeeId: '',
    reviewedByUserId: '',
    reviewedByNameSnapshot: '',
    approvedByEmployeeId: '',
    approvedByUserId: '',
    approvedByNameSnapshot: '',
    approvedAt: '',
    status: 'Draft',
    disposalStatus: 'Open',
    customWasteType: ''
  };
}

export function EnvironmentWastePage() {
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const [year, setYear] = useState(currentYear);
  const [status, setStatus] = useState('all');
  const [disposalStatusFilter, setDisposalStatusFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [responsibleEmployeeFilter, setResponsibleEmployeeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [editing, setEditing] = useState<any | null>(null);
  const [message, setMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const [contractorLicenceFiles, setContractorLicenceFiles] = useState<File[]>([]);
  const [facilityPermitFiles, setFacilityPermitFiles] = useState<File[]>([]);
  const [form, setForm] = useState<any>(emptyForm());

  const { restoreDraft, clearDraft } = useDraftManager();
  const draftKey = `env-waste:${activeCompanyId ?? 'none'}:${user?.id ?? 'anon'}:${editing?.id ?? 'new'}`;
  const [formBaseline, setFormBaseline] = useState<any>(() => form);

  useDraftRegistration({
    key: draftKey,
    enabled: Boolean(activeCompanyId && user?.id),
    isDirty: () => JSON.stringify(form) !== JSON.stringify(formBaseline),
    serialize: () => form
  });

  useEffect(() => {
    if (!activeCompanyId || !user?.id) return;
    const restored = restoreDraft<any>(draftKey);
    if (!restored) return;
    setForm(restored);
    setFormBaseline(restored);
  }, [activeCompanyId, draftKey, restoreDraft, user?.id]);

  const { data: employees } = useAsync(async () => (activeCompanyId ? await listHrEmployees(activeCompanyId) : []), [activeCompanyId]);
  const { data: rows, loading, error, refetch } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return await listEnvWasteDisposal(activeCompanyId, {
      year,
      status,
      disposalStatus: disposalStatusFilter,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      search
    });
  }, [activeCompanyId, year, status, disposalStatusFilter, fromDate, toDate, search, refreshKey]);

  const filteredRows = useMemo(() => {
    if (!responsibleEmployeeFilter) return rows ?? [];
    return (rows ?? []).filter(
      (row: any) =>
        String(row.responsible_employee_id ?? '') === String(responsibleEmployeeFilter) ||
        String(row.responsible_user_id ?? '') ===
          String((employees ?? []).find((employee) => employee.id === responsibleEmployeeFilter)?.user_id ?? '')
    );
  }, [employees, responsibleEmployeeFilter, rows]);

  const employeeNameById = useMemo(
    () =>
      new Map(
        (employees ?? []).map((employee) => [
          employee.id,
          `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim() || employee.email || employee.employee_no
        ])
      ),
    [employees]
  );

  const wasteTypeOptions = useMemo(() => {
    const existingTypes = Array.from(
      new Set((rows ?? []).map((row: any) => String(row.waste_type_name ?? '').trim()).filter(Boolean))
    );
    const merged = [...BASE_WASTE_TYPES];
    existingTypes.forEach((type) => {
      if (!merged.includes(type)) merged.push(type);
    });
    return merged;
  }, [rows]);

  const isClosed = !!editing && editing.disposal_status === 'Correctly Disposed';
  const ncOptions = ['Incorrect segregation', 'Missing manifests', 'Unauthorised disposal'];

  function resetForm() {
    setEditing(null);
    setContractorLicenceFiles([]);
    setFacilityPermitFiles([]);
    const next = emptyForm();
    setForm(next);
    setFormBaseline(next);
  }

  function startEdit(row: any) {
    const next = {
      refNo: row.ref_no,
      date: row.date,
      siteDepartment: row.site_department,
      wasteCategory: row.waste_category,
      wasteTypeName: row.waste_type_name,
      wasteClassification: row.waste_classification,
      quantityValue: row.quantity_value,
      quantityUnit: row.quantity_unit,
      storageLocation: row.storage_location ?? '',
      disposalMethod: row.disposal_method ?? '',
      disposalSite: row.disposal_site ?? '',
      contractorName: row.contractor_name ?? '',
      contractorLicenceExpiryDate: row.contractor_licence_expiry_date ?? '',
      facilityName: row.facility_name ?? '',
      facilityPermitExpiryDate: row.facility_permit_expiry_date ?? '',
      responsibleEmployeeId: row.responsible_employee_id ?? '',
      responsibleUserId: row.responsible_user_id ?? '',
      responsibleNameSnapshot: row.responsible_name_snapshot ?? '',
      responsibleExternalName: row.responsible_external_name ?? '',
      remarks: row.remarks ?? '',
      nonConformancesDeviations: row.non_conformances_deviations ?? [],
      reviewedByEmployeeId: row.reviewed_by_employee_id ?? '',
      reviewedByUserId: row.reviewed_by_user_id ?? '',
      reviewedByNameSnapshot: row.reviewed_by_name_snapshot ?? '',
      approvedByEmployeeId: row.approved_by_employee_id ?? '',
      approvedByUserId: row.approved_by_user_id ?? '',
      approvedByNameSnapshot: row.approved_by_name_snapshot ?? '',
      approvedAt: row.approved_at?.slice(0, 16) ?? '',
      status: row.status ?? 'Draft',
      disposalStatus: row.disposal_status ?? 'Open',
      customWasteType: row.custom_waste_type ?? ''
    };
    setEditing(row);
    setForm(next);
    setFormBaseline(next);
    setContractorLicenceFiles([]);
    setFacilityPermitFiles([]);
    setMessage('');
    document.getElementById('env-waste-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCompanyId || !user?.id) return;
    setSaveError('');

    let wasteTypeName = form.wasteTypeName;
    let customWasteType = form.customWasteType;
    if (wasteTypeName === OTHER_WASTE_TYPE_VALUE) {
      customWasteType = String(customWasteType ?? '').trim();
      if (!customWasteType) return;
      wasteTypeName = customWasteType;
    } else {
      customWasteType = '';
    }

    try {
      const saved = await upsertEnvWasteDisposal({
        companyId: activeCompanyId,
        actorUserId: user.id,
        actorRole: activeRole,
        id: editing?.id,
        ...form,
        wasteTypeName,
        customWasteType,
        quantityValue: Number(form.quantityValue || 0),
        responsibleEmployeeId: form.responsibleEmployeeId || null,
        responsibleUserId: form.responsibleUserId || null,
        responsibleNameSnapshot: form.responsibleNameSnapshot || form.responsibleExternalName || null,
        responsibleExternalName:
          form.responsibleEmployeeId || form.responsibleUserId ? null : form.responsibleExternalName || null,
        reviewedByEmployeeId: form.reviewedByEmployeeId || null,
        reviewedByUserId: form.reviewedByUserId || null,
        reviewedByNameSnapshot: form.reviewedByNameSnapshot || null,
        approvedByEmployeeId: form.approvedByEmployeeId || null,
        approvedByUserId: form.approvedByUserId || null,
        approvedByNameSnapshot: form.approvedByNameSnapshot || null,
        approvedAt: form.approvedAt || null
      });

      if (contractorLicenceFiles.length > 0 || facilityPermitFiles.length > 0) {
        await uploadEnvironmentAttachmentFiles({
          companyId: activeCompanyId,
          table: 'env_waste_disposal',
          entityType: 'env_waste_disposal',
          recordId: saved.id,
          actorUserId: user.id,
          groups: [
            { field: 'contractor_licence_file_ids', files: contractorLicenceFiles, fileKind: 'contractor_licence', titlePrefix: 'Contractor licence' },
            { field: 'facility_permit_file_ids', files: facilityPermitFiles, fileKind: 'facility_permit', titlePrefix: 'Facility permit' }
          ]
        });
      }

      clearDraft(draftKey);
      setMessage(editing ? `Waste record ${saved.ref_no} updated.` : `Waste record ${saved.ref_no} created.`);
      resetForm();
      setRefreshKey((key) => key + 1);
      await refetch();
    } catch (err) {
      setSaveError(toUserFacingError(err, 'Unable to save waste disposal record. Please try again.'));
    }
  }

  async function handleDelete(row: { id: string; ref_no: string }) {
    if (!activeCompanyId || !user?.id) return;
    if (!window.confirm('Delete this waste disposal record?')) return;
    setSaveError('');
    try {
      await deleteEnvWasteDisposal({
        companyId: activeCompanyId,
        recordId: row.id,
        actorUserId: user.id,
        actorRole: activeRole
      });
      if (String(editing?.id ?? '') === String(row.id)) resetForm();
      setMessage(`Waste record ${row.ref_no} deleted.`);
      setRefreshKey((key) => key + 1);
      await refetch();
    } catch (err) {
      setSaveError(toUserFacingError(err, 'Unable to delete waste disposal record. Please try again.'));
    }
  }

  async function exportRegister(mode: 'csv' | 'pdf') {
    if (!activeCompanyId || !user?.id) return;
    const version = 1;
    if (mode === 'csv') {
      downloadEnvironmentReportCsv(
        `environment-waste-${new Date().toISOString().slice(0, 10)}.csv`,
        buildEnvironmentReportCsv('waste', filteredRows, version)
      );
    } else {
      printEnvironmentReportPdf(renderEnvironmentReportHtml('waste', filteredRows, version));
    }
    await createActivityLog({
      companyId: activeCompanyId,
      actorUserId: user.id,
      action: `reports.generate.environment.waste.${mode}`,
      entityType: 'report',
      metadata: { format: mode.toUpperCase(), rowCount: filteredRows.length, version }
    });
  }

  return (
    <Layout title="Waste Disposal Register">
      <div className="space-y-4">
        {message && <div className="rounded-xl border border-success/30 bg-success/5 p-3 text-sm text-success">{message}</div>}
        {saveError && <div className="rounded-xl border border-critical/30 bg-critical/5 p-3 text-sm text-critical">{saveError}</div>}

        <div className="bg-white border rounded-xl p-4 grid grid-cols-1 md:grid-cols-8 gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="px-3 py-2 border rounded-lg text-sm" />
          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value || currentYear))} className="px-3 py-2 border rounded-lg text-sm" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 border rounded-lg text-sm"><option value="all">All status</option><option value="Draft">Draft</option><option value="Submitted">Submitted</option><option value="Approved">Approved</option></select>
          <select value={disposalStatusFilter} onChange={(e) => setDisposalStatusFilter(e.target.value)} className="px-3 py-2 border rounded-lg text-sm"><option value="all">All disposal</option><option value="Open">Open</option><option value="Pending Disposal">Pending Disposal</option><option value="Correctly Disposed">Correctly Disposed</option></select>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
          <select value={responsibleEmployeeFilter} onChange={(e) => setResponsibleEmployeeFilter(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
            <option value="">All responsible</option>
            {(employees ?? []).map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.employee_no} - {`${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim()}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void exportRegister('csv')} className="px-3 py-2 border rounded-lg text-sm hover:bg-surface-50">Export Excel/CSV</button>
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={() => void exportRegister('pdf')} className="px-3 py-2 border rounded-lg text-sm hover:bg-surface-50">Export PDF</button>
        </div>

        <form id="env-waste-form" onSubmit={onSave} className="bg-white border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-sm">{editing ? 'Edit waste record' : 'Create waste record'}</p>
            <button type="button" onClick={resetForm} className="px-3 py-2 rounded-lg border text-sm hover:bg-surface-50">New Record</button>
          </div>

          {isClosed && <div className="text-xs text-critical bg-critical-50 border border-critical-100 rounded-lg px-3 py-2">This waste record has been correctly disposed and is closed for editing.</div>}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input value={form.refNo} onChange={(e) => setForm({ ...form, refNo: e.target.value })} placeholder="Ref no" className="px-3 py-2 border rounded-lg text-sm" required disabled={isClosed} />
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" required disabled={isClosed} />
            <input value={form.siteDepartment} onChange={(e) => setForm({ ...form, siteDepartment: e.target.value })} placeholder="Site/Department" className="px-3 py-2 border rounded-lg text-sm" required disabled={isClosed} />
            <input value={form.wasteCategory} onChange={(e) => setForm({ ...form, wasteCategory: e.target.value })} placeholder="Waste category" className="px-3 py-2 border rounded-lg text-sm" required disabled={isClosed} />
            <select value={form.wasteTypeName} onChange={(e) => setForm({ ...form, wasteTypeName: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" required disabled={isClosed}>
              <option value="">Select waste type</option>
              {wasteTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
              <option value={OTHER_WASTE_TYPE_VALUE}>Other - Add new waste type</option>
            </select>
            {form.wasteTypeName === OTHER_WASTE_TYPE_VALUE && <input value={form.customWasteType} onChange={(e) => setForm({ ...form, customWasteType: e.target.value })} placeholder="New waste type" className="px-3 py-2 border rounded-lg text-sm" required disabled={isClosed} />}
            <select value={form.wasteClassification} onChange={(e) => setForm({ ...form, wasteClassification: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" disabled={isClosed}><option value="General">General</option><option value="Hazardous">Hazardous</option></select>
            <input type="number" step="0.001" value={form.quantityValue} onChange={(e) => setForm({ ...form, quantityValue: e.target.value })} placeholder="Quantity" className="px-3 py-2 border rounded-lg text-sm" required disabled={isClosed} />
            <input value={form.quantityUnit} onChange={(e) => setForm({ ...form, quantityUnit: e.target.value })} placeholder="Unit" className="px-3 py-2 border rounded-lg text-sm" required disabled={isClosed} />
            <input value={form.storageLocation} onChange={(e) => setForm({ ...form, storageLocation: e.target.value })} placeholder="Storage location" className="px-3 py-2 border rounded-lg text-sm" disabled={isClosed} />
            <input value={form.disposalMethod} onChange={(e) => setForm({ ...form, disposalMethod: e.target.value })} placeholder="Disposal method" className="px-3 py-2 border rounded-lg text-sm" disabled={isClosed} />
            <input value={form.disposalSite} onChange={(e) => setForm({ ...form, disposalSite: e.target.value })} placeholder="Disposal site" className="px-3 py-2 border rounded-lg text-sm" disabled={isClosed} />
            <input value={form.contractorName} onChange={(e) => setForm({ ...form, contractorName: e.target.value })} placeholder="Contractor name" className="px-3 py-2 border rounded-lg text-sm" disabled={isClosed} />
            <label className="block text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Contractor Licence Expiry Date</span>
              <input type="date" value={form.contractorLicenceExpiryDate} onChange={(e) => setForm({ ...form, contractorLicenceExpiryDate: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" disabled={isClosed} />
            </label>
            <input value={form.facilityName} onChange={(e) => setForm({ ...form, facilityName: e.target.value })} placeholder="Facility name" className="px-3 py-2 border rounded-lg text-sm" disabled={isClosed} />
            <label className="block text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Facility Permit Expiry Date</span>
              <input type="date" value={form.facilityPermitExpiryDate} onChange={(e) => setForm({ ...form, facilityPermitExpiryDate: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" disabled={isClosed} />
            </label>
            <HrEmployeeSelect companyId={activeCompanyId} value={form.responsibleEmployeeId} valueField="id" placeholder="Responsible employee" label="Responsible employee" disabled={isClosed} onChange={(selectedValue, meta) => setForm((current: any) => ({ ...current, responsibleEmployeeId: selectedValue, responsibleUserId: meta.userId ?? '', responsibleNameSnapshot: meta.nameSnapshot ?? '', responsibleExternalName: '' }))} />
            <label className="block text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Responsible external name</span>
              <input value={form.responsibleExternalName} onChange={(e) => setForm({ ...form, responsibleExternalName: e.target.value, responsibleEmployeeId: '', responsibleUserId: '', responsibleNameSnapshot: '' })} placeholder="Use only when not in HR" className="w-full px-3 py-2 border rounded-lg text-sm" disabled={isClosed} />
            </label>
            <HrEmployeeSelect companyId={activeCompanyId} value={form.reviewedByEmployeeId} valueField="id" placeholder="Reviewed by" label="Reviewed by" disabled={isClosed} onChange={(selectedValue, meta) => setForm((current: any) => ({ ...current, reviewedByEmployeeId: selectedValue, reviewedByUserId: meta.userId ?? '', reviewedByNameSnapshot: meta.nameSnapshot ?? '' }))} />
            <HrEmployeeSelect companyId={activeCompanyId} value={form.approvedByEmployeeId} valueField="id" placeholder="Approved by" label="Approved by" disabled={isClosed} onChange={(selectedValue, meta) => setForm((current: any) => ({ ...current, approvedByEmployeeId: selectedValue, approvedByUserId: meta.userId ?? '', approvedByNameSnapshot: meta.nameSnapshot ?? '' }))} />
            <input type="datetime-local" value={form.approvedAt} onChange={(e) => setForm({ ...form, approvedAt: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" disabled={isClosed} />
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" disabled={isClosed}><option value="Draft">Draft</option><option value="Submitted">Submitted</option><option value="Approved">Approved</option></select>
            <select value={form.disposalStatus} onChange={(e) => setForm({ ...form, disposalStatus: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" disabled={isClosed}><option value="Open">Open</option><option value="Pending Disposal">Pending Disposal</option><option value="Correctly Disposed">Correctly Disposed</option></select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Contractor licence upload</span>
              <input type="file" multiple onChange={(e) => setContractorLicenceFiles(Array.from(e.target.files ?? []))} className="w-full text-sm" disabled={isClosed} />
              <span className="block text-xs text-charcoal-400 mt-1">Existing licences: {editing?.contractor_licence_file_ids?.length ?? 0}</span>
            </label>
            <label className="block text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Facility permit upload</span>
              <input type="file" multiple onChange={(e) => setFacilityPermitFiles(Array.from(e.target.files ?? []))} className="w-full text-sm" disabled={isClosed} />
              <span className="block text-xs text-charcoal-400 mt-1">Existing permits: {editing?.facility_permit_file_ids?.length ?? 0}</span>
            </label>
          </div>

          <textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} placeholder="Remarks/comments" className="w-full px-3 py-2 border rounded-lg text-sm" rows={2} disabled={isClosed} />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {ncOptions.map((option) => (
              <label key={option} className="text-sm flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.nonConformancesDeviations.includes(option)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      nonConformancesDeviations: e.target.checked
                        ? [...form.nonConformancesDeviations, option]
                        : form.nonConformancesDeviations.filter((item: string) => item !== option)
                    })
                  }
                  disabled={isClosed}
                />
                {option}
              </label>
            ))}
          </div>

          <div className="flex gap-2">
            {!isClosed && <button type="submit" className="px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold">{editing ? 'Update' : 'Create'}</button>}
            {editing && <button type="button" onClick={resetForm} className="px-4 py-2 rounded-lg border text-sm">Cancel</button>}
          </div>
        </form>

        {error && <div className="rounded-xl border border-critical/30 bg-critical/5 p-3 text-sm text-critical">{toUserFacingError(error, 'Unable to load waste disposal records.')}</div>}
        {loading && <div className="text-center py-8 text-sm text-charcoal-500">Loading waste disposal records…</div>}
        {!loading && (
          <div className="bg-white border rounded-xl overflow-auto">
            <table className="w-full min-w-[1150px] text-sm">
              <thead className="bg-surface-50">
                <tr>
                  <th className="px-3 py-2 text-left">Ref</th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Category</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Qty</th>
                  <th className="px-3 py-2 text-left">Responsible</th>
                  <th className="px-3 py-2 text-left">Workflow status</th>
                  <th className="px-3 py-2 text-left">Disposal status</th>
                  <th className="px-3 py-2 text-left">Licence expiry</th>
                  <th className="px-3 py-2 text-left">Permit expiry</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {filteredRows.map((row: any) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2">{row.ref_no}</td>
                    <td className="px-3 py-2">{row.date}</td>
                    <td className="px-3 py-2">{row.waste_category}</td>
                    <td className="px-3 py-2">{row.waste_type_name}</td>
                    <td className="px-3 py-2">{row.quantity_value} {row.quantity_unit}</td>
                    <td className="px-3 py-2">{row.responsible_name_snapshot || employeeNameById.get(row.responsible_employee_id) || row.responsible_external_name || row.responsible_user_id || '-'}</td>
                    <td className="px-3 py-2">{row.status}</td>
                    <td className="px-3 py-2">{row.disposal_status || 'Open'}</td>
                    <td className="px-3 py-2">{row.contractor_licence_expiry_date || '-'}</td>
                    <td className="px-3 py-2">{row.facility_permit_expiry_date || '-'}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button type="button" onClick={() => startEdit(row)} className="px-2 py-1 border rounded text-xs">View/Edit</button>
                        <button type="button" onClick={() => void handleDelete(row)} className="px-2 py-1 border border-critical/30 text-critical rounded text-xs">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <ListEmptyState
                    tableColSpan={11}
                    icon={Trash2Icon}
                    title="No waste disposal records"
                    description="Track waste types, quantities, storage, contractors, and disposal evidence in one register."
                    primaryAction={{ kind: 'button', label: 'Go to create form', onClick: () => document.getElementById('env-waste-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}
                  />
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
