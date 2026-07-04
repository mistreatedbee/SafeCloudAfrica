import React, { useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { FloatingSupportChat } from '../support/FloatingSupportChat';
import { subscribeToBackendUnavailable, type BackendUnavailableDetail } from '../../api/liveData';
import { startProactiveSessionRefresh, stopProactiveSessionRefresh } from '../../api/insforge/ensureSession';

type LayoutProps = {
  children: React.ReactNode;
  title?: string;
};

export function Layout({ children, title }: LayoutProps) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);
  const [backendIssue, setBackendIssue] = useState<BackendUnavailableDetail | null>(null);
  const [backendIssueDismissedAt, setBackendIssueDismissedAt] = useState<number>(0);

  useEffect(() => {
    return subscribeToBackendUnavailable((detail) => {
      // Avoid spamming the UI if multiple requests fail in a short burst.
      const now = Date.now();
      if (now - backendIssueDismissedAt < 10_000) return;
      setBackendIssue(detail);
    });
  }, [backendIssueDismissedAt]);

  useEffect(() => {
    startProactiveSessionRefresh();
    return () => stopProactiveSessionRefresh();
  }, []);

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      <Sidebar
        isOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
        isCollapsed={desktopSidebarCollapsed}
        onToggleCollapsed={() => setDesktopSidebarCollapsed((prev) => !prev)}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden isolate">
        <Header
          onMenuClick={() => setMobileSidebarOpen(true)}
          onSidebarToggle={() => setDesktopSidebarCollapsed((prev) => !prev)}
          isSidebarCollapsed={desktopSidebarCollapsed}
          title={title}
        />

        {backendIssue && (
          <div className="px-4 lg:px-6 pt-3">
            <div className="bg-warning/10 border border-warning/30 rounded-xl px-4 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-charcoal">Service temporarily unavailable</p>
                <p className="text-sm text-charcoal-600 mt-0.5">
                  Some data may not load and saves may fail. Please wait a moment and try again.
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

        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scroll-pt-24">
          <div className="p-4 lg:p-6 w-full max-w-full">{children}</div>
        </main>
      </div>
      <FloatingSupportChat />
    </div>
  );

}
