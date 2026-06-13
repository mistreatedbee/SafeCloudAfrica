export const MANAGEMENT_ROLES = ['owner', 'admin', 'manager', 'supervisor'] as const;
export type ManagementRole = typeof MANAGEMENT_ROLES[number];

export const ADMIN_ROLES = ['owner', 'admin'] as const;
export type AdminRole = typeof ADMIN_ROLES[number];

export const ALL_ROLES = ['owner', 'admin', 'manager', 'supervisor', 'employee', 'consultant', 'auditor'] as const;
export type AppRole = typeof ALL_ROLES[number];
