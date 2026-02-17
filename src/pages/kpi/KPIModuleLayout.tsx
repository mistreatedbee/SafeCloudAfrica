import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Layout } from '../../components/layout/Layout';

const kpiNav = [
  { to: '/modules/hr/kpis', end: true, label: 'Dashboard' },
  { to: '/modules/hr/kpis/assessments', end: false, label: 'Assessments' },
  { to: '/modules/hr/kpis/library', end: true, label: 'Library' },
  { to: '/modules/hr/kpis/findings', end: true, label: 'Findings' },
  { to: '/modules/hr/kpis/reports', end: true, label: 'Reports' },
  { to: '/modules/hr/kpis/trends', end: true, label: 'Trends' }
];

export function KPIModuleLayout() {
  return (
    <Layout title="Performance KPIs">
      <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">
        <nav className="flex flex-wrap gap-1 border-b border-surface-200 pb-2">
          {kpiNav.map(({ to, end, label }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-teal/10 text-teal' : 'text-charcoal-500 hover:bg-surface-100 hover:text-charcoal'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <Outlet />
      </div>
    </Layout>
  );
}
