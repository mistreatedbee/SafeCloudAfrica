import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { PlusIcon, PencilIcon, TrashIcon, DownloadIcon } from 'lucide-react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import {
  listOperationalInputsMonthly,
  upsertOperationalInputsMonthly,
  getOperationalInputsForMonth
} from '../../api/services/operationalInputsService';
import type { OperationalInputsMonthly } from '../../api/models/entities';
import { toCsv, downloadTextFile } from '../../utils/csv';

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function OperationalInputsFormModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  userId: string;
  existing: OperationalInputsMonthly | null;
  onSaved: () => void;
}) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [totalDeliveries, setTotalDeliveries] = useState<string>(props.existing?.total_deliveries != null ? String(props.existing.total_deliveries) : '');
  const [totalItemsInspected, setTotalItemsInspected] = useState<string>(props.existing?.total_items_inspected != null ? String(props.existing.total_items_inspected) : '');
  const [productionOutput, setProductionOutput] = useState<string>(props.existing?.production_output != null ? String(props.existing.production_output) : '');
  const [totalEnergyUsed, setTotalEnergyUsed] = useState<string>(props.existing?.total_energy_used != null ? String(props.existing.total_energy_used) : '');
  const [recycledWaste, setRecycledWaste] = useState<string>(props.existing?.recycled_waste != null ? String(props.existing.recycled_waste) : '');
  const [totalWasteGenerated, setTotalWasteGenerated] = useState<string>(props.existing?.total_waste_generated != null ? String(props.existing.total_waste_generated) : '');
  const [ppeObserved, setPpeObserved] = useState<string>(props.existing?.ppe_employees_observed != null ? String(props.existing.ppe_employees_observed) : '');
  const [ppeWearing, setPpeWearing] = useState<string>(props.existing?.ppe_employees_wearing != null ? String(props.existing.ppe_employees_wearing) : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await upsertOperationalInputsMonthly({
        companyId: props.companyId,
        year,
        month,
        totalDeliveries: totalDeliveries === '' ? null : parseFloat(totalDeliveries),
        totalItemsInspected: totalItemsInspected === '' ? null : parseFloat(totalItemsInspected),
        productionOutput: productionOutput === '' ? null : parseFloat(productionOutput),
        totalEnergyUsed: totalEnergyUsed === '' ? null : parseFloat(totalEnergyUsed),
        recycledWaste: recycledWaste === '' ? null : parseFloat(recycledWaste),
        totalWasteGenerated: totalWasteGenerated === '' ? null : parseFloat(totalWasteGenerated),
        ppeEmployeesObserved: ppeObserved === '' ? null : parseInt(ppeObserved, 10),
        ppeEmployeesWearing: ppeWearing === '' ? null : parseInt(ppeWearing, 10),
        createdByUserId: props.userId
      });
      props.onSaved();
      props.onClose();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!props.open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-lg mx-4 bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-surface-200 px-5 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-charcoal">{props.existing ? 'Edit' : 'Add'} Operational Inputs</h2>
          <button type="button" onClick={props.onClose} className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-500">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-critical/10 border border-critical/30 rounded-lg p-3 text-sm text-critical">{error}</div>
          )}
          <p className="text-xs text-charcoal-500">Denominators for Quality/Environment/PPE KPIs. Leave blank if not applicable.</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">Year</label>
              <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm">
                {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">Month</label>
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm">
                {MONTHS.map((m) => <option key={m} value={m}>{MONTH_NAMES[m - 1]}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1">Total deliveries (Quality)</label>
            <input type="number" min={0} step={1} value={totalDeliveries} onChange={(e) => setTotalDeliveries(e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm" placeholder="Optional" />
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1">Total items inspected (Quality)</label>
            <input type="number" min={0} step={1} value={totalItemsInspected} onChange={(e) => setTotalItemsInspected(e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm" placeholder="Optional" />
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1">Production output (Environment)</label>
            <input type="number" min={0} step={0.01} value={productionOutput} onChange={(e) => setProductionOutput(e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm" placeholder="Optional" />
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1">Total energy used (Environment)</label>
            <input type="number" min={0} step={0.01} value={totalEnergyUsed} onChange={(e) => setTotalEnergyUsed(e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm" placeholder="Optional" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">Recycled waste</label>
              <input type="number" min={0} step={0.01} value={recycledWaste} onChange={(e) => setRecycledWaste(e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">Total waste generated</label>
              <input type="number" min={0} step={0.01} value={totalWasteGenerated} onChange={(e) => setTotalWasteGenerated(e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">PPE employees observed</label>
              <input type="number" min={0} value={ppeObserved} onChange={(e) => setPpeObserved(e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm" placeholder="Optional" />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">PPE employees wearing</label>
              <input type="number" min={0} value={ppeWearing} onChange={(e) => setPpeWearing(e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm" placeholder="Optional" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={props.onClose} className="px-4 py-2 rounded-lg border border-surface-300 text-charcoal">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-teal text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function OperationalInputsPage() {
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<OperationalInputsMonthly | null>(null);
  const canManage = activeRole === 'admin' || activeRole === 'owner' || activeRole === 'manager' || activeRole === 'supervisor';

  const { data: rows, loading, refetch } = useAsync<OperationalInputsMonthly[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listOperationalInputsMonthly({ companyId: activeCompanyId, limit: 120 });
    },
    [activeCompanyId]
  );

  const list = useMemo(() => {
    const r = rows ?? [];
    return [...r].sort((a, b) => (a.year !== b.year ? b.year - a.year : b.month - a.month));
  }, [rows]);

  const handleExportCsv = () => {
    const data = rows ?? [];
    const rowsForCsv = data.map((r) => ({
      Year: r.year,
      Month: r.month,
      'Total deliveries': r.total_deliveries ?? '',
      'Items inspected': r.total_items_inspected ?? '',
      'Production output': r.production_output ?? '',
      'Energy used': r.total_energy_used ?? '',
      'Recycled waste': r.recycled_waste ?? '',
      'Total waste': r.total_waste_generated ?? '',
      'PPE observed': r.ppe_employees_observed ?? '',
      'PPE wearing': r.ppe_employees_wearing ?? ''
    }));
    downloadTextFile(`operational-inputs-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rowsForCsv));
  };

  return (
    <Layout title="Operational Inputs">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <p className="text-sm text-charcoal-500">
            Monthly denominators for Quality, Environment and PPE KPIs (deliveries, items inspected, waste, energy, PPE observed/wearing).
          </p>
          <div className="flex gap-2">
            {canManage && (
              <button type="button" onClick={() => { setEditing(null); setModalOpen(true); }} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white">
                <PlusIcon className="w-4 h-4" /> Add entry
              </button>
            )}
            <button type="button" onClick={handleExportCsv} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-300 text-charcoal">
              <DownloadIcon className="w-4 h-4" /> Export CSV
            </button>
          </div>
        </div>
        {loading ? (
          <p className="text-sm text-charcoal-500">Loading…</p>
        ) : list.length === 0 ? (
          <div className="bg-surface-50 rounded-xl p-6 text-center text-charcoal-500">No operational inputs yet.</div>
        ) : (
          <div className="border border-surface-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-100 border-b border-surface-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-charcoal">Year</th>
                  <th className="text-left px-4 py-3 font-medium text-charcoal">Month</th>
                  <th className="text-right px-4 py-3 font-medium text-charcoal">Deliveries</th>
                  <th className="text-right px-4 py-3 font-medium text-charcoal">Waste recycled</th>
                  <th className="text-right px-4 py-3 font-medium text-charcoal">PPE observed</th>
                  {canManage && <th className="w-24" />}
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className="border-b border-surface-100 hover:bg-surface-50">
                    <td className="px-4 py-3">{r.year}</td>
                    <td className="px-4 py-3">{MONTH_NAMES[r.month - 1]}</td>
                    <td className="px-4 py-3 text-right">{r.total_deliveries ?? '—'}</td>
                    <td className="px-4 py-3 text-right">{r.recycled_waste ?? '—'}</td>
                    <td className="px-4 py-3 text-right">{r.ppe_employees_observed ?? '—'}</td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => { setEditing(r); setModalOpen(true); }} className="p-1.5 rounded hover:bg-surface-200 text-charcoal-500" title="Edit">
                          <PencilIcon className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <OperationalInputsFormModal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          companyId={activeCompanyId ?? ''}
          userId={user?.id ?? ''}
          existing={editing}
          onSaved={() => refetch()}
        />
      </motion.div>
    </Layout>
  );
}
