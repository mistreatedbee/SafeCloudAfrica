import React, { useMemo, useState } from 'react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import { listUserProfiles } from '../../api/services/profilesService';
import { listEnvWasteDisposal, upsertEnvWasteDisposal } from '../../api/services/environmentService';
import { toCsv, downloadTextFile } from '../../utils/csv';
import { ListEmptyState } from '../../components/ui/ListEmptyState';
import { Trash2Icon } from 'lucide-react';

const currentYear = new Date().getFullYear();
const OTHER_WASTE_TYPE_VALUE = '__OTHER__';

const BASE_WASTE_TYPES: string[] = [
  'General waste (paper, packaging, food waste)',
  'Hazardous waste (chemicals, oils, paints)',
  'Construction waste (concrete, rubble, metals)',
  'Medical waste',
  'Electronic waste (E-waste)'
];

export function EnvironmentWastePage() {
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const [year, setYear] = useState(currentYear);
  const [status, setStatus] = useState('all');
  const [disposalStatusFilter, setDisposalStatusFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [responsibleUserId, setResponsibleUserId] = useState('');
  const [search, setSearch] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<any>({
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
    responsibleUserId: '',
    responsibleExternalName: '',
    remarks: '',
    nonConformancesDeviations: [] as string[],
    reviewedByUserId: '',
    approvedByUserId: '',
    approvedAt: '',
    status: 'Draft',
    disposalStatus: 'Open',
    customWasteType: ''
  });

  const { data: profiles } = useAsync(async () => (activeCompanyId ? await listUserProfiles(activeCompanyId) : []), [activeCompanyId]);
  const { data: rows, loading, error, refetch } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return await listEnvWasteDisposal(activeCompanyId, {
      year,
      status,
      disposalStatus: disposalStatusFilter,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      responsibleUserId: responsibleUserId || undefined,
      search
    });
  }, [activeCompanyId, year, status, disposalStatusFilter, fromDate, toDate, responsibleUserId, search, refreshKey]);

  const userLabel = useMemo(() => new Map((profiles ?? []).map((p) => [p.user_id, p.full_name || p.email || p.user_id])), [profiles]);

  const wasteTypeOptions = useMemo(() => {
    const existingTypes = Array.from(
      new Set(
        (rows ?? [])
          .map((r: any) => String(r.waste_type_name ?? '').trim())
          .filter((v) => !!v)
      )
    );
    const merged = [...BASE_WASTE_TYPES];
    existingTypes.forEach((t) => {
      if (!merged.includes(t)) merged.push(t);
    });
    return merged;
  }, [rows]);

  const isClosed = !!editing && editing.disposal_status === 'Correctly Disposed';

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCompanyId || !user?.id) return;
    let wasteTypeName = form.wasteTypeName;
    let customWasteType = form.customWasteType;
    if (wasteTypeName === OTHER_WASTE_TYPE_VALUE) {
      customWasteType = String(customWasteType ?? '').trim();
      if (!customWasteType) {
        return;
      }
      wasteTypeName = customWasteType;
    } else {
      customWasteType = '';
    }

    await upsertEnvWasteDisposal({
      companyId: activeCompanyId,
      actorUserId: user.id,
      actorRole: activeRole,
      id: editing?.id,
      ...form,
      wasteTypeName,
      customWasteType,
      quantityValue: Number(form.quantityValue || 0),
      responsibleUserId: form.responsibleUserId || null,
      reviewedByUserId: form.reviewedByUserId || null,
      approvedByUserId: form.approvedByUserId || null,
      approvedAt: form.approvedAt || null
    });
    setEditing(null);
    setForm({
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
      responsibleUserId: '',
      responsibleExternalName: '',
      remarks: '',
      nonConformancesDeviations: [],
      reviewedByUserId: '',
      approvedByUserId: '',
      approvedAt: '',
      status: 'Draft',
      disposalStatus: 'Open',
      customWasteType: ''
    });
    setRefreshKey((k) => k + 1);
    await refetch();
  }

  function startEdit(row: any) {
    setEditing(row);
    setForm({
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
      responsibleUserId: row.responsible_user_id ?? '',
      responsibleExternalName: row.responsible_external_name ?? '',
      remarks: row.remarks ?? '',
      nonConformancesDeviations: row.non_conformances_deviations ?? [],
      reviewedByUserId: row.reviewed_by_user_id ?? '',
      approvedByUserId: row.approved_by_user_id ?? '',
      approvedAt: row.approved_at?.slice(0, 16) ?? '',
      status: row.status ?? 'Draft',
      disposalStatus: row.disposal_status ?? 'Open',
      customWasteType: row.custom_waste_type ?? ''
    });
  }

  const ncOptions = ['Incorrect segregation', 'Missing manifests', 'Unauthorised disposal'];

  return (
    <Layout title="Waste Disposal Register">
      <div className="space-y-4">
        <div className="bg-white border rounded-xl p-4 grid grid-cols-1 md:grid-cols-8 gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="px-3 py-2 border rounded-lg text-sm" />
          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value || currentYear))} className="px-3 py-2 border rounded-lg text-sm" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 border rounded-lg text-sm"><option value="all">All status</option><option value="Draft">Draft</option><option value="Submitted">Submitted</option><option value="Approved">Approved</option></select>
          <select value={disposalStatusFilter} onChange={(e) => setDisposalStatusFilter(e.target.value)} className="px-3 py-2 border rounded-lg text-sm"><option value="all">All disposal</option><option value="Open">Open</option><option value="Pending Disposal">Pending Disposal</option><option value="Correctly Disposed">Correctly Disposed</option></select>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
          <select value={responsibleUserId} onChange={(e) => setResponsibleUserId(e.target.value)} className="px-3 py-2 border rounded-lg text-sm"><option value="">All responsible</option>{(profiles ?? []).map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name || p.email || p.user_id}</option>)}</select>
          <button
            type="button"
            onClick={() =>
              downloadTextFile(
                `environment-waste-${new Date().toISOString().slice(0, 10)}.csv`,
                toCsv(
                  (rows ?? []).map((r: any) => ({
                    ref_no: r.ref_no,
                    date: r.date,
                    category: r.waste_category,
                    type: r.waste_type_name,
                    quantity: r.quantity_value,
                    status: r.status,
                    disposal_status: r.disposal_status
                  }))
                ),
                'text/csv;charset=utf-8'
              )
            }
            className="px-3 py-2 border rounded-lg text-sm hover:bg-surface-50"
          >
            Export CSV
          </button>
        </div>

        <form id="env-waste-form" onSubmit={onSave} className="bg-white border rounded-xl p-4 space-y-3">
          <p className="font-semibold text-sm">{editing ? 'Edit waste record' : 'Create waste record'}</p>
          {isClosed && (
            <div className="text-xs text-critical bg-critical-50 border border-critical-100 rounded-lg px-3 py-2">
              This waste record has been correctly disposed and is closed for editing.
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input value={form.refNo} onChange={(e) => setForm({ ...form, refNo: e.target.value })} placeholder="Ref no" className="px-3 py-2 border rounded-lg text-sm" required disabled={isClosed} />
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" required disabled={isClosed} />
            <input value={form.siteDepartment} onChange={(e) => setForm({ ...form, siteDepartment: e.target.value })} placeholder="Site/Department" className="px-3 py-2 border rounded-lg text-sm" required disabled={isClosed} />
            <input value={form.wasteCategory} onChange={(e) => setForm({ ...form, wasteCategory: e.target.value })} placeholder="Waste category" className="px-3 py-2 border rounded-lg text-sm" required disabled={isClosed} />
            <select
              value={form.wasteTypeName}
              onChange={(e) => setForm({ ...form, wasteTypeName: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm"
              required
              disabled={isClosed}
            >
              <option value="">Select waste type</option>
              {wasteTypeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
              <option value={OTHER_WASTE_TYPE_VALUE}>Other – Add new waste type</option>
            </select>
            {form.wasteTypeName === OTHER_WASTE_TYPE_VALUE && (
              <input
                value={form.customWasteType}
                onChange={(e) => setForm({ ...form, customWasteType: e.target.value })}
                placeholder="New waste type"
                className="px-3 py-2 border rounded-lg text-sm"
                required
                disabled={isClosed}
              />
            )}
            <select
              value={form.wasteClassification}
              onChange={(e) => setForm({ ...form, wasteClassification: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm"
              disabled={isClosed}
            >
              <option value="General">General</option>
              <option value="Hazardous">Hazardous</option>
            </select>
            <input
              type="number"
              step="0.001"
              value={form.quantityValue}
              onChange={(e) => setForm({ ...form, quantityValue: e.target.value })}
              placeholder="Quantity"
              className="px-3 py-2 border rounded-lg text-sm"
              required
              disabled={isClosed}
            />
            <input
              value={form.quantityUnit}
              onChange={(e) => setForm({ ...form, quantityUnit: e.target.value })}
              placeholder="Unit"
              className="px-3 py-2 border rounded-lg text-sm"
              required
              disabled={isClosed}
            />
            <input
              value={form.storageLocation}
              onChange={(e) => setForm({ ...form, storageLocation: e.target.value })}
              placeholder="Storage location"
              className="px-3 py-2 border rounded-lg text-sm"
              disabled={isClosed}
            />
            <input
              value={form.disposalMethod}
              onChange={(e) => setForm({ ...form, disposalMethod: e.target.value })}
              placeholder="Disposal method"
              className="px-3 py-2 border rounded-lg text-sm"
              disabled={isClosed}
            />
            <input
              value={form.disposalSite}
              onChange={(e) => setForm({ ...form, disposalSite: e.target.value })}
              placeholder="Disposal site"
              className="px-3 py-2 border rounded-lg text-sm"
              disabled={isClosed}
            />
            <input
              value={form.contractorName}
              onChange={(e) => setForm({ ...form, contractorName: e.target.value })}
              placeholder="Contractor name"
              className="px-3 py-2 border rounded-lg text-sm"
              disabled={isClosed}
            />
            <input
              type="date"
              value={form.contractorLicenceExpiryDate}
              onChange={(e) => setForm({ ...form, contractorLicenceExpiryDate: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm"
              placeholder="Licence expiry"
              disabled={isClosed}
            />
            <input
              value={form.facilityName}
              onChange={(e) => setForm({ ...form, facilityName: e.target.value })}
              placeholder="Facility name"
              className="px-3 py-2 border rounded-lg text-sm"
              disabled={isClosed}
            />
            <input
              type="date"
              value={form.facilityPermitExpiryDate}
              onChange={(e) => setForm({ ...form, facilityPermitExpiryDate: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm"
              placeholder="Permit expiry"
              disabled={isClosed}
            />
            <select
              value={form.responsibleUserId}
              onChange={(e) => setForm({ ...form, responsibleUserId: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm"
              disabled={isClosed}
            >
              <option value="">Responsible user</option>
              {(profiles ?? []).map((p) => (
                <option key={p.user_id} value={p.user_id}>
                  {p.full_name || p.email || p.user_id}
                </option>
              ))}
            </select>
            <input
              value={form.responsibleExternalName}
              onChange={(e) => setForm({ ...form, responsibleExternalName: e.target.value })}
              placeholder="Responsible external"
              className="px-3 py-2 border rounded-lg text-sm"
              disabled={isClosed}
            />
            <select
              value={form.reviewedByUserId}
              onChange={(e) => setForm({ ...form, reviewedByUserId: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm"
              disabled={isClosed}
            >
              <option value="">Reviewed by</option>
              {(profiles ?? []).map((p) => (
                <option key={p.user_id} value={p.user_id}>
                  {p.full_name || p.email || p.user_id}
                </option>
              ))}
            </select>
            <select
              value={form.approvedByUserId}
              onChange={(e) => setForm({ ...form, approvedByUserId: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm"
              disabled={isClosed}
            >
              <option value="">Approved by</option>
              {(profiles ?? []).map((p) => (
                <option key={p.user_id} value={p.user_id}>
                  {p.full_name || p.email || p.user_id}
                </option>
              ))}
            </select>
            <input
              type="datetime-local"
              value={form.approvedAt}
              onChange={(e) => setForm({ ...form, approvedAt: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm"
              disabled={isClosed}
            />
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm"
              disabled={isClosed}
            >
              <option value="Draft">Draft</option>
              <option value="Submitted">Submitted</option>
              <option value="Approved">Approved</option>
            </select>
            <select
              value={form.disposalStatus}
              onChange={(e) => setForm({ ...form, disposalStatus: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm"
              disabled={isClosed}
            >
              <option value="Open">Open</option>
              <option value="Pending Disposal">Pending Disposal</option>
              <option value="Correctly Disposed">Correctly Disposed</option>
            </select>
          </div>
          <textarea
            value={form.remarks}
            onChange={(e) => setForm({ ...form, remarks: e.target.value })}
            placeholder="Remarks/comments"
            className="w-full px-3 py-2 border rounded-lg text-sm"
            rows={2}
            disabled={isClosed}
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {ncOptions.map((opt) => (
              <label key={opt} className="text-sm flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.nonConformancesDeviations.includes(opt)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      nonConformancesDeviations: e.target.checked
                        ? [...form.nonConformancesDeviations, opt]
                        : form.nonConformancesDeviations.filter((x: string) => x !== opt)
                    })
                  }
                  disabled={isClosed}
                />
                {opt}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            {!isClosed && (
              <button type="submit" className="px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold">
                {editing ? 'Update' : 'Create'}
              </button>
            )}
            {editing && (
              <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg border text-sm">
                Cancel
              </button>
            )}
          </div>
        </form>

        {error && <div className="text-sm text-critical">{String(error.message)}</div>}
        {loading ? (
          <p className="text-sm text-charcoal-500">Loading...</p>
        ) : (
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
                {(rows ?? []).map((r: any) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2">{r.ref_no}</td>
                    <td className="px-3 py-2">{r.date}</td>
                    <td className="px-3 py-2">{r.waste_category}</td>
                    <td className="px-3 py-2">{r.waste_type_name}</td>
                    <td className="px-3 py-2">
                      {r.quantity_value} {r.quantity_unit}
                    </td>
                    <td className="px-3 py-2">
                      {r.responsible_user_id
                        ? userLabel.get(r.responsible_user_id) ?? r.responsible_user_id
                        : r.responsible_external_name || '-'}
                    </td>
                    <td className="px-3 py-2">{r.status}</td>
                    <td className="px-3 py-2">
                      {r.disposal_status === 'Correctly Disposed' ? (
                        <span className="inline-flex items-center rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">
                          Correctly Disposed
                        </span>
                      ) : (
                        r.disposal_status || 'Open'
                      )}
                    </td>
                    <td className="px-3 py-2">{r.contractor_licence_expiry_date || '-'}</td>
                    <td className="px-3 py-2">{r.facility_permit_expiry_date || '-'}</td>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => startEdit(r)} className="px-2 py-1 border rounded text-xs">
                        View/Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {(rows ?? []).length === 0 && (
                  <ListEmptyState
                    tableColSpan={11}
                    icon={Trash2Icon}
                    title="No waste disposal records"
                    description="Track waste types, quantities, storage, contractors, and disposal evidence in one register."
                    primaryAction={{
                      kind: 'button',
                      label: 'Go to create form',
                      onClick: () => document.getElementById('env-waste-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }}
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
