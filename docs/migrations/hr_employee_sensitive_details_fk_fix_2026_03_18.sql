-- Fix: hr_employee_sensitive_details had a composite FK referencing (company_id, id)
-- but hr_employees has no unique constraint on (company_id, id).
-- This migration removes that invalid constraint and ensures the table exists.

create extension if not exists pgcrypto;

-- If the table exists, drop the invalid composite FK constraint.
alter table public.hr_employee_sensitive_details
  drop constraint if exists hr_employee_sensitive_company_fk;

-- Ensure table exists (create without composite FK).
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

create index if not exists idx_hr_employee_sensitive_company on public.hr_employee_sensitive_details(company_id, employee_id);

-- Triggers/RLS/policies are defined in the base migration; if this is the first
-- migration applied (because the base one failed), you must apply the base
-- migration after this fix so RLS and RPCs are created.

