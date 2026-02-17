-- Migration: sites, departments, and user_profiles (for app API /api/database/records/...)
-- Fixes 404 on sites/departments and 400 on user_profiles upsert when backend is missing these or wrong schema.
-- Run this against the same database your InsForge app uses (e.g. Supabase linked to pas375jb).

-- 1) Sites table (GET /api/database/records/sites → 404 if missing)
create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  address text null,
  is_active boolean not null default true,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_sites_company_id on public.sites(company_id);
alter table public.sites enable row level security;

drop policy if exists sites_select_member on public.sites;
create policy sites_select_member on public.sites for select
  using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists sites_insert_manager on public.sites;
create policy sites_insert_manager on public.sites for insert
  with check (public.is_company_manager(company_id) or public.is_platform_admin());

drop policy if exists sites_update_manager on public.sites;
create policy sites_update_manager on public.sites for update
  using (public.is_company_manager(company_id) or public.is_platform_admin());

drop policy if exists sites_delete_manager on public.sites;
create policy sites_delete_manager on public.sites for delete
  using (public.is_company_manager(company_id) or public.is_platform_admin());

-- 2) Departments table (GET /api/database/records/departments → 404 if missing)
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  site_id uuid null references public.sites(id) on delete set null,
  name text not null,
  is_active boolean not null default true,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_departments_company_id on public.departments(company_id);
alter table public.departments enable row level security;

drop policy if exists departments_select_member on public.departments;
create policy departments_select_member on public.departments for select
  using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists departments_insert_manager on public.departments;
create policy departments_insert_manager on public.departments for insert
  with check (public.is_company_manager(company_id) or public.is_platform_admin());

drop policy if exists departments_update_manager on public.departments;
create policy departments_update_manager on public.departments for update
  using (public.is_company_manager(company_id) or public.is_platform_admin());

drop policy if exists departments_delete_manager on public.departments;
create policy departments_delete_manager on public.departments for delete
  using (public.is_company_manager(company_id) or public.is_platform_admin());

-- 3) user_profiles: ensure columns and unique constraint for upsert (POST 400 if missing or wrong)
-- If table already exists without site_id/department_id or without unique(company_id, user_id), fix it.
create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null,
  full_name text null,
  email text null,
  phone text null,
  department text null,
  site text null,
  site_id uuid null references public.sites(id) on delete set null,
  department_id uuid null references public.departments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id)
);

alter table public.user_profiles add column if not exists site_id uuid null;
alter table public.user_profiles add column if not exists department_id uuid null;
alter table public.user_profiles drop constraint if exists user_profiles_company_id_user_id_key;
alter table public.user_profiles add constraint user_profiles_company_id_user_id_key unique (company_id, user_id);

alter table public.user_profiles enable row level security;

drop policy if exists profiles_select_role on public.user_profiles;
create policy profiles_select_role on public.user_profiles for select
  using (public.is_company_manager(company_id) or user_id = public.request_user_id() or public.is_platform_admin());

drop policy if exists profiles_insert_self on public.user_profiles;
create policy profiles_insert_self on public.user_profiles for insert
  with check (public.is_company_member(company_id) and user_id = public.request_user_id());

drop policy if exists profiles_insert_management on public.user_profiles;
create policy profiles_insert_management on public.user_profiles for insert
  with check (public.is_company_manager(company_id) or public.is_platform_admin());

drop policy if exists profiles_update_role on public.user_profiles;
create policy profiles_update_role on public.user_profiles for update
  using (public.is_company_manager(company_id) or user_id = public.request_user_id() or public.is_platform_admin())
  with check (public.is_company_manager(company_id) or user_id = public.request_user_id() or public.is_platform_admin());
