import React, { useMemo, useState } from 'react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import { listUserProfiles } from '../../api/services/profilesService';
import { listEnvWasteDisposal, upsertEnvWasteDisposal } from '../../api/services/environmentService';
import { toCsv, downloadTextFile } from '../../utils/csv';

const currentYear = new Date().getFullYear();

export function EnvironmentWastePage() {
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const [year, setYear] = useState(currentYear);
  const [status, setStatus] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [responsibleUserId, setResponsibleUserId] = useState('');
  const [search, setSearch] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<any>({ refNo: '', date: new Date().toISOString().slice(0, 10), siteDepartment: '', wasteCategory: 'General waste', wasteTypeName: '', wasteClassification: 'General', quantityValue: '', quantityUnit: 'kg', storageLocation: '', disposalMethod: '', disposalSite: '', contractorName: '', contractorLicenceExpiryDate: '', facilityName: '', facilityPermitExpiryDate: '', responsibleUserId: '', responsibleExternalName: '', remarks: '', nonConformancesDeviations: [] as string[], reviewedByUserId: '', approvedByUserId: '', approvedAt: '', status: 'Draft' });

  const { data: profiles } = useAsync(async () => (activeCompanyId ? await listUserProfiles(activeCompanyId) : []), [activeCompanyId]);
  const { data: rows, loading, error, refresh } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return await listEnvWasteDisposal(activeCompanyId, { year, status, fromDate: fromDate || undefined, toDate: toDate || undefined, responsibleUserId: responsibleUserId || undefined, search });
  }, [activeCompanyId, year, status, fromDate, toDate, responsibleUserId, search, refreshKey]);

  const userLabel = useMemo(() => new Map((profiles ?? []).map((p) => [p.user_id, p.full_name || p.email || p.user_id])), [profiles]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCompanyId || !user?.id) return;
    await upsertEnvWasteDisposal({ companyId: activeCompanyId, actorUserId: user.id, actorRole: activeRole, id: editing?.id, ...form, quantityValue: Number(form.quantityValue || 0), responsibleUserId: form.responsibleUserId || null, reviewedByUserId: form.reviewedByUserId || null, approvedByUserId: form.approvedByUserId || null, approvedAt: form.approvedAt || null });
    setEditing(null);
    setForm({ refNo: '', date: new Date().toISOString().slice(0, 10), siteDepartment: '', wasteCategory: 'General waste', wasteTypeName: '', wasteClassification: 'General', quantityValue: '', quantityUnit: 'kg', storageLocation: '', disposalMethod: '', disposalSite: '', contractorName: '', contractorLicenceExpiryDate: '', facilityName: '', facilityPermitExpiryDate: '', responsibleUserId: '', responsibleExternalName: '', remarks: '', nonConformancesDeviations: [], reviewedByUserId: '', approvedByUserId: '', approvedAt: '', status: 'Draft' });
    setRefreshKey((k) => k + 1);
    await refresh();
  }

  function startEdit(row: any) {
    setEditing(row);
    setForm({ refNo: row.ref_no, date: row.date, siteDepartment: row.site_department, wasteCategory: row.waste_category, wasteTypeName: row.waste_type_name, wasteClassification: row.waste_classification, quantityValue: row.quantity_value, quantityUnit: row.quantity_unit, storageLocation: row.storage_location ?? '', disposalMethod: row.disposal_method ?? '', disposalSite: row.disposal_site ?? '', contractorName: row.contractor_name ?? '', contractorLicenceExpiryDate: row.contractor_licence_expiry_date ?? '', facilityName: row.facility_name ?? '', facilityPermitExpiryDate: row.facility_permit_expiry_date ?? '', responsibleUserId: row.responsible_user_id ?? '', responsibleExternalName: row.responsible_external_name ?? '', remarks: row.remarks ?? '', nonConformancesDeviations: row.non_conformances_deviations ?? [], reviewedByUserId: row.reviewed_by_user_id ?? '', approvedByUserId: row.approved_by_user_id ?? '', approvedAt: row.approved_at?.slice(0, 16) ?? '', status: row.status ?? 'Draft' });
  }

  const ncOptions = ['Incorrect segregation', 'Missing manifests', 'Unauthorised disposal'];

  return (
    <Layout title="Waste Disposal Register">
      <div className="space-y-4">
        <div className="bg-white border rounded-xl p-4 grid grid-cols-1 md:grid-cols-7 gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="px-3 py-2 border rounded-lg text-sm" />
          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value || currentYear))} className="px-3 py-2 border rounded-lg text-sm" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 border rounded-lg text-sm"><option value="all">All status</option><option value="Draft">Draft</option><option value="Submitted">Submitted</option><option value="Approved">Approved</option></select>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
          <select value={responsibleUserId} onChange={(e) => setResponsibleUserId(e.target.value)} className="px-3 py-2 border rounded-lg text-sm"><option value="">All responsible</option>{(profiles ?? []).map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name || p.email || p.user_id}</option>)}</select>
          <button type="button" onClick={() => downloadTextFile(`environment-waste-${new Date().toISOString().slice(0, 10)}.csv`, toCsv((rows ?? []).map((r: any) => ({ ref_no: r.ref_no, date: r.date, category: r.waste_category, type: r.waste_type_name, quantity: r.quantity_value, status: r.status }))), 'text/csv;charset=utf-8')} className="px-3 py-2 border rounded-lg text-sm hover:bg-surface-50">Export CSV</button>
        </div>

        <form onSubmit={onSave} className="bg-white border rounded-xl p-4 space-y-3">
          <p className="font-semibold text-sm">{editing ? 'Edit waste record' : 'Create waste record'}</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input value={form.refNo} onChange={(e) => setForm({ ...form, refNo: e.target.value })} placeholder="Ref no" className="px-3 py-2 border rounded-lg text-sm" required />
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" required />
            <input value={form.siteDepartment} onChange={(e) => setForm({ ...form, siteDepartment: e.target.value })} placeholder="Site/Department" className="px-3 py-2 border rounded-lg text-sm" required />
            <input value={form.wasteCategory} onChange={(e) => setForm({ ...form, wasteCategory: e.target.value })} placeholder="Waste category" className="px-3 py-2 border rounded-lg text-sm" required />
            <input value={form.wasteTypeName} onChange={(e) => setForm({ ...form, wasteTypeName: e.target.value })} placeholder="Waste type" className="px-3 py-2 border rounded-lg text-sm" required />
            <select value={form.wasteClassification} onChange={(e) => setForm({ ...form, wasteClassification: e.target.value })} className="px-3 py-2 border rounded-lg text-sm"><option value="General">General</option><option value="Hazardous">Hazardous</option></select>
            <input type="number" step="0.001" value={form.quantityValue} onChange={(e) => setForm({ ...form, quantityValue: e.target.value })} placeholder="Quantity" className="px-3 py-2 border rounded-lg text-sm" required />
            <input value={form.quantityUnit} onChange={(e) => setForm({ ...form, quantityUnit: e.target.value })} placeholder="Unit" className="px-3 py-2 border rounded-lg text-sm" required />
            <input value={form.storageLocation} onChange={(e) => setForm({ ...form, storageLocation: e.target.value })} placeholder="Storage location" className="px-3 py-2 border rounded-lg text-sm" />
            <input value={form.disposalMethod} onChange={(e) => setForm({ ...form, disposalMethod: e.target.value })} placeholder="Disposal method" className="px-3 py-2 border rounded-lg text-sm" />
            <input value={form.disposalSite} onChange={(e) => setForm({ ...form, disposalSite: e.target.value })} placeholder="Disposal site" className="px-3 py-2 border rounded-lg text-sm" />
            <input value={form.contractorName} onChange={(e) => setForm({ ...form, contractorName: e.target.value })} placeholder="Contractor name" className="px-3 py-2 border rounded-lg text-sm" />
            <input type="date" value={form.contractorLicenceExpiryDate} onChange={(e) => setForm({ ...form, contractorLicenceExpiryDate: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" placeholder="Licence expiry" />
            <input value={form.facilityName} onChange={(e) => setForm({ ...form, facilityName: e.target.value })} placeholder="Facility name" className="px-3 py-2 border rounded-lg text-sm" />
            <input type="date" value={form.facilityPermitExpiryDate} onChange={(e) => setForm({ ...form, facilityPermitExpiryDate: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" placeholder="Permit expiry" />
            <select value={form.responsibleUserId} onChange={(e) => setForm({ ...form, responsibleUserId: e.target.value })} className="px-3 py-2 border rounded-lg text-sm"><option value="">Responsible user</option>{(profiles ?? []).map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name || p.email || p.user_id}</option>)}</select>
            <input value={form.responsibleExternalName} onChange={(e) => setForm({ ...form, responsibleExternalName: e.target.value })} placeholder="Responsible external" className="px-3 py-2 border rounded-lg text-sm" />
            <select value={form.reviewedByUserId} onChange={(e) => setForm({ ...form, reviewedByUserId: e.target.value })} className="px-3 py-2 border rounded-lg text-sm"><option value="">Reviewed by</option>{(profiles ?? []).map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name || p.email || p.user_id}</option>)}</select>
            <select value={form.approvedByUserId} onChange={(e) => setForm({ ...form, approvedByUserId: e.target.value })} className="px-3 py-2 border rounded-lg text-sm"><option value="">Approved by</option>{(profiles ?? []).map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name || p.email || p.user_id}</option>)}</select>
            <input type="datetime-local" value={form.approvedAt} onChange={(e) => setForm({ ...form, approvedAt: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" />
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="px-3 py-2 border rounded-lg text-sm"><option value="Draft">Draft</option><option value="Submitted">Submitted</option><option value="Approved">Approved</option></select>
          </div>
          <textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} placeholder="Remarks/comments" className="w-full px-3 py-2 border rounded-lg text-sm" rows={2} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {ncOptions.map((opt) => <label key={opt} className="text-sm flex items-center gap-2"><input type="checkbox" checked={form.nonConformancesDeviations.includes(opt)} onChange={(e) => setForm({ ...form, nonConformancesDeviations: e.target.checked ? [...form.nonConformancesDeviations, opt] : form.nonConformancesDeviations.filter((x: string) => x !== opt) })} />{opt}</label>)}
          </div>
          <div className="flex gap-2"><button type="submit" className="px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold">{editing ? 'Update' : 'Create'}</button>{editing && <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg border text-sm">Cancel</button>}</div>
        </form>

        {error && <div className="text-sm text-critical">{String(error.message)}</div>}
        {loading ? <p className="text-sm text-charcoal-500">Loading...</p> : (
          <div className="bg-white border rounded-xl overflow-auto"><table className="w-full min-w-[1100px] text-sm"><thead className="bg-surface-50"><tr><th className="px-3 py-2 text-left">Ref</th><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Category</th><th className="px-3 py-2 text-left">Type</th><th className="px-3 py-2 text-left">Qty</th><th className="px-3 py-2 text-left">Responsible</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-left">Licence expiry</th><th className="px-3 py-2 text-left">Permit expiry</th><th className="px-3 py-2 text-left">Actions</th></tr></thead><tbody className="divide-y divide-surface-100">{(rows ?? []).map((r: any) => <tr key={r.id}><td className="px-3 py-2">{r.ref_no}</td><td className="px-3 py-2">{r.date}</td><td className="px-3 py-2">{r.waste_category}</td><td className="px-3 py-2">{r.waste_type_name}</td><td className="px-3 py-2">{r.quantity_value} {r.quantity_unit}</td><td className="px-3 py-2">{r.responsible_user_id ? (userLabel.get(r.responsible_user_id) ?? r.responsible_user_id) : (r.responsible_external_name || '-')}</td><td className="px-3 py-2">{r.status}</td><td className="px-3 py-2">{r.contractor_licence_expiry_date || '-'}</td><td className="px-3 py-2">{r.facility_permit_expiry_date || '-'}</td><td className="px-3 py-2"><button type="button" onClick={() => startEdit(r)} className="px-2 py-1 border rounded text-xs">View/Edit</button></td></tr>)}{(rows ?? []).length === 0 && <tr><td colSpan={10} className="px-3 py-6 text-center text-charcoal-500">No waste records.</td></tr>}</tbody></table></div>
        )}
      </div>
    </Layout>
  );
}
