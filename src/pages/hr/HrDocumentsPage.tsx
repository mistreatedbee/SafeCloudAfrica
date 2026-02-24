import React, { useState } from 'react';
import { useUser } from '@insforge/react';
import { Layout } from '../../components/layout/Layout';
import { HrSectionNav } from './HrSectionNav';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { createHrRecord, listHrEmployees, listHrRecords } from '../../api/services/hrService';

export function HrDocumentsPage() {
  const { activeCompanyId } = useTenant();
  const { user } = useUser();
  const [employeeId, setEmployeeId] = useState('');
  const [title, setTitle] = useState('');
  const [docType, setDocType] = useState('Policy');

  const { data: employees } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listHrEmployees(activeCompanyId);
  }, [activeCompanyId]);

  const { data: rows, refetch } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listHrRecords(activeCompanyId, 'hr_employee_documents');
  }, [activeCompanyId]);

  const onCreate = async () => {
    if (!activeCompanyId || !user?.id || !employeeId || !title) return;
    await createHrRecord('hr_employee_documents', {
      company_id: activeCompanyId,
      employee_id: employeeId,
      doc_type: docType,
      title,
      file_ids: [],
      visible_to_employee: true,
      uploaded_by_user_id: user.id
    });
    setTitle('');
    await refetch();
  };

  return (
    <Layout title="HR Policies & Documents">
      <div className="space-y-4">
        <HrSectionNav />
        <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold">Upload policy/document metadata</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <select className="border border-surface-300 rounded-lg px-3 py-2 text-sm" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Employee</option>
              {(employees ?? []).map((employee) => <option key={employee.id} value={employee.id}>{employee.first_name} {employee.last_name}</option>)}
            </select>
            <input className="border border-surface-300 rounded-lg px-3 py-2 text-sm" value={docType} onChange={(e) => setDocType(e.target.value)} placeholder="Doc Type (Other allowed)" />
            <input className="border border-surface-300 rounded-lg px-3 py-2 text-sm" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
          </div>
          <button className="px-4 py-2 rounded-lg bg-teal text-white text-sm" onClick={onCreate}>Save document</button>
        </div>

        <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-100"><tr><th className="text-left px-3 py-2">Title</th><th className="text-left px-3 py-2">Type</th><th className="text-left px-3 py-2">Employee</th><th className="text-left px-3 py-2">Created</th></tr></thead>
            <tbody>
              {(rows ?? []).map((row) => (
                <tr key={row.id} className="border-t border-surface-100">
                  <td className="px-3 py-2">{String(row.title ?? '')}</td>
                  <td className="px-3 py-2">{String(row.doc_type ?? '')}</td>
                  <td className="px-3 py-2">{String(row.employee_id ?? '')}</td>
                  <td className="px-3 py-2">{String(row.created_at ?? '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
