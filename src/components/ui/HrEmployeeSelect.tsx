import React, { useMemo, useState } from 'react';
import { SearchIcon } from 'lucide-react';
import { useAsync } from '../../api/hooks/useAsync';
import { listHrEmployees, type HrEmployee } from '../../api/services/hrService';
import type { UUID } from '../../api/models/entities';

export type HrEmployeeSelectProps = {
  companyId: UUID | null;
  value: UUID | '';
  onChange: (userId: UUID | '', meta: { nameSnapshot: string; employeeId?: UUID | null; employeeNumber?: string | null }) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  onEmployeeChange?: (employee: HrEmployee | null) => void;
};

export function HrEmployeeSelect({ companyId, value, onChange, placeholder = 'Select', label, disabled, onEmployeeChange }: HrEmployeeSelectProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const { data: employees, loading } = useAsync<HrEmployee[]>(
    async () => {
      if (!companyId) return [];
      const rows = await listHrEmployees(companyId);
      // Only include employees linked to a user account since KPI assessments
      // store user-based identifiers for employee/manager references.
      return rows
        .filter((e) => e.user_id)
        .sort((a, b) => {
          const nameA = `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim().toLowerCase();
          const nameB = `${b.first_name ?? ''} ${b.last_name ?? ''}`.trim().toLowerCase();
          return nameA.localeCompare(nameB);
        });
    },
    [companyId]
  );

  const filteredEmployees = useMemo(() => {
    const list = employees ?? [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((e) => {
      const fullName = `${e.first_name ?? ''} ${e.last_name ?? ''}`.toLowerCase();
      const empNo = String(e.employee_no ?? '').toLowerCase();
      const email = String(e.email ?? '').toLowerCase();
      const jobTitle = String(e.job_title ?? '').toLowerCase();
      return (
        fullName.includes(q) ||
        empNo.includes(q) ||
        email.includes(q) ||
        jobTitle.includes(q)
      );
    });
  }, [employees, searchQuery]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const userId = (e.target.value || '') as UUID | '';
    if (!userId) {
      onChange('', { nameSnapshot: '', employeeId: null, employeeNumber: null });
      onEmployeeChange?.(null);
      return;
    }
    const match = (employees ?? []).find((emp) => emp.user_id === userId);
    const snapshot =
      match && (match.first_name || match.last_name)
        ? `${match.first_name ?? ''} ${match.last_name ?? ''}`.trim()
        : match?.email ?? '';
    onChange(userId, { nameSnapshot: snapshot, employeeId: match?.id ?? null, employeeNumber: match?.employee_no ?? null });
    if (match) onEmployeeChange?.(match);
  };

  return (
    <div className="space-y-1">
      {label && <label className="block text-sm font-medium text-charcoal mb-1">{label}</label>}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Type to search employees..."
            className="w-full pl-8 pr-3 py-2 border border-surface-300 rounded-lg text-sm"
            disabled={disabled || !companyId}
          />
        </div>
      </div>
      <select
        value={value}
        onChange={handleChange}
        className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
        disabled={disabled || !companyId || loading}
      >
        <option value="">{placeholder}</option>
        {filteredEmployees.map((e) => {
          const name = `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim() || e.email || e.employee_no;
          const empId = e.employee_no || '';
          const display = empId ? `${empId} – ${name}` : name;
          return (
            <option key={e.id} value={e.user_id ?? ''}>
              {display}
            </option>
          );
        })}
      </select>
    </div>
  );
}

