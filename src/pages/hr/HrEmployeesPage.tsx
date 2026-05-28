import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useUser } from '@insforge/react';
import { Layout } from '../../components/layout/Layout';
import { HrSectionNav } from './HrSectionNav';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { archiveHrEmployee, listHrEmployees, upsertHrEmployee } from '../../api/services/hrService';
import type { HrEmployee } from '../../api/services/hrService';
import { downloadTextFile, toCsv } from '../../utils/csv';
import { listDepartments } from '../../api/services/departmentsService';
import { listCompanyMemberships } from '../../api/services/tenantService';
import { listUserProfiles } from '../../api/services/profilesService';
import type { CompanyMembership, UserProfile } from '../../api/models/entities';
import { toUserFacingError } from '../../utils/userFacingMessage';

const TABS = ['directory', 'add', 'import', 'archived'] as const;
type Tab = (typeof TABS)[number];

type MergedRow = {
  source: 'linked' | 'member_only' | 'hr_only';
  hrEmployee?: HrEmployee;
  membership?: CompanyMembership;
  profile?: UserProfile;
};

export function HrEmployeesPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'directory';
  const { activeCompanyId } = useTenant();
  const { user } = useUser();
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({
    employee_no: '',
    first_name: '',
    last_name: '',
    email: '',
    employment_type: 'Permanent',
    start_date: new Date().toISOString().slice(0, 10),
    job_title: '',
    department_id: ''
  });
  const [csvInput, setCsvInput] = useState('employee_no,first_name,last_name,email,employment_type,start_date\n');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { data: employees, refetch } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listHrEmployees(activeCompanyId);
  }, [activeCompanyId]);

  const { data: departments } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listDepartments(activeCompanyId);
  }, [activeCompanyId]);

  const { data: memberships } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listCompanyMemberships(activeCompanyId);
  }, [activeCompanyId]);

  const { data: profiles } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listUserProfiles(activeCompanyId);
  }, [activeCompanyId]);

  const departmentById = useMemo(() => new Map((departments ?? []).map((d) => [String(d.id), d.name])), [departments]);

  const mergedRows = useMemo((): MergedRow[] => {
    const hrList = employees ?? [];
    const memberList = memberships ?? [];
    const profileList = profiles ?? [];

    const profileByUserId = new Map(profileList.map((p) => [p.user_id, p]));
    const hrByUserId = new Map(hrList.filter((e) => e.user_id).map((e) => [e.user_id!, e]));
    const hrByEmail = new Map(hrList.map((e) => [e.email.toLowerCase(), e]));
    const matchedHrIds = new Set<string>();

    const rows: MergedRow[] = [];

    for (const m of memberList) {
      const profile = profileByUserId.get(m.user_id);
      let hr = hrByUserId.get(m.user_id);
      if (!hr && profile?.email) {
        hr = hrByEmail.get(profile.email.toLowerCase());
      }
      if (hr) matchedHrIds.add(hr.id);
      rows.push({
        source: hr ? 'linked' : 'member_only',
        hrEmployee: hr,
        membership: m,
        profile,
      });
    }

    for (const e of hrList) {
      if (!matchedHrIds.has(e.id)) {
        rows.push({ source: 'hr_only', hrEmployee: e });
      }
    }

    return rows;
  }, [employees, memberships, profiles]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mergedRows;
    return mergedRows.filter(({ hrEmployee: e, profile, membership }) => {
      const fields = [
        e?.first_name, e?.last_name, e?.employee_no, e?.email, e?.job_title ?? '',
        profile?.full_name, profile?.email, profile?.employee_number,
        membership?.role,
        e?.department_id ? (departmentById.get(String(e.department_id)) ?? '') : (profile?.department ?? ''),
      ];
      return fields.some((v) => v && v.toLowerCase().includes(q));
    });
  }, [mergedRows, query, departmentById]);

  const activeRows = filteredRows.filter(({ hrEmployee, source }) =>
    source === 'member_only' ||
    (hrEmployee && hrEmployee.employment_status !== 'ARCHIVED' && hrEmployee.employment_status !== 'TERMINATED')
  );

  const archivedRows = filteredRows.filter(({ hrEmployee }) =>
    hrEmployee && (hrEmployee.employment_status === 'ARCHIVED' || hrEmployee.employment_status === 'TERMINATED')
  );

  const getDisplayName = (row: MergedRow) => {
    if (row.hrEmployee) return `${row.hrEmployee.first_name} ${row.hrEmployee.last_name}`;
    if (row.profile?.full_name) return row.profile.full_name;
    return row.profile?.email ?? row.membership?.role ?? '—';
  };

  const getDisplayEmail = (row: MergedRow) =>
    row.hrEmployee?.email ?? row.profile?.email ?? '—';

  const getDisplayEmployeeNo = (row: MergedRow) =>
    row.hrEmployee?.employee_no ?? row.profile?.employee_number ?? '—';

  const getDisplayDepartment = (row: MergedRow) => {
    if (row.hrEmployee?.department_id) return departmentById.get(String(row.hrEmployee.department_id)) ?? '—';
    return row.profile?.department ?? '—';
  };

  const getDisplayStatus = (row: MergedRow) => {
    if (row.hrEmployee) return row.hrEmployee.employment_status;
    if (row.membership?.status) return row.membership.status;
    return '—';
  };

  const prefillFromMember = (row: MergedRow) => {
    const nameParts = (row.profile?.full_name ?? '').split(' ');
    setForm((f) => ({
      ...f,
      first_name: nameParts[0] ?? '',
      last_name: nameParts.slice(1).join(' ') ?? '',
      email: row.profile?.email ?? '',
      employee_no: row.profile?.employee_number ?? '',
    }));
    setParams({ tab: 'add' });
  };

  const onCreate = async () => {
    setError(null);
    setSuccess(null);
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
        department_id: form.department_id || null,
        employment_status: 'ONBOARDING'
      });
      await refetch();
      setSuccess('Employee saved successfully');
      setParams({ tab: 'directory' });
    } catch (err: any) {
      setError(toUserFacingError(err, 'Unable to save employee right now. Please try again.'));
    }
  };

  const onImportCsv = async () => {
    if (!activeCompanyId || !user?.id) return;
    setError(null);
    setSuccess(null);
    try {
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
      setSuccess('Saved successfully');
      setParams({ tab: 'directory' });
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to import employees right now. Please try again.'));
    }
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
        {error && <div className="bg-critical/10 border border-critical/30 rounded-xl p-3 text-sm text-critical">{error}</div>}
        {success && <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700">{success}</div>}
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
                <thead className="bg-surface-100">
                  <tr>
                    <th className="text-left px-3 py-2">No</th>
                    <th className="text-left px-3 py-2">Name</th>
                    <th className="text-left px-3 py-2">Job Title</th>
                    <th className="text-left px-3 py-2">Email</th>
                    <th className="text-left px-3 py-2">Department</th>
                    <th className="text-left px-3 py-2">Role</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-left px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {activeRows.map((row, i) => (
                    <tr key={row.hrEmployee?.id ?? row.membership?.id ?? i} className="border-t border-surface-100">
                      <td className="px-3 py-2">{getDisplayEmployeeNo(row)}</td>
                      <td className="px-3 py-2">
                        <span>{getDisplayName(row)}</span>
                        {row.source === 'linked' && (
                          <span className="ml-2 text-xs bg-teal/10 text-teal px-1.5 py-0.5 rounded">linked</span>
                        )}
                      </td>
                      <td className="px-3 py-2">{row.hrEmployee?.job_title ?? '—'}</td>
                      <td className="px-3 py-2">{getDisplayEmail(row)}</td>
                      <td className="px-3 py-2">{getDisplayDepartment(row)}</td>
                      <td className="px-3 py-2 capitalize">{row.membership?.role ?? '—'}</td>
                      <td className="px-3 py-2">{getDisplayStatus(row)}</td>
                      <td className="px-3 py-2 space-x-2">
                        {row.hrEmployee ? (
                          <>
                            <button className="text-teal" onClick={() => navigate(`/dashboard/hr/employees/${row.hrEmployee!.id}`)}>Open</button>
                            <button className="text-critical" onClick={async () => {
                              if (!activeCompanyId || !user?.id) return;
                              await archiveHrEmployee(activeCompanyId, row.hrEmployee!.id, user.id);
                              await refetch();
                            }}>Archive</button>
                          </>
                        ) : (
                          <button className="text-teal" onClick={() => prefillFromMember(row)}>Create HR Record</button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {activeRows.length === 0 && (
                    <tr><td colSpan={8} className="px-3 py-6 text-center text-charcoal-400 text-sm">No employees found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'add' && (
          <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input className="border border-surface-300 rounded-lg px-3 py-2 text-sm" placeholder="Employee No" value={form.employee_no} onChange={(e) => setForm((x) => ({ ...x, employee_no: e.target.value }))} />
              <input className="border border-surface-300 rounded-lg px-3 py-2 text-sm" placeholder="First Name" value={form.first_name} onChange={(e) => setForm((x) => ({ ...x, first_name: e.target.value }))} />
              <input className="border border-surface-300 rounded-lg px-3 py-2 text-sm" placeholder="Last Name" value={form.last_name} onChange={(e) => setForm((x) => ({ ...x, last_name: e.target.value }))} />
              <input className="border border-surface-300 rounded-lg px-3 py-2 text-sm" placeholder="Email" value={form.email} onChange={(e) => setForm((x) => ({ ...x, email: e.target.value }))} />
              <input className="border border-surface-300 rounded-lg px-3 py-2 text-sm" placeholder="Job Title" value={form.job_title} onChange={(e) => setForm((x) => ({ ...x, job_title: e.target.value }))} />
              <input className="border border-surface-300 rounded-lg px-3 py-2 text-sm" placeholder="Employment Type" value={form.employment_type} onChange={(e) => setForm((x) => ({ ...x, employment_type: e.target.value }))} />
              <select className="border border-surface-300 rounded-lg px-3 py-2 text-sm" value={form.department_id} onChange={(e) => setForm((x) => ({ ...x, department_id: e.target.value }))}>
                <option value="">Select department (optional)</option>
                {(departments ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
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
                {archivedRows.map((row) => (
                  <tr key={row.hrEmployee!.id} className="border-t border-surface-100">
                    <td className="px-3 py-2">{row.hrEmployee!.employee_no}</td>
                    <td className="px-3 py-2">{row.hrEmployee!.first_name} {row.hrEmployee!.last_name}</td>
                    <td className="px-3 py-2">{row.hrEmployee!.email}</td>
                    <td className="px-3 py-2">{row.hrEmployee!.employment_status}</td>
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
