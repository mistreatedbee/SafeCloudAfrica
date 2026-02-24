import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useUser } from '@insforge/react';
import { Layout } from '../../components/layout/Layout';
import { HrSectionNav } from './HrSectionNav';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { archiveHrEmployee, listHrEmployees, upsertHrEmployee } from '../../api/services/hrService';
import { downloadTextFile, toCsv } from '../../utils/csv';

const TABS = ['directory', 'add', 'import', 'archived'] as const;
type Tab = (typeof TABS)[number];

export function HrEmployeesPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'directory';
  const { activeCompanyId } = useTenant();
  const { user } = useUser();
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({ employee_no: '', first_name: '', last_name: '', email: '', employment_type: 'Permanent', start_date: new Date().toISOString().slice(0, 10), job_title: '' });
  const [csvInput, setCsvInput] = useState('employee_no,first_name,last_name,email,employment_type,start_date\n');
  const [error, setError] = useState<string | null>(null);

  const { data: employees, refetch } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listHrEmployees(activeCompanyId);
  }, [activeCompanyId]);

  const filtered = useMemo(() => {
    const rows = employees ?? [];
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (!q) return true;
      return [row.first_name, row.last_name, row.employee_no, row.email, row.job_title ?? ''].some((value) => value.toLowerCase().includes(q));
    });
  }, [employees, query]);

  const archived = filtered.filter((row) => row.employment_status === 'ARCHIVED' || row.employment_status === 'TERMINATED');
  const active = filtered.filter((row) => row.employment_status !== 'ARCHIVED' && row.employment_status !== 'TERMINATED');

  const onCreate = async () => {
    setError(null);
    if (!activeCompanyId || !user?.id) return;
    try {
      await upsertHrEmployee({
        company_id: activeCompanyId,
        created_by_user_id: user.id,
        employee_no: form.employee_no,
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        employment_type: form.employment_type,
        start_date: form.start_date,
        job_title: form.job_title,
        employment_status: 'ONBOARDING'
      });
      await refetch();
      setParams({ tab: 'directory' });
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create employee');
    }
  };

  const onImportCsv = async () => {
    if (!activeCompanyId || !user?.id) return;
    const lines = csvInput.trim().split(/\r?\n/);
    if (lines.length <= 1) return;
    const header = lines[0].split(',').map((x) => x.trim());
    const idx = (name: string) => header.findIndex((h) => h === name);
    for (const line of lines.slice(1)) {
      const parts = line.split(',').map((x) => x.trim());
      if (!parts[idx('employee_no')] || !parts[idx('email')]) continue;
      await upsertHrEmployee({
        company_id: activeCompanyId,
        created_by_user_id: user.id,
        employee_no: parts[idx('employee_no')],
        first_name: parts[idx('first_name')] || 'Unknown',
        last_name: parts[idx('last_name')] || 'Unknown',
        email: parts[idx('email')],
        employment_type: parts[idx('employment_type')] || 'Permanent',
        start_date: parts[idx('start_date')] || new Date().toISOString().slice(0, 10)
      });
    }
    await refetch();
    setParams({ tab: 'directory' });
  };

  const onExportCsv = () => {
    const csv = toCsv((employees ?? []).map((row) => ({
      employee_no: row.employee_no,
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
      job_title: row.job_title,
      employment_status: row.employment_status,
      start_date: row.start_date
    })));
    downloadTextFile(`hr-employees-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <Layout title="HR Employees">
      <div className="space-y-4">
        <HrSectionNav />
        <div className="bg-white border border-surface-300 rounded-xl p-2 flex gap-2">
          {TABS.map((key) => (
            <button key={key} onClick={() => setParams({ tab: key })} className={`px-3 py-1.5 rounded-lg text-sm ${tab === key ? 'bg-teal text-white' : 'hover:bg-surface-100'}`}>{key}</button>
          ))}
        </div>

        {tab === 'directory' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input className="flex-1 border border-surface-300 rounded-lg px-3 py-2 text-sm" placeholder="Search name, employee no, email, department" value={query} onChange={(e) => setQuery(e.target.value)} />
              <button className="px-3 py-2 rounded-lg border border-surface-300 text-sm" onClick={onExportCsv}>Export CSV</button>
            </div>
            <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-100"><tr><th className="text-left px-3 py-2">No</th><th className="text-left px-3 py-2">Name</th><th className="text-left px-3 py-2">Email</th><th className="text-left px-3 py-2">Status</th><th className="text-left px-3 py-2">Actions</th></tr></thead>
                <tbody>
                  {active.map((row) => (
                    <tr key={row.id} className="border-t border-surface-100">
                      <td className="px-3 py-2">{row.employee_no}</td>
                      <td className="px-3 py-2">{row.first_name} {row.last_name}</td>
                      <td className="px-3 py-2">{row.email}</td>
                      <td className="px-3 py-2">{row.employment_status}</td>
                      <td className="px-3 py-2 space-x-2">
                        <button className="text-teal" onClick={() => navigate(`/dashboard/hr/employees/${row.id}`)}>Open</button>
                        <button className="text-critical" onClick={async () => {
                          if (!activeCompanyId || !user?.id) return;
                          await archiveHrEmployee(activeCompanyId, row.id, user.id);
                          await refetch();
                        }}>Archive</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'add' && (
          <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
            {error && <p className="text-sm text-critical">{error}</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input className="border border-surface-300 rounded-lg px-3 py-2 text-sm" placeholder="Employee No" value={form.employee_no} onChange={(e) => setForm((x) => ({ ...x, employee_no: e.target.value }))} />
              <input className="border border-surface-300 rounded-lg px-3 py-2 text-sm" placeholder="First Name" value={form.first_name} onChange={(e) => setForm((x) => ({ ...x, first_name: e.target.value }))} />
              <input className="border border-surface-300 rounded-lg px-3 py-2 text-sm" placeholder="Last Name" value={form.last_name} onChange={(e) => setForm((x) => ({ ...x, last_name: e.target.value }))} />
              <input className="border border-surface-300 rounded-lg px-3 py-2 text-sm" placeholder="Email" value={form.email} onChange={(e) => setForm((x) => ({ ...x, email: e.target.value }))} />
              <input className="border border-surface-300 rounded-lg px-3 py-2 text-sm" placeholder="Job Title" value={form.job_title} onChange={(e) => setForm((x) => ({ ...x, job_title: e.target.value }))} />
              <input className="border border-surface-300 rounded-lg px-3 py-2 text-sm" placeholder="Employment Type" value={form.employment_type} onChange={(e) => setForm((x) => ({ ...x, employment_type: e.target.value }))} />
              <input type="date" className="border border-surface-300 rounded-lg px-3 py-2 text-sm" value={form.start_date} onChange={(e) => setForm((x) => ({ ...x, start_date: e.target.value }))} />
            </div>
            <button className="px-4 py-2 rounded-lg bg-teal text-white text-sm" onClick={onCreate}>Save employee</button>
          </div>
        )}

        {tab === 'import' && (
          <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
            <p className="text-xs text-charcoal-500">CSV header: employee_no,first_name,last_name,email,employment_type,start_date</p>
            <textarea className="w-full min-h-[220px] border border-surface-300 rounded-lg px-3 py-2 text-sm" value={csvInput} onChange={(e) => setCsvInput(e.target.value)} />
            <button className="px-4 py-2 rounded-lg bg-teal text-white text-sm" onClick={onImportCsv}>Import CSV</button>
          </div>
        )}

        {tab === 'archived' && (
          <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-100"><tr><th className="text-left px-3 py-2">No</th><th className="text-left px-3 py-2">Name</th><th className="text-left px-3 py-2">Email</th><th className="text-left px-3 py-2">Status</th></tr></thead>
              <tbody>
                {archived.map((row) => (
                  <tr key={row.id} className="border-t border-surface-100">
                    <td className="px-3 py-2">{row.employee_no}</td>
                    <td className="px-3 py-2">{row.first_name} {row.last_name}</td>
                    <td className="px-3 py-2">{row.email}</td>
                    <td className="px-3 py-2">{row.employment_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
