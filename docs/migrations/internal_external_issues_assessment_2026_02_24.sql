-- Internal & External Issues Assessment Register (Quality module)
-- Adds register headers + child issues table with risk scoring, workflow, approvals, and RLS.

create table if not exists public.quality_internal_external_issues_register_counters (
  company_id uuid not null references public.companies(id) on delete cascade,
  year integer not null,
  last_number integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (company_id, year)
);

create table if not exists public.quality_internal_external_issues_registers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  doc_no text not null default 'XYZ-IEIRA-F-002',
  issue_no text not null,
  assessment_year integer not null,
  assessment_done_by_user_id uuid null,
  assessment_done_by_name_snapshot text not null,
  assessment_done_on date not null default current_date,
  assessment_updated_on date not null default current_date,
  approved_by_user_id uuid null,
  approved_at timestamptz null,
  approval_signature text null,
  revision_number integer not null default 1,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, assessment_year, issue_no)
);

create table if not exists public.quality_internal_external_issues (
  id uuid primary key default gen_random_uuid(),
  register_id uuid not null references public.quality_internal_external_issues_registers(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  ref_no integer not null,
  scope text not null,
  issue_identification text not null,
  risk_or_opp text not null,
  likelihood integer not null check (likelihood between 1 and 5),
  severity integer not null check (severity between 1 and 5),
  risk_rating integer not null,
  nature text not null,
  nature_override boolean not null default false,
  control_measure text null,
  responsible_user_id uuid null,
  responsible_name_snapshot text not null,
  target_date date null,
  status text not null default 'Open'
    check (status in ('Open', 'In Progress', 'Closed')),
  closure_date date null,
  closure_evidence_file_ids uuid[] null,
  created_by_user_id uuid not null,
  updated_by_user_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (register_id, ref_no),
  check (risk_rating = (likelihood * severity))
);

alter table public.quality_internal_external_issues
  drop constraint if exists quality_internal_external_issues_close_requirements_check;
alter table public.quality_internal_external_issues
  add constraint quality_internal_external_issues_close_requirements_check
  check (
    status <> 'Closed'
    or (
      length(trim(coalesce(control_measure, ''))) > 0
      and closure_date is not null
    )
  );

create index if not exists idx_quality_ie_registers_company_assessment_date
  on public.quality_internal_external_issues_registers(company_id, assessment_done_on desc);
create index if not exists idx_quality_ie_registers_company_issue_no
  on public.quality_internal_external_issues_registers(company_id, assessment_year desc, issue_no);
create index if not exists idx_quality_ie_issues_company_register
  on public.quality_internal_external_issues(company_id, register_id, ref_no);
create index if not exists idx_quality_ie_issues_company_status
  on public.quality_internal_external_issues(company_id, status, updated_at desc);
create index if not exists idx_quality_ie_issues_company_target
  on public.quality_internal_external_issues(company_id, target_date);
create index if not exists idx_quality_ie_issues_company_responsible
  on public.quality_internal_external_issues(company_id, responsible_user_id);
create index if not exists idx_quality_ie_issues_company_nature
  on public.quality_internal_external_issues(company_id, nature);

create or replace function public.quality_ie_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_quality_ie_registers_set_updated_at on public.quality_internal_external_issues_registers;
create trigger trg_quality_ie_registers_set_updated_at
before update on public.quality_internal_external_issues_registers
for each row execute function public.quality_ie_set_updated_at();

drop trigger if exists trg_quality_ie_issues_set_updated_at on public.quality_internal_external_issues;
create trigger trg_quality_ie_issues_set_updated_at
before update on public.quality_internal_external_issues
for each row execute function public.quality_ie_set_updated_at();

alter table public.quality_internal_external_issues_register_counters enable row level security;
alter table public.quality_internal_external_issues_registers enable row level security;
alter table public.quality_internal_external_issues enable row level security;

drop policy if exists quality_ie_register_counter_select on public.quality_internal_external_issues_register_counters;
create policy quality_ie_register_counter_select
on public.quality_internal_external_issues_register_counters for select
using (
  public.is_platform_admin()
  or public.company_role(company_id) in ('owner', 'admin', 'manager', 'supervisor', 'consultant')
);

drop policy if exists quality_ie_register_counter_write on public.quality_internal_external_issues_register_counters;
create policy quality_ie_register_counter_write
on public.quality_internal_external_issues_register_counters for all
using (
  public.is_platform_admin()
  or public.company_role(company_id) in ('owner', 'admin', 'manager', 'supervisor')
)
with check (
  public.is_platform_admin()
  or public.company_role(company_id) in ('owner', 'admin', 'manager', 'supervisor')
);

drop policy if exists quality_ie_registers_select_scoped on public.quality_internal_external_issues_registers;
create policy quality_ie_registers_select_scoped
on public.quality_internal_external_issues_registers for select
using (
  public.is_platform_admin()
  or public.company_role(company_id) in ('owner', 'admin', 'manager', 'supervisor', 'consultant', 'auditor')
);

drop policy if exists quality_ie_registers_insert_scoped on public.quality_internal_external_issues_registers;
create policy quality_ie_registers_insert_scoped
on public.quality_internal_external_issues_registers for insert
with check (
  public.is_platform_admin()
  or public.company_role(company_id) in ('owner', 'admin', 'manager', 'supervisor')
);

drop policy if exists quality_ie_registers_update_scoped on public.quality_internal_external_issues_registers;
create policy quality_ie_registers_update_scoped
on public.quality_internal_external_issues_registers for update
using (
  public.is_platform_admin()
  or public.company_role(company_id) in ('owner', 'admin', 'manager', 'supervisor')
)
with check (
  public.is_platform_admin()
  or public.company_role(company_id) in ('owner', 'admin', 'manager', 'supervisor')
);

drop policy if exists quality_ie_issues_select_scoped on public.quality_internal_external_issues;
create policy quality_ie_issues_select_scoped
on public.quality_internal_external_issues for select
using (
  public.is_platform_admin()
  or public.company_role(company_id) in ('owner', 'admin', 'manager', 'supervisor', 'consultant', 'auditor')
);

drop policy if exists quality_ie_issues_insert_scoped on public.quality_internal_external_issues;
create policy quality_ie_issues_insert_scoped
on public.quality_internal_external_issues for insert
with check (
  public.is_platform_admin()
  or public.company_role(company_id) in ('owner', 'admin', 'manager', 'supervisor')
);

drop policy if exists quality_ie_issues_update_scoped on public.quality_internal_external_issues;
create policy quality_ie_issues_update_scoped
on public.quality_internal_external_issues for update
using (
  public.is_platform_admin()
  or public.company_role(company_id) in ('owner', 'admin', 'manager', 'supervisor')
)
with check (
  public.is_platform_admin()
  or public.company_role(company_id) in ('owner', 'admin', 'manager', 'supervisor')
);
