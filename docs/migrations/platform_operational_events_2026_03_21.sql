-- Operational telemetry for platform super-admin health dashboard.
-- Inserts from Vercel API use INSFORGE_SERVICE_ROLE_KEY (bypasses RLS).
-- Apply after platform_admin_audit_logs / is_platform_admin exists.

create table if not exists public.platform_operational_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  status text not null check (status in ('success', 'failure', 'info')),
  module text not null,
  message text not null,
  user_id uuid null,
  organization_id uuid null,
  details jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_operational_events_created_at
  on public.platform_operational_events(created_at desc);

create index if not exists idx_platform_operational_events_type_created
  on public.platform_operational_events(event_type, created_at desc);

alter table public.platform_operational_events enable row level security;

drop policy if exists platform_operational_events_select on public.platform_operational_events;
create policy platform_operational_events_select
  on public.platform_operational_events for select
  using (public.is_platform_admin());

comment on table public.platform_operational_events is
  'Server-written operational events (email, cron, client errors) for super-admin health; inserts via service role only.';
