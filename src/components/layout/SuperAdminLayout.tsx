import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { MenuIcon } from 'lucide-react';
import { SuperAdminSidebar } from './SuperAdminSidebar';
import { UserMenu } from '../ui/UserMenu';

export function SuperAdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
          <div className="p-4 lg:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
