-- Invite model completion: org snapshot + consultant/auditor scope
-- Date: 2026-02-27
-- Safe to run multiple times.

alter table public.company_invites
  add column if not exists organization_name text null;

alter table public.company_invites
  add column if not exists consultant_scope jsonb null;

comment on column public.company_invites.organization_name is 'Denormalized organization name captured at invite creation.';
comment on column public.company_invites.consultant_scope is 'Optional scope for consultant/auditor invites: { allowedModules[], allowedDepartments[], allowedSites[], auditIds[], expiresAt }.';
