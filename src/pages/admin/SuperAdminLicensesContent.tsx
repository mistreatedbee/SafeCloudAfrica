import React, { useState } from 'react';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import { insforge } from '../../api/insforge/client';
import type { Company } from '../../api/models/entities';
import type { UUID } from '../../api/models/entities';
import {
  listLicenses,
  createLicense,
  remainingDays,
  type OrgLicenseRow,
  type CreateLicenseInput
} from '../../api/services/licensesService';

const PLAN_OPTIONS: { value: CreateLicenseInput['plan_name']; label: string }[] = [
  { value: 'base', label: 'Base' },
  { value: 'growth', label: 'Growth' },
  { value: 'professional', label: 'Professional' },
  { value: 'hr_only', label: 'HR-only' }
];

const SEAT_OPTIONS = [
  { value: 5, label: '1–5' },
  { value: 20, label: '6–20' },
  { value: 50, label: '21–50' }
];

const DURATION_OPTIONS = [3, 6, 9, 12];

async function fetchCompanies(): Promise<Company[]> {
  const { data, error } = await insforge.database.from('companies').select('id, name').order('name').limit(500);
  if (error) throw error;
  return (data ?? []) as Company[];
}

async function fetchMemberCounts(): Promise<Record<string, number>> {
  const { data } = await insforge.database.from('company_memberships').select('company_id');
  const out: Record<string, number> = {};
  (data ?? []).forEach((r: { company_id: string }) => {
    out[r.company_id] = (out[r.company_id] ?? 0) + 1;
  });
  return out;
}

export function SuperAdminLicensesContent() {
  const { user } = useUser();
  const [created, setCreated] = useState(0);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState<{
    company_id: string;
    plan_name: CreateLicenseInput['plan_name'];
    seat_limit: number;
    duration_months: number;
    start_date: string;
  }>({
    company_id: '',
    plan_name: 'base',
    seat_limit: 5,
    duration_months: 12,
    start_date: new Date().toISOString().slice(0, 10)
  });

  const { data: licenses, loading, error } = useAsync(listLicenses, [created]);
  const { data: companies } = useAsync(fetchCompanies, []);
  const { data: memberCounts } = useAsync(fetchMemberCounts, [created]);

  const list = licenses ?? [];
  const companyList = companies ?? [];
  const counts = memberCounts ?? {};

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.company_id || !user?.id) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await createLicense(
        {
          company_id: form.company_id as UUID,
          plan_name: form.plan_name,
          seat_limit: form.seat_limit,
          duration_months: form.duration_months,
          start_date: form.start_date
        },
        user.id as UUID
      );
      setMessage({ type: 'success', text: 'License created successfully.' });
      setCreated((c) => c + 1);
    } catch (err) {
      setMessage({ type: 'error', text: String((err as Error)?.message ?? err) });
    } finally {
      setSubmitting(false);
    }
  };

  const remainingSeats = (license: OrgLicenseRow): number => {
    const used = counts[license.company_id] ?? 0;
    return Math.max(0, license.seat_limit - used);
  };

  return (
    <div className="space-y-6">
      {/* Create License form */}
      <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
        <h2 className="text-base font-semibold text-charcoal mb-4">Create license</h2>
        {message && (
          <div
            className={`mb-4 p-3 rounded-lg text-sm ${
              message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-critical/10 text-critical'
            }`}
          >
            {message.text}
          </div>
        )}
        <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1">Organisation</label>
            <select
              required
              value={form.company_id}
              onChange={(e) => setForm((f) => ({ ...f, company_id: e.target.value }))}
              className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:ring-2 focus:ring-teal focus:border-transparent"
            >
              <option value="">Select organisation</option>
              {companyList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1">Plan</label>
            <select
              value={form.plan_name}
              onChange={(e) => setForm((f) => ({ ...f, plan_name: e.target.value as CreateLicenseInput['plan_name'] }))}
              className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:ring-2 focus:ring-teal focus:border-transparent"
            >
              {PLAN_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1">Seat limit</label>
            <select
              value={form.seat_limit}
              onChange={(e) => setForm((f) => ({ ...f, seat_limit: Number(e.target.value) }))}
              className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:ring-2 focus:ring-teal focus:border-transparent"
            >
              {SEAT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1">Billing duration (months)</label>
            <select
              value={form.duration_months}
              onChange={(e) => setForm((f) => ({ ...f, duration_months: Number(e.target.value) }))}
              className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:ring-2 focus:ring-teal focus:border-transparent"
            >
              {DURATION_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m} months
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1">Start date</label>
            <input
              type="date"
              required
              value={form.start_date}
              onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
              className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create license'}
            </button>
          </div>
        </form>
      </div>

      {/* Licenses list */}
      <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
          <p className="font-semibold text-charcoal">Licenses</p>
          <p className="text-sm text-charcoal-500">{list.length} total</p>
        </div>
        {error && (
          <div className="p-5">
            <p className="text-sm text-critical">{String((error as Error)?.message)}</p>
          </div>
        )}
        {loading && (
          <div className="p-5 text-sm text-charcoal-500">Loading…</div>
        )}
        {!loading && list.length === 0 && (
          <div className="p-5 text-sm text-charcoal-500">No licenses yet. Create one above.</div>
        )}
        {!loading && list.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Organisation ID</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Plan</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Seats</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Start / End</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Status</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Remaining days</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Remaining seats</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {list.map((l) => (
                  <tr key={l.id} className="hover:bg-surface-50">
                    <td className="px-5 py-3 text-sm text-charcoal-500">{l.company_id}</td>
                    <td className="px-5 py-3 text-sm text-charcoal">{l.plan_name}</td>
                    <td className="px-5 py-3 text-sm text-charcoal">{l.seat_limit}</td>
                    <td className="px-5 py-3 text-sm text-charcoal-500">{l.start_date} / {l.end_date}</td>
                    <td className="px-5 py-3 text-sm text-charcoal-500">{l.status}</td>
                    <td className="px-5 py-3 text-sm text-charcoal-500">{remainingDays(l.end_date)}</td>
                    <td className="px-5 py-3 text-sm text-charcoal-500">{remainingSeats(l)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
