-- Migration: Training Matrix (job-linked), providers, cost, status lifecycle
-- Run after phase2-schema.sql and sites_departments_user_profiles.sql
-- Adds: job_descriptions, training_providers, course_provider_prices, job_training_requirements;
-- Alters: training_courses, user_profiles, training_records

-- 1) job_descriptions
create table if not exists public.job_descriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  department_id uuid null references public.departments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_job_descriptions_company on public.job_descriptions(company_id);
alter table public.job_descriptions enable row level security;

drop policy if exists job_descriptions_select_member on public.job_descriptions;
create policy job_descriptions_select_member on public.job_descriptions for select
  using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists job_descriptions_write_management on public.job_descriptions;
create policy job_descriptions_write_management on public.job_descriptions for all
  using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
  with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- 2) training_courses – add columns
alter table public.training_courses add column if not exists unit_standard_required text null;
alter table public.training_courses add column if not exists credits integer null;
alter table public.training_courses add column if not exists default_frequency_months integer null;
alter table public.training_courses add column if not exists default_validity_months integer null;
alter table public.training_courses add column if not exists updated_at timestamptz null;
update public.training_courses set updated_at = created_at where updated_at is null;
alter table public.training_courses alter column updated_at set default now();
alter table public.training_courses alter column updated_at set not null;

-- 3) training_providers
create table if not exists public.training_providers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  provider_type text not null check (provider_type in ('INTERNAL', 'EXTERNAL')),
  contact_info text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_training_providers_company on public.training_providers(company_id);
alter table public.training_providers enable row level security;

drop policy if exists training_providers_select_member on public.training_providers;
create policy training_providers_select_member on public.training_providers for select
  using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists training_providers_write_management on public.training_providers;
create policy training_providers_write_management on public.training_providers for all
  using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
  with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- 4) course_provider_prices
create table if not exists public.course_provider_prices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  course_id uuid not null references public.training_courses(id) on delete cascade,
  provider_id uuid not null references public.training_providers(id) on delete cascade,
  price numeric null,
  currency text not null default 'ZAR',
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, course_id, provider_id)
);
create index if not exists idx_course_provider_prices_company on public.course_provider_prices(company_id);
alter table public.course_provider_prices enable row level security;

drop policy if exists course_provider_prices_select_member on public.course_provider_prices;
create policy course_provider_prices_select_member on public.course_provider_prices for select
  using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists course_provider_prices_write_management on public.course_provider_prices;
create policy course_provider_prices_write_management on public.course_provider_prices for all
  using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
  with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- 5) job_training_requirements
create table if not exists public.job_training_requirements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  job_description_id uuid not null references public.job_descriptions(id) on delete cascade,
  course_id uuid not null references public.training_courses(id) on delete cascade,
  frequency_months integer null,
  is_mandatory boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, job_description_id, course_id)
);
create index if not exists idx_job_training_requirements_company on public.job_training_requirements(company_id);
create index if not exists idx_job_training_requirements_job on public.job_training_requirements(job_description_id);
alter table public.job_training_requirements enable row level security;

drop policy if exists job_training_requirements_select_member on public.job_training_requirements;
create policy job_training_requirements_select_member on public.job_training_requirements for select
  using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists job_training_requirements_write_management on public.job_training_requirements;
create policy job_training_requirements_write_management on public.job_training_requirements for all
  using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
  with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- 6) user_profiles – add columns (job_description_id references job_descriptions; supervisor_user_id = user id of supervisor, no FK)
alter table public.user_profiles add column if not exists job_description_id uuid null references public.job_descriptions(id) on delete set null;
alter table public.user_profiles add column if not exists employee_number text null;
alter table public.user_profiles add column if not exists supervisor_user_id uuid null;

-- 7) training_records – evolve into assignment table
alter table public.training_records add column if not exists job_description_id uuid null references public.job_descriptions(id) on delete set null;
alter table public.training_records add column if not exists provider_id uuid null references public.training_providers(id) on delete set null;
alter table public.training_records add column if not exists provider_type text null;
alter table public.training_records add column if not exists arranged_at timestamptz null;
alter table public.training_records add column if not exists cost numeric null;
alter table public.training_records add column if not exists updated_at timestamptz null;

-- Add status with check constraint (after columns exist)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'training_records' and column_name = 'status'
  ) then
    alter table public.training_records add column status text null;
    update public.training_records set status = 'COMPLETED' where status is null;
    alter table public.training_records alter column status set not null;
    alter table public.training_records add constraint training_records_status_check
      check (status in ('REQUIRED', 'SCHEDULED', 'COMPLETED', 'EXPIRED', 'OVERDUE'));
    alter table public.training_records alter column status set default 'REQUIRED';
  end if;
end $$;

-- Make completed_at nullable (required only when status = COMPLETED)
alter table public.training_records alter column completed_at drop not null;

-- COMPLETED rows must have completed_at and certificate
alter table public.training_records drop constraint if exists training_records_completed_requires_cert;
alter table public.training_records add constraint training_records_completed_requires_cert check (
  (status <> 'COMPLETED') or (
    completed_at is not null
    and certificate_bucket is not null
    and certificate_key is not null
  )
);

update public.training_records set updated_at = created_at where updated_at is null;
alter table public.training_records alter column updated_at set default now();

create index if not exists idx_training_records_status on public.training_records(company_id, status);
create index if not exists idx_training_records_user_status on public.training_records(company_id, user_id, status);
create index if not exists idx_training_records_expires_at on public.training_records(expires_at) where expires_at is not null;
