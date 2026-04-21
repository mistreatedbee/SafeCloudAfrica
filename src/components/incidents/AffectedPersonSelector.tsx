import React, { useState } from 'react';
import type { UUID } from '../../api/models/core';
import { HrEmployeeSelect } from '../ui/HrEmployeeSelect';

export type AffectedPersonSelectorProps = {
  companyId: UUID;
  selectedPersonId?: UUID | null;
  selectedPersonName?: string | null;
  onChange: (personId: UUID | null, personName: string | null, employeeId: UUID | null) => void;
  disabled?: boolean;
};

export function AffectedPersonSelector({
  companyId,
  selectedPersonId,
  selectedPersonName,
  onChange,
  disabled = false
}: AffectedPersonSelectorProps) {
  const [useFreeText, setUseFreeText] = useState(!!selectedPersonName && !selectedPersonId);
  const [freeText, setFreeText] = useState(selectedPersonName || '');

  function handleUseFreeText() {
    setUseFreeText(true);
    onChange(null, freeText || null, null);
  }

  function handleFreeTextChange(value: string) {
    setFreeText(value);
    onChange(null, value.trim() || null, null);
  }

  if (useFreeText) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={freeText}
            onChange={(e) => handleFreeTextChange(e.target.value)}
            placeholder="Enter affected person name..."
            disabled={disabled}
            className="flex-1 px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => {
              setUseFreeText(false);
              setFreeText('');
              onChange(null, null, null);
            }}
            disabled={disabled}
            className="px-3 py-2.5 text-sm text-charcoal-500 hover:text-charcoal border border-surface-300 rounded-lg hover:bg-surface-50 disabled:opacity-60"
          >
            Select from list
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <HrEmployeeSelect
        companyId={companyId}
        value={(selectedPersonId ?? '') as UUID | ''}
        valueField="id"
        includeUnlinked
        onChange={(userId, meta) => {
          onChange((meta.userId ?? null) as UUID | null, meta.nameSnapshot || null, (meta.employeeId ?? null) as UUID | null);
        }}
        placeholder="Select affected employee"
        disabled={disabled}
      />
      <button
        type="button"
        onClick={handleUseFreeText}
        disabled={disabled}
        className="text-xs text-teal hover:text-teal-700 disabled:opacity-60"
      >
        Enter name manually
      </button>
    </div>
  );
}
