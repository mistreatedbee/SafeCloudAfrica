import React, { useState, useMemo } from 'react';
import { ChevronDownIcon, SearchIcon, UserIcon } from 'lucide-react';
import { useAsync } from '../../api/hooks/useAsync';
import { listUserProfiles } from '../../api/services/profilesService';
import { listCompanyMemberships } from '../../api/services/tenantService';
import type { UUID } from '../../api/models/core';
import type { UserProfile, CompanyMembership } from '../../api/models/entities';

export type AffectedPersonSelectorProps = {
  companyId: UUID;
  selectedPersonId?: UUID | null;
  selectedPersonName?: string | null;
  onChange: (personId: UUID | null, personName: string | null) => void;
  disabled?: boolean;
};

export function AffectedPersonSelector({
  companyId,
  selectedPersonId,
  selectedPersonName,
  onChange,
  disabled = false
}: AffectedPersonSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [useFreeText, setUseFreeText] = useState(!!selectedPersonName && !selectedPersonId);
  const [freeText, setFreeText] = useState(selectedPersonName || '');

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
    const users: Array<{ userId: UUID; name: string; email?: string }> = [];
    (memberships ?? []).forEach(m => {
      const profile = profileMap.get(m.user_id);
      users.push({
        userId: m.user_id,
        name: profile?.full_name || `User ${m.user_id.slice(0, 8)}`,
        email: profile?.email
      });
    });
    return users.sort((a, b) => a.name.localeCompare(b.name));
  }, [memberships, profileMap]);

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return availableUsers;
    const query = searchQuery.toLowerCase();
    return availableUsers.filter(
      u => u.name.toLowerCase().includes(query) || u.email?.toLowerCase().includes(query)
    );
  }, [availableUsers, searchQuery]);

  const selectedUser = useMemo(() => {
    if (!selectedPersonId) return null;
    return availableUsers.find(u => u.userId === selectedPersonId) || null;
  }, [availableUsers, selectedPersonId]);

  function handleSelectUser(userId: UUID) {
    const user = availableUsers.find(u => u.userId === userId);
    if (user) {
      setUseFreeText(false);
      setFreeText('');
      onChange(userId, null);
      setIsOpen(false);
    }
  }

  function handleUseFreeText() {
    setUseFreeText(true);
    onChange(null, freeText || null);
  }

  function handleFreeTextChange(value: string) {
    setFreeText(value);
    onChange(null, value.trim() || null);
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
              onChange(null, null);
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
    <div className="relative">
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`flex items-center gap-2 min-h-[42px] px-4 py-2 bg-white border border-surface-300 rounded-lg text-sm cursor-pointer ${
          disabled ? 'opacity-60 cursor-not-allowed' : 'hover:border-teal'
        }`}
      >
        <div className="flex-1">
          {selectedUser ? (
            <div className="flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-charcoal-400" />
              <span>{selectedUser.name}</span>
            </div>
          ) : selectedPersonName ? (
            <div className="flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-charcoal-400" />
              <span>{selectedPersonName}</span>
            </div>
          ) : (
            <span className="text-charcoal-400">Select affected person or enter name...</span>
          )}
        </div>
        <ChevronDownIcon className={`w-4 h-4 text-charcoal-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && !disabled && (
        <>
          <div className="absolute z-50 w-full mt-1 bg-white border border-surface-300 rounded-lg shadow-lg max-h-64 overflow-hidden flex flex-col">
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
                <>
                  {filteredUsers.map(user => (
                    <div
                      key={user.userId}
                      onClick={() => handleSelectUser(user.userId)}
                      className={`px-3 py-2 text-sm cursor-pointer hover:bg-surface-50 ${
                        selectedPersonId === user.userId ? 'bg-teal/5' : ''
                      }`}
                    >
                      <div className="font-medium">{user.name}</div>
                      {user.email && <div className="text-xs text-charcoal-500">{user.email}</div>}
                    </div>
                  ))}
                </>
              )}
            </div>
            <div className="p-2 border-t border-surface-200">
              <button
                type="button"
                onClick={handleUseFreeText}
                className="w-full px-3 py-2 text-sm text-teal hover:bg-teal/5 rounded"
              >
                Enter name manually
              </button>
            </div>
          </div>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
        </>
      )}
    </div>
  );
}
