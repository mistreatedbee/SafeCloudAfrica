/**
 * SelectOrType: dropdown with "Other / Type manually" option.
 * User can select from list or enter a custom value; custom values can be upserted to DynamicOptions for reuse.
 */

import React, { useEffect, useState } from 'react';
import type { OptionItem } from '../../api/services/dynamicOptionsService';

const OTHER_VALUE = '__other__';
const MIN_LENGTH = 2;
const MAX_LENGTH = 200;

export type SelectOrTypeProps = {
  value: string;
  onChange: (value: string, isCustom: boolean) => void;
  options: OptionItem[];
  label?: string;
  placeholder?: string;
  otherLabel?: string;
  required?: boolean;
  disabled?: boolean;
  minLength?: number;
  maxLength?: number;
  /** When true and user types a custom value, upsert to DynamicOptions (requires companyId, moduleKey, fieldKey). */
  allowCreate?: boolean;
  companyId?: string;
  moduleKey?: string;
  fieldKey?: string;
  createdByUserId?: string | null;
  /** Optional class for the wrapper div */
  className?: string;
};

export function SelectOrType({
  value,
  onChange,
  options,
  label,
  placeholder = 'Select...',
  otherLabel = 'Other / Type manually',
  required = false,
  disabled = false,
  minLength = MIN_LENGTH,
  maxLength = MAX_LENGTH,
  allowCreate = false,
  companyId,
  moduleKey,
  fieldKey,
  createdByUserId,
  className = ''
}: SelectOrTypeProps) {
  const isOther = value !== '' && !options.some((o) => o.value === value);
  const [useOther, setUseOther] = useState(isOther);
  const [customInput, setCustomInput] = useState(isOther ? value : '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const match = options.some((o) => o.value === value);
    if (value && !match) {
      setUseOther(true);
      setCustomInput(value);
    } else {
      if (!useOther) setCustomInput('');
    }
  }, [value, options, useOther]);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    if (v === OTHER_VALUE) {
      setUseOther(true);
      setError(null);
      onChange('', true);
    } else {
      setUseOther(false);
      setCustomInput('');
      setError(null);
      onChange(v, false);
    }
  };

  const handleCustomInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setCustomInput(raw);
    const trimmed = raw.trim();
    if (trimmed.length > 0 && trimmed.length < minLength) {
      setError(`Enter at least ${minLength} characters`);
    } else if (trimmed.length > maxLength) {
      setError(`Maximum ${maxLength} characters`);
    } else {
      setError(null);
      onChange(trimmed || '', true);
    }
  };

  const handleCustomBlur = async () => {
    const trimmed = customInput.trim();
    if (trimmed.length < minLength) return;
    const dup = options.some((o) => o.value.trim().toLowerCase() === trimmed.toLowerCase());
    if (dup) setError('This value already exists in the list');
    else setError(null);
    if (allowCreate && trimmed.length >= minLength && companyId && moduleKey && fieldKey) {
      try {
        const { upsertOption } = await import('../../api/services/dynamicOptionsService');
        await upsertOption({
          companyId,
          moduleKey,
          fieldKey,
          value: trimmed,
          createdByUserId: createdByUserId ?? undefined
        });
      } catch {
        // non-blocking
      }
    }
  };

  const selectValue = useOther ? OTHER_VALUE : value;
  const showCustomInput = useOther;

  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-charcoal mb-1.5">
          {label}
          {required && <span className="text-critical ml-0.5">*</span>}
        </label>
      )}
      <div className="space-y-2">
        <select
          value={selectValue}
          onChange={handleSelectChange}
          disabled={disabled}
          required={required && !showCustomInput}
          className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent disabled:opacity-60"
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o.id} value={o.value}>
              {o.label}
            </option>
          ))}
          <option value={OTHER_VALUE}>{otherLabel}</option>
        </select>
        {showCustomInput && (
          <input
            type="text"
            value={customInput}
            onChange={handleCustomInputChange}
            onBlur={handleCustomBlur}
            placeholder={`Type your own (min ${minLength} characters)`}
            disabled={disabled}
            required={required}
            className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent disabled:opacity-60"
          />
        )}
        {error && <p className="text-xs text-critical">{error}</p>}
      </div>
    </div>
  );
}
