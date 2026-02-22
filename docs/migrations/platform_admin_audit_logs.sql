-- Audit log for Super Admin actions (license create, module toggle, user disable, support mode, etc.).
-- Apply after phase2-schema.sql. Safe to run multiple times.

create table if not exists public.platform_admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null,
  action text not null,
  target_company_id uuid null,
  target_user_id uuid null,
  details jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_admin_audit_logs_actor on public.platform_admin_audit_logs(actor_user_id);
create index if not exists idx_platform_admin_audit_logs_action on public.platform_admin_audit_logs(action);
create index if not exists idx_platform_admin_audit_logs_created_at on public.platform_admin_audit_logs(created_at desc);

alter table public.platform_admin_audit_logs enable row level security;

-- Only platform admins can read; only current user can insert their own action
drop policy if exists platform_admin_audit_logs_select on public.platform_admin_audit_logs;
create policy platform_admin_audit_logs_select
  on public.platform_admin_audit_logs for select
  using (public.is_platform_admin());

drop policy if exists platform_admin_audit_logs_insert on public.platform_admin_audit_logs;
create policy platform_admin_audit_logs_insert
  on public.platform_admin_audit_logs for insert
  with check (actor_user_id = public.request_user_id() and public.is_platform_admin());

comment on table public.platform_admin_audit_logs is 'Audit trail for Super Admin actions.';
