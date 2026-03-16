-- Legal Requirements: Finding, Target Date, and HR responsible link
-- Date: 2026-03-16
-- Purpose:
--   - Add `finding` text field above Actions Needed in the UI.
--   - Add `target_date` to track when actions should be completed.
--   - Add `responsible_employee_id` to link to HR employees while
--     keeping existing `responsible_user_id` semantics.
-- Safe to run multiple times.

alter table if exists public.legal_requirements
  add column if not exists finding text;

alter table if exists public.legal_requirements
  add column if not exists target_date date;

alter table if exists public.legal_requirements
  add column if not exists responsible_employee_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'legal_requirements_responsible_employee_id_fkey'
      and conrelid = 'public.legal_requirements'::regclass
  ) then
    alter table public.legal_requirements
      add constraint legal_requirements_responsible_employee_id_fkey
      foreign key (responsible_employee_id)
      references public.hr_employees(id)
      on delete set null;
  end if;
end
$$;

create index if not exists idx_legal_requirements_company_target_date
  on public.legal_requirements(company_id, target_date);

