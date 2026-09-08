import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { MenuIcon } from 'lucide-react';
import { SuperAdminSidebar } from './SuperAdminSidebar';
import { UserMenu } from '../ui/UserMenu';
import { subscribeToBackendUnavailable, type BackendUnavailableDetail } from '../../api/liveData';

export function SuperAdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [backendIssue, setBackendIssue] = useState<BackendUnavailableDetail | null>(null);
  const [backendIssueDismissedAt, setBackendIssueDismissedAt] = useState(0);

  useEffect(() => {
    return subscribeToBackendUnavailable((detail) => {
      const now = Date.now();
      if (now - backendIssueDismissedAt < 10_000) return;
      setBackendIssue(detail);
    });
  }, [backendIssueDismissedAt]);

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      <SuperAdminSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden isolate">
        <header className="sticky top-0 z-50 shrink-0 bg-white border-b border-surface-300">
          <div className="flex items-center justify-between h-16 px-4 lg:px-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-lg text-charcoal-500 hover:bg-surface-100 hover:text-charcoal transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                aria-label="Open menu"
              >
                <MenuIcon className="w-5 h-5" />
              </button>
              <h1 className="text-lg font-semibold text-charcoal">Super Admin Dashboard</h1>
            </div>
            <div className="flex items-center gap-2">
              <UserMenu />
            </div>
          </div>
        </header>

        <main className="flex-1 min-h-0 overflow-y-auto relative z-0">
          {backendIssue && (
            <div className="px-4 lg:px-6 pt-4">
              <div className="bg-warning/10 border border-warning/30 rounded-xl px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-charcoal">Database API temporarily unavailable</p>
                  <p className="text-sm text-charcoal-600 mt-0.5">
                    Organisation lists and platform metrics may show zero until the InsForge REST API recovers. Use Retry
                    on each page after a minute.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setBackendIssue(null);
                    setBackendIssueDismissedAt(Date.now());
                  }}
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-white border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
          <div className="p-4 lg:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
