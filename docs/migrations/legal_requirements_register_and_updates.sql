-- Legal Requirements Register + Legal Update Tracking
-- Safe to run multiple times.

create table if not exists public.legal_updates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  legal_requirement_id uuid not null references public.legal_requirements(id) on delete cascade,
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

alter table public.legal_requirements
  add column if not exists requirement_standard text,
  add column if not exists applicability text,
  add column if not exists actions_needed text,
  add column if not exists compliance_status text,
  add column if not exists responsible_user_id uuid,
  add column if not exists responsible_external_name text,
  add column if not exists references jsonb,
  add column if not exists evidence_links jsonb,
  add column if not exists updated_by_user_id uuid,
  add column if not exists deleted_at timestamptz;

-- Backfill compatibility for existing rows from old schema
update public.legal_requirements
set
  requirement_standard = coalesce(requirement_standard, requirement),
  compliance_status = coalesce(
    compliance_status,
    case status
      when 'compliant' then 'COMPLIANT'
      when 'non-compliant' then 'NON_COMPLIANT'
      else 'PARTIALLY_COMPLIANT'
    end
  ),
  references = coalesce(
    references,
    case
      when reference is null or btrim(reference) = '' then '[]'::jsonb
      else jsonb_build_array(jsonb_build_object('referenceText', reference))
    end
  ),
  evidence_links = coalesce(evidence_links, '[]'::jsonb)
where requirement_standard is null
   or compliance_status is null
   or references is null
   or evidence_links is null;

alter table public.legal_requirements
  alter column requirement_standard set not null,
  alter column compliance_status set not null,
  alter column compliance_status set default 'PARTIALLY_COMPLIANT';

alter table public.legal_requirements
  drop constraint if exists legal_requirements_compliance_status_check;

alter table public.legal_requirements
  add constraint legal_requirements_compliance_status_check
  check (compliance_status in ('NON_COMPLIANT', 'PARTIALLY_COMPLIANT', 'COMPLIANT'));

create index if not exists idx_legal_requirements_company_status_updated
  on public.legal_requirements(company_id, compliance_status, updated_at desc)
  where deleted_at is null;
create index if not exists idx_legal_requirements_company_responsible
  on public.legal_requirements(company_id, responsible_user_id, updated_at desc)
  where deleted_at is null;
create index if not exists idx_legal_requirements_company_applicability
  on public.legal_requirements(company_id, applicability)
  where deleted_at is null;
create index if not exists idx_legal_updates_company_deadline_status
  on public.legal_updates(company_id, completion_status, deadline);
create index if not exists idx_legal_updates_requirement_created
  on public.legal_updates(legal_requirement_id, created_at desc);

alter table public.legal_updates enable row level security;

drop policy if exists legal_updates_select_member on public.legal_updates;
create policy legal_updates_select_member
on public.legal_updates for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists legal_updates_write_management on public.legal_updates;
create policy legal_updates_write_management
on public.legal_updates for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());
