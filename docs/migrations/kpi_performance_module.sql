-- KPI Performance Module: kpi_items, kpi_assessments, kpi_assessment_lines, kpi_findings
-- Apply after phase2-schema.sql. Safe to run multiple times (create if not exists / add column if not exists).

-- ---------------------------------------------------------------------------
-- 1. KPIItem (library / template)
-- ---------------------------------------------------------------------------
create table if not exists public.kpi_items (
  kpi_item_id uuid primary key default gen_random_uuid(),
  organization_id uuid null references public.companies(id) on delete cascade,
  title text not null,
  description text null,
  default_importance text not null check (default_importance in ('low','medium','high')) default 'medium',
  category text null,
  tags jsonb null,
  active boolean not null default true,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_kpi_items_org_active on public.kpi_items(organization_id, active);
create index if not exists idx_kpi_items_org_updated on public.kpi_items(organization_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- 2. KPIAssessment (instance / evaluation)
-- ---------------------------------------------------------------------------
create table if not exists public.kpi_assessments (
  assessment_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.companies(id) on delete cascade,
  assessment_type text not null check (assessment_type in ('employee','project')),
  employee_id uuid null,
  employee_name_snapshot text null,
  manager_id uuid not null,
  manager_name_snapshot text null,
  project_id uuid null,
  project_name text null,
  department_id uuid null,
  site_id uuid null,
  period_type text not null check (period_type in ('monthly','quarterly','annual')),
  period_start_date date not null,
  period_end_date date not null,
  status text not null check (status in ('draft','submitted','under_review','finalized','closed')) default 'draft',
  employee_comments text null,
  manager_remarks text null,
  overall_score numeric null,
  overall_rating_band text null,
  bonus_score numeric null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_kpi_assessments_org_type_created on public.kpi_assessments(organization_id, assessment_type, created_at desc);
create index if not exists idx_kpi_assessments_org_employee on public.kpi_assessments(organization_id, employee_id);
create index if not exists idx_kpi_assessments_org_manager on public.kpi_assessments(organization_id, manager_id);
create index if not exists idx_kpi_assessments_org_status on public.kpi_assessments(organization_id, status);
create index if not exists idx_kpi_assessments_department on public.kpi_assessments(department_id);
create index if not exists idx_kpi_assessments_period on public.kpi_assessments(period_start_date, period_end_date);

-- ---------------------------------------------------------------------------
-- 3. KPIAssessmentLine (scored rows) - not_achieved via trigger
-- ---------------------------------------------------------------------------
create table if not exists public.kpi_assessment_lines (
  line_id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.kpi_assessments(assessment_id) on delete cascade,
  kpi_item_id uuid null references public.kpi_items(kpi_item_id) on delete set null,
  custom_kpi_title text null,
  kpi_title text not null,
  importance_rating text not null check (importance_rating in ('low','medium','high')) default 'medium',
  employee_own_rating integer null check (employee_own_rating between 1 and 5),
  manager_rating integer null check (manager_rating between 1 and 5),
  achieved boolean null,
  not_achieved boolean null,
  notes text null,
  finding_generated boolean not null default false,
  finding_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_kpi_assessment_lines_assessment on public.kpi_assessment_lines(assessment_id);
create index if not exists idx_kpi_assessment_lines_finding on public.kpi_assessment_lines(finding_id);

-- Trigger: auto-calculate not_achieved and achieved when manager_rating changes
create or replace function public.kpi_assessment_line_not_achieved_fn()
returns trigger language plpgsql as $$
begin
  if new.manager_rating is not null then
    new.not_achieved := (new.manager_rating <= 2);
    new.achieved := not (new.manager_rating <= 2);
  else
    new.not_achieved := null;
    new.achieved := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Run trigger on insert too so new rows get not_achieved/achieved when manager_rating is set

drop trigger if exists kpi_assessment_line_not_achieved_trigger on public.kpi_assessment_lines;
create trigger kpi_assessment_line_not_achieved_trigger
  before insert or update of manager_rating on public.kpi_assessment_lines
  for each row execute function public.kpi_assessment_line_not_achieved_fn();

-- ---------------------------------------------------------------------------
-- 4. KPIFinding (closure with proof)
-- ---------------------------------------------------------------------------
create table if not exists public.kpi_findings (
  finding_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.companies(id) on delete cascade,
  assessment_id uuid not null references public.kpi_assessments(assessment_id) on delete cascade,
  line_id uuid not null references public.kpi_assessment_lines(line_id) on delete cascade,
  employee_id uuid null,
  project_id uuid null,
  description text not null,
  assigned_line_manager_id uuid not null,
  due_date date not null,
  status text not null check (status in ('open','in_progress','awaiting_evidence','under_review','closed','overdue')) default 'open',
  proof_uploads jsonb null,
  manager_sign_off_user_id uuid null,
  manager_sign_off_signed_at timestamptz null,
  manager_sign_off_comment text null,
  manager_sign_off_signature_method text null,
  closed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_kpi_findings_assessment on public.kpi_findings(assessment_id);
create index if not exists idx_kpi_findings_assigned_manager on public.kpi_findings(assigned_line_manager_id);
create index if not exists idx_kpi_findings_status on public.kpi_findings(status);
create index if not exists idx_kpi_findings_due_date on public.kpi_findings(due_date);
create index if not exists idx_kpi_findings_org on public.kpi_findings(organization_id);

-- Add FK from lines to findings (optional; avoids circular dependency at create time)
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'fk_kpi_assessment_lines_finding'
    and table_name = 'kpi_assessment_lines'
  ) then
    alter table public.kpi_assessment_lines
      add constraint fk_kpi_assessment_lines_finding
      foreign key (finding_id) references public.kpi_findings(finding_id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.kpi_items enable row level security;
drop policy if exists kpi_items_select on public.kpi_items;
create policy kpi_items_select on public.kpi_items for select
  using (organization_id is null or public.is_company_member(organization_id));
drop policy if exists kpi_items_insert on public.kpi_items;
create policy kpi_items_insert on public.kpi_items for insert
  with check (organization_id is null or public.is_company_member(organization_id));
drop policy if exists kpi_items_update on public.kpi_items;
create policy kpi_items_update on public.kpi_items for update
  using (organization_id is null or public.is_company_member(organization_id));
drop policy if exists kpi_items_delete on public.kpi_items;
create policy kpi_items_delete on public.kpi_items for delete
  using (organization_id is null or public.is_company_member(organization_id));

alter table public.kpi_assessments enable row level security;
drop policy if exists kpi_assessments_all on public.kpi_assessments;
create policy kpi_assessments_all on public.kpi_assessments for all
  using (public.is_company_member(organization_id))
  with check (public.is_company_member(organization_id));

alter table public.kpi_assessment_lines enable row level security;
drop policy if exists kpi_assessment_lines_all on public.kpi_assessment_lines;
create policy kpi_assessment_lines_all on public.kpi_assessment_lines for all
  using (
    exists (
      select 1 from public.kpi_assessments a
      where a.assessment_id = kpi_assessment_lines.assessment_id
        and public.is_company_member(a.organization_id)
    )
  )
  with check (
    exists (
      select 1 from public.kpi_assessments a
      where a.assessment_id = kpi_assessment_lines.assessment_id
        and public.is_company_member(a.organization_id)
    )
  );

alter table public.kpi_findings enable row level security;
drop policy if exists kpi_findings_all on public.kpi_findings;
create policy kpi_findings_all on public.kpi_findings for all
  using (public.is_company_member(organization_id))
  with check (public.is_company_member(organization_id));
