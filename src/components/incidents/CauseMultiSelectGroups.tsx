import React, { useState, useMemo } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';

export type CauseSelection = Record<string, Array<string | { other: string }>>;

export type CauseMultiSelectGroupsProps = {
  groups: Record<string, readonly string[]>;
  selected: CauseSelection;
  onChange: (selected: CauseSelection) => void;
  label?: string;
  disabled?: boolean;
};

export function CauseMultiSelectGroups({
  groups,
  selected,
  onChange,
  label = 'Select causes',
  disabled = false
}: CauseMultiSelectGroupsProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(Object.keys(groups)));

  function toggleGroup(groupName: string) {
    if (disabled) return;
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupName)) {
      newExpanded.delete(groupName);
    } else {
      newExpanded.add(groupName);
    }
    setExpandedGroups(newExpanded);
  }

  function toggleItem(groupName: string, item: string) {
    if (disabled) return;
    const groupSelected = selected[groupName] || [];
    const isSelected = groupSelected.some(
      s => (typeof s === 'string' && s === item) || (typeof s === 'object' && s.other !== undefined && item === 'Other')
    );

    let newGroupSelected: Array<string | { other: string }>;
    if (isSelected) {
      newGroupSelected = groupSelected.filter(
        s => !(typeof s === 'string' && s === item) && !(typeof s === 'object' && s.other !== undefined && item === 'Other')
      );
    } else {
      if (item === 'Other') {
        // Add "Other" with empty text
        newGroupSelected = [...groupSelected, { other: '' }];
      } else {
        newGroupSelected = [...groupSelected, item];
      }
    }

    onChange({
      ...selected,
      [groupName]: newGroupSelected
    });
  }

  function updateOtherText(groupName: string, text: string) {
    if (disabled) return;
    const groupSelected = selected[groupName] || [];
    const updated = groupSelected.map(s => {
      if (typeof s === 'object' && s.other !== undefined) {
        return { other: text };
      }
      return s;
    });
    onChange({
      ...selected,
      [groupName]: updated
    });
  }

  function getOtherText(groupName: string): string {
    const groupSelected = selected[groupName] || [];
    const otherItem = groupSelected.find(s => typeof s === 'object' && s.other !== undefined);
    return otherItem && typeof otherItem === 'object' ? otherItem.other : '';
  }

  function isItemSelected(groupName: string, item: string): boolean {
    const groupSelected = selected[groupName] || [];
    return groupSelected.some(
      s => (typeof s === 'string' && s === item) || (typeof s === 'object' && s.other !== undefined && item === 'Other')
    );
  }

  return (
    <div className="space-y-2">
      {label && <label className="block text-sm font-medium text-charcoal mb-2">{label}</label>}
      <div className="space-y-2 border border-surface-300 rounded-lg p-3 max-h-96 overflow-y-auto">
        {Object.entries(groups).map(([groupName, items]) => {
          const isExpanded = expandedGroups.has(groupName);
          const groupSelected = selected[groupName] || [];
          const hasSelection = groupSelected.length > 0;

          return (
            <div key={groupName} className="border-b border-surface-200 last:border-b-0 pb-2 last:pb-0">
              <button
                type="button"
                onClick={() => toggleGroup(groupName)}
                className="w-full flex items-center justify-between py-2 text-sm font-medium text-charcoal hover:text-teal"
                disabled={disabled}
              >
                <div className="flex items-center gap-2">
                  {isExpanded ? (
                    <ChevronDownIcon className="w-4 h-4" />
                  ) : (
                    <ChevronRightIcon className="w-4 h-4" />
                  )}
                  <span>{groupName}</span>
                  {hasSelection && (
                    <span className="px-2 py-0.5 bg-teal/10 text-teal rounded text-xs">
                      {groupSelected.length} selected
                    </span>
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="ml-6 mt-2 space-y-2">
                  {items.map((item) => (
                    <div key={item} className="space-y-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isItemSelected(groupName, item)}
                          onChange={() => toggleItem(groupName, item)}
                          disabled={disabled}
                          className="w-4 h-4 text-teal border-surface-300 rounded focus:ring-teal disabled:opacity-60"
                        />
                        <span className="text-sm text-charcoal">{item}</span>
                      </label>
                      {item === 'Other' && isItemSelected(groupName, 'Other') && (
                        <input
                          type="text"
                          value={getOtherText(groupName)}
                          onChange={(e) => updateOtherText(groupName, e.target.value)}
                          placeholder="Specify other..."
                          disabled={disabled}
                          className="ml-6 w-full px-3 py-1.5 text-sm border border-surface-300 rounded focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
