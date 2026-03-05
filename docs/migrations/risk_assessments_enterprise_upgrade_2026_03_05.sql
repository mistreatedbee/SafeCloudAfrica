-- Risk assessments enterprise upgrade: templates, row-based forms, qna, sign-offs
-- Date: 2026-03-05
-- Safe to run multiple times.

-- Existing tenant key is company_id (equivalent to organization scope in this codebase).

alter table public.risk_assessments
  add column if not exists type text null,
  add column if not exists heading text null,
  add column if not exists area text null,
  add column if not exists activity text null,
  add column if not exists risk_assessor_user_id uuid null,
  add column if not exists risk_assessor_name text null,
  add column if not exists assessment_date date null,
  add column if not exists next_review_date date null,
  add column if not exists reference text null,
  add column if not exists status_v2 text null,
  add column if not exists doc_url text null,
  add column if not exists baseline_spreadsheet_bucket text null,
  add column if not exists baseline_spreadsheet_key text null,
  add column if not exists submitted_at timestamptz null,
  add column if not exists submitted_by_user_id uuid null;

-- Backfill canonical type/status values from legacy columns when missing.
update public.risk_assessments
set type = case
  when coalesce(is_prework, false) then 'prework'
  when coalesce(is_critical, false) then 'critical'
  when assessment_type in ('baseline') then 'baseline'
  else 'task'
end
where type is null;

update public.risk_assessments
set status_v2 = case
  when lower(coalesce(status, 'draft')) in ('closed', 'archived') then 'closed'
  when lower(coalesce(status, 'draft')) in ('approved', 'reviewed', 'under_review') then 'submitted'
  when lower(coalesce(status, 'draft')) in ('in-progress', 'review_required') then 'draft'
  else 'draft'
end
where status_v2 is null;

alter table public.risk_assessments
  drop constraint if exists risk_assessments_type_check;

alter table public.risk_assessments
  add constraint risk_assessments_type_check
  check (type in ('baseline', 'task', 'critical', 'prework'));

alter table public.risk_assessments
  drop constraint if exists risk_assessments_status_v2_check;

alter table public.risk_assessments
  add constraint risk_assessments_status_v2_check
  check (status_v2 in ('draft', 'submitted', 'closed'));

create index if not exists idx_risk_assessments_company_type_v2
  on public.risk_assessments(company_id, type, status_v2, updated_at desc);

create table if not exists public.risk_assessment_rows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  risk_assessment_id uuid not null references public.risk_assessments(id) on delete cascade,
  row_index integer not null default 0,
  json_data jsonb not null default '{}'::jsonb,
  severity integer null check (severity between 1 and 5),
  likelihood integer null check (likelihood between 1 and 5),
  raw_rr integer null,
  raw_index text null check (raw_index in ('Low', 'Medium', 'High')),
  residual_severity integer null check (residual_severity between 1 and 5),
  residual_likelihood integer null check (residual_likelihood between 1 and 5),
  residual_rr integer null,
  residual_index text null check (residual_index in ('Low', 'Medium', 'High')),
  responsible_person text null,
  target_date date null,
  completion_date date null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_risk_assessment_rows_unique_order
  on public.risk_assessment_rows(risk_assessment_id, row_index);

create index if not exists idx_risk_assessment_rows_company_assessment
  on public.risk_assessment_rows(company_id, risk_assessment_id, row_index);

create table if not exists public.risk_assessment_signoffs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  risk_assessment_id uuid not null references public.risk_assessments(id) on delete cascade,
  employee_user_id uuid null,
  employee_name text not null,
  signature text null,
  signed_at timestamptz not null default now(),
  supervisor_user_id uuid null,
  supervisor_signed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_risk_assessment_signoffs_company_assessment
  on public.risk_assessment_signoffs(company_id, risk_assessment_id, signed_at desc);

create table if not exists public.risk_assessment_qna (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  risk_assessment_id uuid not null references public.risk_assessments(id) on delete cascade,
  question text not null,
  answer text null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_risk_assessment_qna_company_assessment
  on public.risk_assessment_qna(company_id, risk_assessment_id, created_at desc);

create table if not exists public.risk_assessment_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  type text not null check (type in ('baseline', 'task', 'critical', 'prework')),
  header_json jsonb not null default '{}'::jsonb,
  rows_json jsonb not null default '[]'::jsonb,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_risk_assessment_templates_company_type
  on public.risk_assessment_templates(company_id, type, updated_at desc);

-- RLS: same company-scoped model used throughout the app.
alter table public.risk_assessment_rows enable row level security;
drop policy if exists risk_assessment_rows_tenant_isolation on public.risk_assessment_rows;
create policy risk_assessment_rows_tenant_isolation on public.risk_assessment_rows
  for all
  using (
    exists (
      select 1
      from public.risk_assessments ra
      where ra.id = risk_assessment_id
        and (public.is_company_member(ra.company_id) or public.is_platform_admin())
    )
  )
  with check (
    exists (
      select 1
      from public.risk_assessments ra
      where ra.id = risk_assessment_id
        and (public.is_company_consultant_or_admin(ra.company_id) or public.is_platform_admin())
    )
  );

alter table public.risk_assessment_signoffs enable row level security;
drop policy if exists risk_assessment_signoffs_tenant_isolation on public.risk_assessment_signoffs;
create policy risk_assessment_signoffs_tenant_isolation on public.risk_assessment_signoffs
  for all
  using (
    public.is_company_member(company_id) or public.is_platform_admin()
  )
  with check (
    public.is_company_member(company_id) or public.is_platform_admin()
  );

alter table public.risk_assessment_qna enable row level security;
drop policy if exists risk_assessment_qna_tenant_isolation on public.risk_assessment_qna;
create policy risk_assessment_qna_tenant_isolation on public.risk_assessment_qna
  for all
  using (
    public.is_company_member(company_id) or public.is_platform_admin()
  )
  with check (
    public.is_company_member(company_id) or public.is_platform_admin()
  );

alter table public.risk_assessment_templates enable row level security;
drop policy if exists risk_assessment_templates_tenant_isolation on public.risk_assessment_templates;
create policy risk_assessment_templates_tenant_isolation on public.risk_assessment_templates
  for all
  using (
    public.is_company_member(company_id) or public.is_platform_admin()
  )
  with check (
    public.is_company_consultant_or_admin(company_id) or public.is_platform_admin()
  );
