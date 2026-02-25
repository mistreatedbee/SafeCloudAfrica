import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

type LayoutProps = {
  children: React.ReactNode;
  title?: string;
};

export function Layout({ children, title }: LayoutProps) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);

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

        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative z-0">
          <div className="p-4 lg:p-6 w-full max-w-full">{children}</div>
        </main>
      </div>
    </div>);

}
