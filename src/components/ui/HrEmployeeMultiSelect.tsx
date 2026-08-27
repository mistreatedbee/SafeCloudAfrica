import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDownIcon, SearchIcon, XIcon } from 'lucide-react';
import { useAsync } from '../../api/hooks/useAsync';
import { FloatingOutsideClickOverlay, FloatingPanel, useFloatingPanel } from '../../hooks/useFloatingPanel';
import { searchHrEmployees, type HrEmployee } from '../../api/services/hrService';
import type { UUID } from '../../api/models/core';

export type SelectedHrEmployee = {
  employeeId: UUID;
  name: string;
  employeeNumber?: string | null;
  userId?: UUID | null;
};

export type HrEmployeeMultiSelectProps = {
  companyId: UUID | null;
  selectedEmployeeIds: UUID[];
  externalNames?: string[];
  onChange: (employeeIds: UUID[], externalNames: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
};

function employeeDisplayName(employee: HrEmployee): string {
  const name = `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim();
  return name || employee.email || employee.employee_no;
}

export function HrEmployeeMultiSelect({
  companyId,
  selectedEmployeeIds,
  externalNames = [],
  onChange,
  placeholder = 'Select employees...',
  disabled = false
}: HrEmployeeMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [externalNameInput, setExternalNameInput] = useState('');

  const { triggerRef, position: panelPosition } = useFloatingPanel(isOpen && !disabled);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(searchQuery.trim()), 220);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const { data: employees, loading } = useAsync<HrEmployee[]>(
    async () => {
      if (!companyId) return [];
      return searchHrEmployees(companyId, {
        query: debouncedQuery,
        includeUnlinked: true,
        limit: 140
      });
    },
    [companyId, debouncedQuery]
  );

  const employeeMap = useMemo(() => {
    const map = new Map<UUID, HrEmployee>();
    (employees ?? []).forEach((employee) => map.set(employee.id, employee));
    return map;
  }, [employees]);

  const selectedEmployees = useMemo(() => {
    return selectedEmployeeIds.map((employeeId) => {
      const employee = employeeMap.get(employeeId);
      return {
        employeeId,
        name: employee ? employeeDisplayName(employee) : `Employee ${employeeId.slice(0, 8)}`,
        employeeNumber: employee?.employee_no ?? null,
        userId: employee?.user_id ?? null
      } satisfies SelectedHrEmployee;
    });
  }, [employeeMap, selectedEmployeeIds]);

  const filteredEmployees = employees ?? [];

  function handleToggleEmployee(employeeId: UUID) {
    if (disabled) return;
    const nextIds = selectedEmployeeIds.includes(employeeId)
      ? selectedEmployeeIds.filter((id) => id !== employeeId)
      : [...selectedEmployeeIds, employeeId];
    onChange(nextIds, externalNames);
  }

  function handleRemoveEmployee(employeeId: UUID) {
    if (disabled) return;
    onChange(
      selectedEmployeeIds.filter((id) => id !== employeeId),
      externalNames
    );
  }

  function handleRemoveExternalName(name: string) {
    if (disabled) return;
    onChange(
      selectedEmployeeIds,
      externalNames.filter((entry) => entry !== name)
    );
  }

  function handleAddExternalName() {
    if (disabled || !externalNameInput.trim()) return;
    const name = externalNameInput.trim();
    if (externalNames.some((entry) => entry.toLowerCase() === name.toLowerCase())) {
      setExternalNameInput('');
      return;
    }
    onChange(selectedEmployeeIds, [...externalNames, name]);
    setExternalNameInput('');
  }

  return (
    <div className="relative">
      <div
        ref={triggerRef}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`flex items-center gap-2 min-h-[42px] px-4 py-2 bg-white border border-surface-300 rounded-lg text-sm cursor-pointer ${
          disabled ? 'opacity-60 cursor-not-allowed' : 'hover:border-teal'
        }`}
      >
        <div className="flex-1 flex flex-wrap gap-2">
          {selectedEmployees.length === 0 && externalNames.length === 0 ? (
            <span className="text-charcoal-400">{placeholder}</span>
          ) : (
            <>
              {selectedEmployees.map((employee) => (
                <span
                  key={employee.employeeId}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-teal/10 text-teal rounded text-xs"
                >
                  {employee.name}
                  {!disabled && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveEmployee(employee.employeeId);
                      }}
                      className="hover:text-teal-700"
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  )}
                </span>
              ))}
              {externalNames.map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-blue/10 text-blue rounded text-xs"
                >
                  {name}
                  <span className="text-[10px] uppercase tracking-wide text-blue/70">Manual</span>
                  {!disabled && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveExternalName(name);
                      }}
                      className="hover:text-blue-700"
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  )}
                </span>
              ))}
            </>
          )}
        </div>
        <ChevronDownIcon className={`w-4 h-4 text-charcoal-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && !disabled && panelPosition && (
        <FloatingOutsideClickOverlay onClick={() => setIsOpen(false)} />
      )}
      <FloatingPanel
        position={panelPosition}
        className="bg-white border border-surface-300 rounded-lg shadow-lg max-h-72 overflow-hidden flex flex-col"
      >
        <div className="p-2 border-b border-surface-200">
          <div className="relative">
            <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search HR employees..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-surface-300 rounded focus:outline-none focus:ring-2 focus:ring-teal"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="p-3 text-sm text-charcoal-500 text-center">Loading employees...</div>
          ) : filteredEmployees.length === 0 ? (
            <div className="p-3 text-sm text-charcoal-500 text-center">No employees found</div>
          ) : (
            filteredEmployees.map((employee) => (
              <div
                key={employee.id}
                onClick={() => handleToggleEmployee(employee.id)}
                className={`px-3 py-2 text-sm cursor-pointer hover:bg-surface-50 ${
                  selectedEmployeeIds.includes(employee.id) ? 'bg-teal/5' : ''
                }`}
              >
                <div className="font-medium">
                  {employeeDisplayName(employee)}
                  {employee.employee_no ? (
                    <span className="ml-2 text-xs text-charcoal-400">({employee.employee_no})</span>
                  ) : null}
                </div>
                <div className="text-xs text-charcoal-500">
                  {employee.job_title || employee.email || '—'}
                </div>
              </div>
            ))
          )}
        </div>
        <div className="p-2 border-t border-surface-200">
          <div className="flex gap-2">
            <input
              type="text"
              value={externalNameInput}
              onChange={(e) => setExternalNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddExternalName();
                }
              }}
              placeholder="Add name manually (not in HR)..."
              className="flex-1 px-2 py-1 text-sm border border-surface-300 rounded focus:outline-none focus:ring-2 focus:ring-teal"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              type="button"
              onClick={handleAddExternalName}
              className="px-3 py-1 text-sm bg-teal text-white rounded hover:bg-teal-600"
            >
              Add
            </button>
          </div>
        </div>
      </FloatingPanel>
    </div>
  );
}
