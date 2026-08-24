import React, { useEffect, useState } from 'react';
import { SearchIcon } from 'lucide-react';
import { useAsync } from '../../api/hooks/useAsync';
import { searchHrEmployees, type HrEmployee } from '../../api/services/hrService';
import type { UUID } from '../../api/models/entities';

export type HrEmployeeSelectProps = {
  companyId: UUID | null;
  value: UUID | '';
  /**
   * Which field the select `value` represents.
   * - `user_id`: selects the linked platform user id (only employees with user accounts are shown by default)
   * - `id`: selects the HR employee row id (all employees are shown by default)
   */
  valueField?: 'user_id' | 'id';
  includeUnlinked?: boolean;
  onChange: (
    selectedValue: UUID | '',
    meta: {
      nameSnapshot: string;
      employeeId?: UUID | null;
      employeeNumber?: string | null;
      userId?: UUID | null;
    }
  ) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  onEmployeeChange?: (employee: HrEmployee | null) => void;
  /** Override the option display text (defaults to "employee_no - Full Name"). */
  formatOptionLabel?: (employee: HrEmployee) => string;
};

export function HrEmployeeSelect({
  companyId,
  value,
  valueField = 'user_id',
  includeUnlinked,
  onChange,
  placeholder = 'Select',
  label,
  disabled,
  onEmployeeChange,
  formatOptionLabel
}: HrEmployeeSelectProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const shouldIncludeUnlinked = includeUnlinked ?? valueField === 'id';

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(searchQuery.trim()), 220);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const { data: employees, loading, error } = useAsync<HrEmployee[]>(
    async () => {
      if (!companyId) return [];
      return await searchHrEmployees(companyId, {
        query: debouncedQuery,
        includeUnlinked: shouldIncludeUnlinked,
        limit: 140
      });
    },
    [companyId, shouldIncludeUnlinked, debouncedQuery]
  );

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedValue = (e.target.value || '') as UUID | '';
    if (!selectedValue) {
      onChange('', { nameSnapshot: '', employeeId: null, employeeNumber: null, userId: null });
      onEmployeeChange?.(null);
      return;
    }
    const match =
      valueField === 'id'
        ? (employees ?? []).find((emp) => emp.id === selectedValue)
        : (employees ?? []).find((emp) => emp.user_id === selectedValue);
    const snapshot =
      match && (match.first_name || match.last_name)
        ? `${match.first_name ?? ''} ${match.last_name ?? ''}`.trim()
        : match?.email ?? '';
    onChange(selectedValue, {
      nameSnapshot: snapshot,
      employeeId: match?.id ?? null,
      employeeNumber: match?.employee_no ?? null,
      userId: (match?.user_id ?? null) as UUID | null
    });
    if (match) onEmployeeChange?.(match);
  };

  const rows = employees ?? [];

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
            autoComplete="off"
          />
        </div>
      </div>
      <select
        value={value}
        onChange={handleChange}
        className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
        disabled={disabled || !companyId || loading}
      >
        <option value="">{loading ? 'Loading employees...' : placeholder}</option>
        {rows.map((e) => {
          const name = `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim() || e.email || e.employee_no;
          const empId = e.employee_no || '';
          const display = formatOptionLabel ? formatOptionLabel(e) : empId ? `${empId} - ${name}` : name;
          const optionValue = valueField === 'id' ? e.id : e.user_id ?? '';
          if (!optionValue) return null;
          return (
            <option key={e.id} value={optionValue}>
              {display}
            </option>
          );
        })}
      </select>
      {error && <p className="text-xs text-critical">Failed to load employees. Please retry.</p>}
      {!error && !loading && companyId && rows.length === 0 && (
        <p className="text-xs text-charcoal-500">No employees found for this search.</p>
      )}
    </div>
  );
}

