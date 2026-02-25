import React, { useEffect, useState } from 'react';
import { MenuIcon, SearchIcon, UsersIcon } from 'lucide-react';
import { NotificationBell, type NotificationItem } from '../ui/NotificationBell';
import { UserMenu } from '../ui/UserMenu';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useIdentity } from '../../hooks/useIdentity';
import { listMyNotifications } from '../../api/services/notificationsService';
import { countActiveMembers, getSeatLimitForCompany } from '../../api/services/tenantService';
import type { Notification } from '../../api/models/entities';

type HeaderProps = {
  onMenuClick: () => void;
  title?: string;
};

function SeatsRemainingBadge() {
  const { activeCompanyId, activeRole } = useTenant();
  const [seats, setSeats] = useState<{ used: number; limit: number } | null>(null);
  useEffect(() => {
    if (!activeCompanyId || (activeRole !== 'owner' && activeRole !== 'admin')) return;
    let cancelled = false;
    Promise.all([countActiveMembers(activeCompanyId), getSeatLimitForCompany(activeCompanyId)])
      .then(([used, limit]) => { if (!cancelled) setSeats({ used, limit }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeCompanyId, activeRole]);
  if (!seats || seats.limit <= 0) return null;
  const remaining = Math.max(0, seats.limit - seats.used);
  return (
    <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-100 border border-surface-200 text-xs text-charcoal-600">
      <UsersIcon className="w-3.5 h-3.5" />
      <span>{remaining} seats left</span>
    </div>
  );
}

export function Header({ onMenuClick, title }: HeaderProps) {
  const { activeCompanyId } = useTenant();
  const { user } = useUser();
  const { organisationName, roleLabel } = useIdentity();
  const [items, setItems] = useState<NotificationItem[]>([]);

  useEffect(() => {
    let isMounted = true;

    async function loadNotifications() {
      if (!activeCompanyId || !user?.id) return;
      try {
        const records = await listMyNotifications(activeCompanyId as any, user.id as any, 20);
        if (!isMounted) return;
        setItems(mapNotifications(records));
      } catch {
        // Do not surface header errors to the user
      }
    }

    void loadNotifications();
    const interval = setInterval(() => {
      void loadNotifications();
    }, 60_000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeCompanyId, user?.id]);

  return (
    <header className="sticky top-0 z-50 shrink-0 bg-white border-b border-surface-300">
      <div className="flex items-center justify-between h-16 px-4 lg:px-6">
        {/* Left side */}
        <div className="flex items-center gap-4">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 rounded-lg text-charcoal-500 hover:bg-surface-100 hover:text-charcoal transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal"
            aria-label="Open menu"
          >
            <MenuIcon className="w-5 h-5" />
          </button>

          {title && (
            <h1 className="text-lg font-semibold text-charcoal hidden sm:block">
              {title}
            </h1>
          )}
        </div>

        {/* Search bar - desktop */}
        <div className="hidden md:flex flex-1 max-w-md mx-8">
          <div className="relative w-full">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-400" />
            <input
              type="search"
              placeholder="Search documents, incidents, tasks..."
              className="w-full pl-10 pr-4 py-2 bg-surface-100 border border-surface-200 rounded-lg text-sm text-charcoal placeholder-charcoal-400 focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition-all"
            />
          </div>
        </div>

        {/* Right side: org + role badge, seats (owner/admin), notifications, user */}
        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-2 text-sm">
            <span className="text-charcoal-500 truncate max-w-[120px]" title={organisationName}>
              {organisationName}
            </span>
            <span className="px-2 py-0.5 rounded bg-teal/10 text-teal font-medium text-xs">
              {roleLabel}
            </span>
          </div>
          <SeatsRemainingBadge />
          <button
            className="md:hidden p-2 rounded-lg text-charcoal-500 hover:bg-surface-100 hover:text-charcoal transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal"
            aria-label="Search"
          >
            <SearchIcon className="w-5 h-5" />
          </button>
          <NotificationBell items={items} />
          <div className="w-px h-6 bg-surface-300 mx-2 hidden sm:block" />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

function mapNotifications(records: Notification[]): NotificationItem[] {
  return records.map((n) => {
    const severity = String((n as any).severity || 'medium').toLowerCase();
    let type: NotificationItem['type'] = 'info';
    if (severity === 'critical') type = 'critical';
    else if (severity === 'high') type = 'warning';
    else if (severity === 'low') type = 'success';

    return {
      id: n.id,
      type,
      title: n.title,
      message: n.message,
      time: new Date(n.created_at).toLocaleString(),
      read: !!(n as any).read_at
    };
  });
}
