-- Bootstrap migration: ensure HR sensitive tables + functions exist.
-- Safe to run if previous migrations failed part-way.

create extension if not exists pgcrypto;

-- Membership HR manager flag (for access mapping)
alter table public.company_memberships
  add column if not exists is_hr_manager boolean not null default false;

-- Contract expiry tracking (non-sensitive)
alter table public.hr_employees
  add column if not exists contract_expiry_date date null;

-- Ensure sensitive details table exists (without composite FK).
create table if not exists public.hr_employee_sensitive_details (
  employee_id uuid primary key references public.hr_employees(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,

  -- Medical
  medical_aid_name text null,
  medical_aid_membership_number text null,

  -- Personal
  marital_status text null check (marital_status in ('Single', 'Married', 'Divorced', 'Separated', 'Widowed', 'Domestic Partner')),
  partner_name text null,

  -- Legal & identification
  tax_number text null,
  passport_number text null,
  passport_expiry_date date null,
  permit_number text null,
  permit_expiry_date date null,
  country_of_issue text null,

  -- Banking
  bank_name text null,
  account_holder_name text null,
  account_number text null,
  branch_code text null,
  account_type text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_hr_employee_sensitive_company
  on public.hr_employee_sensitive_details(company_id, employee_id);

-- Ensure dependents table exists
create table if not exists public.hr_employee_dependents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  dependent_name text not null,
  relationship text not null,
  contact_details text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_hr_employee_dependents_company_employee
  on public.hr_employee_dependents(company_id, employee_id);

-- Updated-at triggers (requires hr_set_updated_at from hr_module baseline)
drop trigger if exists trg_hr_employee_sensitive_updated_at on public.hr_employee_sensitive_details;
create trigger trg_hr_employee_sensitive_updated_at
before update on public.hr_employee_sensitive_details
for each row execute function public.hr_set_updated_at();

drop trigger if exists trg_hr_employee_dependents_updated_at on public.hr_employee_dependents;
create trigger trg_hr_employee_dependents_updated_at
before update on public.hr_employee_dependents
for each row execute function public.hr_set_updated_at();

-- Access helpers
create or replace function public.hr_is_hr_manager(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_memberships m
    where m.company_id = p_company_id
      and m.user_id = public.request_user_id()
      and m.is_hr_manager = true
  );
$$;

create or replace function public.hr_can_access_sensitive_employee_fields(p_company_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if public.is_platform_admin() then return true; end if;
  v_role := public.company_role(p_company_id);
  if v_role in ('owner', 'admin') then return true; end if;
  if public.hr_is_hr_manager(p_company_id) then return true; end if;
  return false;
end;
$$;

grant execute on function public.hr_is_hr_manager(uuid) to authenticated;
grant execute on function public.hr_can_access_sensitive_employee_fields(uuid) to authenticated;

-- Dependents replace RPC
create or replace function public.hr_replace_employee_dependents(
  p_company_id uuid,
  p_employee_id uuid,
  p_dependents jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_item jsonb;
begin
  if not public.hr_can_access_sensitive_employee_fields(p_company_id) then
    raise exception 'Not authorized.';
  end if;

  delete from public.hr_employee_dependents
  where company_id = p_company_id and employee_id = p_employee_id;

  if p_dependents is null or jsonb_typeof(p_dependents) <> 'array' then
    return 0;
  end if;

  for v_item in select * from jsonb_array_elements(p_dependents)
  loop
    insert into public.hr_employee_dependents (
      company_id,
      employee_id,
      dependent_name,
      relationship,
      contact_details
    )
    values (
      p_company_id,
      p_employee_id,
      coalesce(nullif(btrim(v_item->>'dependent_name'), ''), nullif(btrim(v_item->>'name'), ''), ''),
      coalesce(nullif(btrim(v_item->>'relationship'), ''), ''),
      nullif(btrim(v_item->>'contact_details'), '')
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.hr_replace_employee_dependents(uuid, uuid, jsonb) to authenticated;

-- RLS + policies (tight access)
alter table public.hr_employee_sensitive_details enable row level security;
alter table public.hr_employee_dependents enable row level security;

drop policy if exists hr_employee_sensitive_select on public.hr_employee_sensitive_details;
create policy hr_employee_sensitive_select on public.hr_employee_sensitive_details
for select
using (public.hr_can_access_sensitive_employee_fields(company_id));

drop policy if exists hr_employee_sensitive_modify on public.hr_employee_sensitive_details;
create policy hr_employee_sensitive_modify on public.hr_employee_sensitive_details
for all
using (public.hr_can_access_sensitive_employee_fields(company_id))
with check (public.hr_can_access_sensitive_employee_fields(company_id));

drop policy if exists hr_employee_dependents_select on public.hr_employee_dependents;
create policy hr_employee_dependents_select on public.hr_employee_dependents
for select
using (public.hr_can_access_sensitive_employee_fields(company_id));

drop policy if exists hr_employee_dependents_modify on public.hr_employee_dependents;
create policy hr_employee_dependents_modify on public.hr_employee_dependents
for all
using (public.hr_can_access_sensitive_employee_fields(company_id))
with check (public.hr_can_access_sensitive_employee_fields(company_id));

