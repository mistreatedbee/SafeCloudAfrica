-- HR Documents module enhancement: personal docs + acknowledgement docs, expiry/compliance, RBAC scaffolding
-- Date: 2026-03-03
-- Safe to run multiple times.

alter table public.hr_employee_documents
  add column if not exists issue_date date null;
alter table public.hr_employee_documents
  add column if not exists status text not null default 'ACTIVE'
  check (status in ('ACTIVE', 'EXPIRED', 'ARCHIVED'));
alter table public.hr_employee_documents
  add column if not exists notes text null;
alter table public.hr_employee_documents
  add column if not exists doc_name text null;

update public.hr_employee_documents
set doc_name = coalesce(nullif(trim(doc_name), ''), title)
where doc_name is null or trim(doc_name) = '';

-- Remove legacy duplicates before creating the unique index.
-- Keep the most recently updated/created row per logical document key.
with ranked_docs as (
  select
    id,
    row_number() over (
      partition by
        company_id,
        employee_id,
        lower(coalesce(doc_name, title)),
        lower(coalesce(doc_type, '')),
        coalesce(issue_date, date '1900-01-01')
      order by
        coalesce(updated_at, created_at) desc,
        created_at desc,
        id desc
    ) as rn
  from public.hr_employee_documents
)
delete from public.hr_employee_documents d
using ranked_docs r
where d.id = r.id
  and r.rn > 1;

create unique index if not exists idx_hr_employee_documents_no_dup
on public.hr_employee_documents(
  company_id,
  employee_id,
  lower(coalesce(doc_name, title)),
  lower(coalesce(doc_type, '')),
  coalesce(issue_date, date '1900-01-01')
);

create table if not exists public.hr_ack_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  category text not null default 'Policy',
  file_ids uuid[] not null default '{}',
  version text null,
  effective_date date null,
  review_date date null,
  assigned_all boolean not null default true,
  assigned_department_ids uuid[] null,
  assigned_roles text[] null,
  acknowledgement_required boolean not null default true,
  signature_required boolean not null default false,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_ack_receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ack_document_id uuid not null references public.hr_ack_documents(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  employee_user_id uuid null references auth.users(id) on delete set null,
  status text not null default 'PENDING' check (status in ('PENDING', 'ACKNOWLEDGED', 'SIGNED')),
  acknowledged_at timestamptz null,
  signed_at timestamptz null,
  acknowledgement_method text null,
  ip_address text null,
  device_info text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, ack_document_id, employee_id)
);

drop trigger if exists trg_hr_ack_documents_updated_at on public.hr_ack_documents;
create trigger trg_hr_ack_documents_updated_at
before update on public.hr_ack_documents
for each row execute function public.hr_set_updated_at();

drop trigger if exists trg_hr_ack_receipts_updated_at on public.hr_ack_receipts;
create trigger trg_hr_ack_receipts_updated_at
before update on public.hr_ack_receipts
for each row execute function public.hr_set_updated_at();

alter table public.hr_ack_documents enable row level security;
alter table public.hr_ack_receipts enable row level security;

drop policy if exists hr_ack_documents_all on public.hr_ack_documents;
create policy hr_ack_documents_all on public.hr_ack_documents for all
using (public.is_platform_admin() or public.is_company_member(company_id))
with check (public.is_platform_admin() or public.is_company_member(company_id));

drop policy if exists hr_ack_receipts_all on public.hr_ack_receipts;
create policy hr_ack_receipts_all on public.hr_ack_receipts for all
using (public.is_platform_admin() or public.is_company_member(company_id))
with check (public.is_platform_admin() or public.is_company_member(company_id));
