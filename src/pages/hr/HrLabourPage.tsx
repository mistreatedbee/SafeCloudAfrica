import React, { useState } from 'react';
import { useUser } from '@insforge/react';
import { Layout } from '../../components/layout/Layout';
import { HrSectionNav } from './HrSectionNav';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { createHrRecord, listHrEmployees, listHrRecords } from '../../api/services/hrService';
import { downloadTextFile, toCsv } from '../../utils/csv';

export function HrLabourPage() {
  const { activeCompanyId } = useTenant();
  const { user } = useUser();
  const [employeeId, setEmployeeId] = useState('');
  const [caseType, setCaseType] = useState('Warning');
  const [offenceCategory, setOffenceCategory] = useState('General');
  const [description, setDescription] = useState('');

  const { data: employees } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listHrEmployees(activeCompanyId);
  }, [activeCompanyId]);

  const { data: cases, refetch } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listHrRecords(activeCompanyId, 'hr_disciplinary_cases');
  }, [activeCompanyId]);

  const onCreate = async () => {
    if (!activeCompanyId || !user?.id || !employeeId || !description) return;
    await createHrRecord('hr_disciplinary_cases', {
      company_id: activeCompanyId,
      employee_id: employeeId,
      case_type: caseType,
      offence_category: offenceCategory,
      description,
      date_issued: new Date().toISOString().slice(0, 10),
      evidence_file_ids: [],
      status: 'OPEN',
      created_by_user_id: user.id
    });
    setDescription('');
    await refetch();
  };

  const onExport = () => {
    const csv = toCsv((cases ?? []).map((row) => ({
      id: row.id,
      employee_id: row.employee_id,
      case_type: row.case_type,
      offence_category: row.offence_category,
      description: row.description,
      status: row.status,
      repeat_offence_flag: row.repeat_offence_flag,
      date_issued: row.date_issued
    })));
    downloadTextFile(`hr-disciplinary-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <Layout title="Labour Relations & Compliance">
      <div className="space-y-4">
        <HrSectionNav />
        <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold">Disciplinary case register</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <select className="border border-surface-300 rounded-lg px-3 py-2 text-sm" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Employee</option>
              {(employees ?? []).map((employee) => <option key={employee.id} value={employee.id}>{employee.first_name} {employee.last_name}</option>)}
            </select>
            <input className="border border-surface-300 rounded-lg px-3 py-2 text-sm" value={caseType} onChange={(e) => setCaseType(e.target.value)} placeholder="Case type / Other" />
            <input className="border border-surface-300 rounded-lg px-3 py-2 text-sm" value={offenceCategory} onChange={(e) => setOffenceCategory(e.target.value)} placeholder="Offence category / Other" />
            <input className="border border-surface-300 rounded-lg px-3 py-2 text-sm" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
          </div>
          <button className="px-4 py-2 rounded-lg bg-teal text-white text-sm" onClick={onCreate}>Log case</button>
        </div>

        <div className="flex justify-end"><button className="px-3 py-2 rounded-lg border border-surface-300 text-sm" onClick={onExport}>Export CSV</button></div>

        <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-100"><tr><th className="text-left px-3 py-2">Employee</th><th className="text-left px-3 py-2">Type</th><th className="text-left px-3 py-2">Offence</th><th className="text-left px-3 py-2">Status</th><th className="text-left px-3 py-2">Repeat</th></tr></thead>
            <tbody>
              {(cases ?? []).map((row) => (
                <tr key={row.id} className="border-t border-surface-100">
                  <td className="px-3 py-2">{String(row.employee_id ?? '')}</td>
                  <td className="px-3 py-2">{String(row.case_type ?? '')}</td>
                  <td className="px-3 py-2">{String(row.offence_category ?? '')}</td>
                  <td className="px-3 py-2">{String(row.status ?? '')}</td>
                  <td className="px-3 py-2">{String(row.repeat_offence_flag ?? false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
