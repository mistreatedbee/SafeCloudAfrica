import React from 'react';
import { NavLink } from 'react-router-dom';

const HR_LINKS = [
  { to: '/dashboard/hr', label: 'Dashboard', end: true },
  { to: '/dashboard/hr/employees', label: 'Employees' },
  { to: '/dashboard/hr/documents', label: 'Documents' },
  { to: '/dashboard/hr/recruitment', label: 'Recruitment' },
  { to: '/dashboard/hr/labour', label: 'Labour' },
  { to: '/dashboard/hr/performance', label: 'Performance' },
  { to: '/dashboard/hr/hours', label: 'Hours Worked' },
  { to: '/dashboard/hr/leave', label: 'Leave' },
  { to: '/dashboard/hr/settings', label: 'Settings' }
] as const;

export function HrSectionNav() {
  return (
    <div className="bg-white border border-surface-300 rounded-xl p-2 overflow-x-auto">
      <div className="flex gap-2 min-w-max">
        {HR_LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg text-sm font-medium ${isActive ? 'bg-teal text-white' : 'text-charcoal-600 hover:bg-surface-100'}`
            }
          >
            {link.label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
