-- Legal updates table + FK relationship required by legal module.
-- Fixes:
-- 1) 404 on /api/database/records/legal_updates when table is missing
-- 2) PostgREST relationship errors when FK is missing from schema cache
-- Safe to run multiple times.

create table if not exists public.legal_updates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  legal_requirement_id uuid not null,
  date_amended date null,
  law_updated_date date null,
  summary_of_change text null,
  impact_on_business text null,
  action_required text null,
  responsible_user_id uuid null,
  responsible_external_name text null,
  deadline date null,
  completion_status text not null default 'OPEN' check (completion_status in ('OPEN', 'CLOSED')),
  closure_note text null,
  closed_at timestamptz null,
  closed_by_user_id uuid null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.legal_updates
  add column if not exists company_id uuid,
  add column if not exists legal_requirement_id uuid,
  add column if not exists date_amended date,
  add column if not exists law_updated_date date,
  add column if not exists summary_of_change text,
  add column if not exists impact_on_business text,
  add column if not exists action_required text,
  add column if not exists responsible_user_id uuid,
  add column if not exists responsible_external_name text,
  add column if not exists deadline date,
  add column if not exists completion_status text,
  add column if not exists closure_note text,
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by_user_id uuid,
  add column if not exists created_by_user_id uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table if exists public.legal_updates
  alter column completion_status set default 'OPEN';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'legal_updates_completion_status_check'
      and conrelid = 'public.legal_updates'::regclass
  ) then
    alter table public.legal_updates
      add constraint legal_updates_completion_status_check
      check (completion_status in ('OPEN', 'CLOSED'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'legal_updates_legal_requirement_id_fkey'
      and conrelid = 'public.legal_updates'::regclass
  ) then
    alter table public.legal_updates
      add constraint legal_updates_legal_requirement_id_fkey
      foreign key (legal_requirement_id)
      references public.legal_requirements(id)
      on delete cascade;
  end if;
end
$$;

create index if not exists idx_legal_updates_company_created
  on public.legal_updates(company_id, created_at desc);

create index if not exists idx_legal_updates_company_deadline
  on public.legal_updates(company_id, deadline);

create index if not exists idx_legal_updates_requirement
  on public.legal_updates(legal_requirement_id);

alter table if exists public.legal_updates enable row level security;

drop policy if exists legal_updates_select_member on public.legal_updates;
create policy legal_updates_select_member
on public.legal_updates for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists legal_updates_write_management on public.legal_updates;
create policy legal_updates_write_management
on public.legal_updates for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());
