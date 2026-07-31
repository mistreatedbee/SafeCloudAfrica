import React, { useState, useMemo, useRef, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { XIcon, ChevronDownIcon, SearchIcon } from 'lucide-react';
import { useAsync } from '../../api/hooks/useAsync';
import { listUserProfiles } from '../../api/services/profilesService';
import { listCompanyMemberships } from '../../api/services/tenantService';
import type { UUID } from '../../api/models/core';
import type { UserProfile, CompanyMembership } from '../../api/models/entities';

export type SelectedUser = {
  userId: UUID;
  name: string;
  email?: string;
  employeeNumber?: string | null;
};

export type UserMultiSelectProps = {
  companyId: UUID;
  selectedUserIds: UUID[];
  selectedEmails?: string[];
  onChange: (userIds: UUID[], emails: string[]) => void;
  placeholder?: string;
  allowExternalEmails?: boolean;
  disabled?: boolean;
};

export function UserMultiSelect({
  companyId,
  selectedUserIds,
  selectedEmails = [],
  onChange,
  placeholder = 'Select users...',
  allowExternalEmails = true,
  disabled = false
}: UserMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [externalEmailInput, setExternalEmailInput] = useState('');

  // The options panel is rendered through a portal at a fixed screen position
  // (computed from the trigger's own bounding box) instead of being absolutely
  // positioned inside this component's own DOM subtree. Every row of a
  // repeating list (e.g. one dropdown per corrective action) sits inside the
  // same scrollable modal body; an absolutely-positioned descendant does not
  // expand that ancestor's scrollable height, so a panel opened on a row far
  // enough down the form gets silently clipped by the modal's scroll boundary
  // with no way to scroll it into view — it looks exactly like "no data
  // loaded" even though the same options are present for every row. Portaling
  // to document.body and positioning with fixed coordinates makes every
  // instance behave identically regardless of how many rows exist or where
  // a given row sits in the scrolled form.
  const triggerRef = useRef<HTMLDivElement>(null);
  const [panelRect, setPanelRect] = useState<{ top: number; left: number; width: number; openUpward: boolean } | null>(null);

  const updatePanelPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const panelHeight = 264; // matches max-h-64 (256px) + a little breathing room
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < panelHeight && rect.top > spaceBelow;
    setPanelRect({
      top: openUpward ? rect.top : rect.bottom,
      left: rect.left,
      width: rect.width,
      openUpward
    });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      setPanelRect(null);
      return;
    }
    updatePanelPosition();
    window.addEventListener('scroll', updatePanelPosition, true);
    window.addEventListener('resize', updatePanelPosition);
    return () => {
      window.removeEventListener('scroll', updatePanelPosition, true);
      window.removeEventListener('resize', updatePanelPosition);
    };
  }, [isOpen, updatePanelPosition]);

  const { data: profiles } = useAsync<UserProfile[]>(
    async () => {
      if (!companyId) return [];
      return await listUserProfiles(companyId);
    },
    [companyId]
  );

  const { data: memberships } = useAsync<CompanyMembership[]>(
    async () => {
      if (!companyId) return [];
      return await listCompanyMemberships(companyId);
    },
    [companyId]
  );

  const profileMap = useMemo(() => {
    const map = new Map<UUID, UserProfile>();
    (profiles ?? []).forEach(p => map.set(p.user_id, p));
    return map;
  }, [profiles]);

  const availableUsers = useMemo(() => {
    const users: SelectedUser[] = [];
    (memberships ?? []).forEach(m => {
      const profile = profileMap.get(m.user_id);
      users.push({
        userId: m.user_id,
        name: profile?.full_name || `User ${m.user_id.slice(0, 8)}`,
        email: profile?.email,
        employeeNumber: profile?.employee_number ?? null
      });
    });
    return users.sort((a, b) => a.name.localeCompare(b.name));
  }, [memberships, profileMap]);

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return availableUsers;
    const query = searchQuery.toLowerCase();
    return availableUsers.filter(
      (u) =>
        u.name.toLowerCase().includes(query) ||
        u.email?.toLowerCase().includes(query) ||
        String(u.employeeNumber ?? '').toLowerCase().includes(query)
    );
  }, [availableUsers, searchQuery]);

  const selectedUsers = useMemo(() => {
    return availableUsers.filter(u => selectedUserIds.includes(u.userId));
  }, [availableUsers, selectedUserIds]);

  function handleToggleUser(userId: UUID) {
    if (disabled) return;
    const newIds = selectedUserIds.includes(userId)
      ? selectedUserIds.filter(id => id !== userId)
      : [...selectedUserIds, userId];
    onChange(newIds, selectedEmails);
  }

  function handleRemoveUser(userId: UUID) {
    if (disabled) return;
    onChange(selectedUserIds.filter(id => id !== userId), selectedEmails);
  }

  function handleRemoveEmail(email: string) {
    if (disabled) return;
    onChange(selectedUserIds, selectedEmails.filter(e => e !== email));
  }

  function handleAddExternalEmail() {
    if (disabled || !allowExternalEmails || !externalEmailInput.trim()) return;
    const email = externalEmailInput.trim().toLowerCase();
    if (!email.includes('@') || selectedEmails.includes(email)) {
      setExternalEmailInput('');
      return;
    }
    onChange(selectedUserIds, [...selectedEmails, email]);
    setExternalEmailInput('');
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
          {selectedUsers.length === 0 && selectedEmails.length === 0 ? (
            <span className="text-charcoal-400">{placeholder}</span>
          ) : (
            <>
              {selectedUsers.map(user => (
                <span
                  key={user.userId}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-teal/10 text-teal rounded text-xs"
                >
                  {user.name}
                  {!disabled && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveUser(user.userId);
                      }}
                      className="hover:text-teal-700"
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  )}
                </span>
              ))}
              {selectedEmails.map(email => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-blue/10 text-blue rounded text-xs"
                >
                  {email}
                  {!disabled && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveEmail(email);
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

      {isOpen && !disabled && panelRect && createPortal(
        <>
          <div
            className="fixed z-40 inset-0"
            onClick={() => setIsOpen(false)}
          />
          <div
            className="fixed z-50 bg-white border border-surface-300 rounded-lg shadow-lg max-h-64 overflow-hidden flex flex-col"
            style={{
              top: panelRect.openUpward ? undefined : panelRect.top + 4,
              bottom: panelRect.openUpward ? window.innerHeight - panelRect.top + 4 : undefined,
              left: panelRect.left,
              width: panelRect.width
            }}
          >
            <div className="p-2 border-b border-surface-200">
              <div className="relative">
                <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search users..."
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-surface-300 rounded focus:outline-none focus:ring-2 focus:ring-teal"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              {filteredUsers.length === 0 ? (
                <div className="p-3 text-sm text-charcoal-500 text-center">No users found</div>
              ) : (
                filteredUsers.map(user => (
                  <div
                    key={user.userId}
                    onClick={() => handleToggleUser(user.userId)}
                    className={`px-3 py-2 text-sm cursor-pointer hover:bg-surface-50 ${
                      selectedUserIds.includes(user.userId) ? 'bg-teal/5' : ''
                    }`}
                  >
                    <div className="font-medium">
                      {user.name}
                      {user.employeeNumber ? <span className="ml-2 text-xs text-charcoal-400">({user.employeeNumber})</span> : null}
                    </div>
                    <div className="text-xs text-charcoal-500">
                      {user.email ? user.email : user.employeeNumber ? '—' : ''}
                    </div>
                  </div>
                ))
              )}
            </div>
            {allowExternalEmails && (
              <div className="p-2 border-t border-surface-200">
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={externalEmailInput}
                    onChange={(e) => setExternalEmailInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddExternalEmail();
                      }
                    }}
                    placeholder="Add external email..."
                    className="flex-1 px-2 py-1 text-sm border border-surface-300 rounded focus:outline-none focus:ring-2 focus:ring-teal"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button
                    type="button"
                    onClick={handleAddExternalEmail}
                    className="px-3 py-1 text-sm bg-teal text-white rounded hover:bg-teal-600"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
