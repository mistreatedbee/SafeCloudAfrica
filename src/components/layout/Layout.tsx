import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
type LayoutProps = {
  children: React.ReactNode;
  title?: string;
};
export function Layout({ children, title }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden isolate">
        <Header onMenuClick={() => setSidebarOpen(true)} title={title} />

        <main className="flex-1 min-h-0 overflow-y-auto relative z-0">
          <div className="p-4 lg:p-6">{children}</div>
        </main>
      </div>
    </div>);

}
