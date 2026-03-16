-- Legal requirement links table for cross-module linking.
-- Links legal requirements to documents, risk assessments, and NCRs.
-- Safe to run multiple times.

create table if not exists public.legal_requirement_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  legal_requirement_id uuid not null references public.legal_requirements(id) on delete cascade,
  linked_module_type text not null check (linked_module_type in ('document','risk_assessment','ncr')),
  linked_record_id uuid not null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now()
);

-- Ensure columns exist if table was created before
alter table if exists public.legal_requirement_links
  add column if not exists company_id uuid,
  add column if not exists legal_requirement_id uuid,
  add column if not exists linked_module_type text,
  add column if not exists linked_record_id uuid,
  add column if not exists created_by_user_id uuid,
  add column if not exists created_at timestamptz default now();

-- Add check constraint for linked_module_type (idempotent)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'legal_requirement_links_linked_module_type_check'
      and conrelid = 'public.legal_requirement_links'::regclass
  ) then
    alter table public.legal_requirement_links
      add constraint legal_requirement_links_linked_module_type_check
      check (linked_module_type in ('document','risk_assessment','ncr'));
  end if;
end
$$;

create index if not exists idx_legal_requirement_links_requirement
  on public.legal_requirement_links(company_id, legal_requirement_id);

create index if not exists idx_legal_requirement_links_target
  on public.legal_requirement_links(company_id, linked_module_type, linked_record_id);

alter table if exists public.legal_requirement_links enable row level security;

drop policy if exists legal_requirement_links_select_member on public.legal_requirement_links;
create policy legal_requirement_links_select_member
on public.legal_requirement_links for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists legal_requirement_links_write_management on public.legal_requirement_links;
create policy legal_requirement_links_write_management
on public.legal_requirement_links for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

