-- Health module expansion (2026-02-24)
-- Covers medical surveillance, occupational hygiene, and wellness management.
-- Includes strict tenant isolation and restricted health confidentiality policies.

create extension if not exists pgcrypto;

create table if not exists public.health_medicals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_user_id uuid null references auth.users(id) on delete set null,
  employee_name text null,
  employee_number text null,
  medical_type text not null check (medical_type in ('PRE_EMPLOYMENT', 'PERIODIC', 'EXIT')),
  medical_date date not null,
  expiry_date date null,
  conducted_by text null,
  fitness_status text not null check (fitness_status in ('FIT', 'RESTRICTED', 'UNFIT')),
  fitness_certificate_file_ids uuid[] not null default '{}',
  chronic_illness_disclosed boolean not null default false,
  chronic_illness_notes text null,
  restricted_duty_required boolean not null default false,
  restricted_duty_details text null,
  notes text null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  closed_by_user_id uuid null references auth.users(id) on delete set null,
  closed_at timestamptz null,
  date_closed timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    employee_user_id is not null
    or nullif(trim(coalesce(employee_name, '')), '') is not null
  )
);

create table if not exists public.health_restricted_duty (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  medical_id uuid null references public.health_medicals(id) on delete set null,
  employee_user_id uuid null references auth.users(id) on delete set null,
  employee_name text null,
  restriction_reason text not null,
  restriction_details text null,
  start_date date not null,
  end_date date null,
  status text not null default 'Active' check (status in ('Active', 'Ended')),
  approved_by_user_id uuid null references auth.users(id) on delete set null,
  attachment_file_ids uuid[] not null default '{}',
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    employee_user_id is not null
    or nullif(trim(coalesce(employee_name, '')), '') is not null
  )
);

create table if not exists public.health_hygiene_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  monitoring_type text not null,
  site_location text null,
  department text null,
  monitored_on date not null,
  conducted_by text null,
  method_or_standard text null,
  results_summary text null,
  result_details jsonb not null default '{}'::jsonb,
  compliance_status text not null default 'UNKNOWN' check (compliance_status in ('COMPLIANT', 'NON_COMPLIANT', 'PARTIAL', 'UNKNOWN')),
  non_compliance_reason text null,
  lab_certificate_file_ids uuid[] not null default '{}',
  linked_risk_assessment_ids uuid[] not null default '{}',
  action_plan_id uuid null references public.tasks(id) on delete set null,
  responsible_user_id uuid null references auth.users(id) on delete set null,
  action_due_date date null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.health_wellness_campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  campaign_type text not null check (campaign_type in ('Mental health', 'EAP', 'Stress management', 'Awareness')),
  date_from date null,
  date_to date null,
  description text null,
  attachment_file_ids uuid[] not null default '{}',
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.health_substance_cases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_user_id uuid null references auth.users(id) on delete set null,
  employee_name text null,
  date_of_report date not null,
  test_conducted_by text null,
  type_of_case text not null check (
    type_of_case in ('Reasonable Suspicion', 'Random Test', 'Post-Incident', 'Return-to-Work', 'Follow-up Test')
  ),
  substance_suspected text[] not null default '{}',
  substance_suspected_other text null,
  observed_behaviour_symptoms text null,
  witness_names text[] not null default '{}',
  type_of_test text not null check (type_of_test in ('Breathalyser', 'Urine', 'Saliva', 'Blood')),
  test_result text not null check (test_result in ('Negative', 'Positive', 'Refused')),
  bac_level numeric(8, 3) null,
  drug_panel_result text null,
  removed_from_duty boolean not null default false,
  immediate_action_taken text null,
  outcome text null check (
    outcome is null or outcome in ('Verbal Warning', 'Written Warning', 'Final Warning', 'Dismissal', 'Referral to Rehab')
  ),
  employee_comments text null,
  hr_manager_comments text null,
  attachment_file_ids uuid[] not null default '{}',
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    employee_user_id is not null
    or nullif(trim(coalesce(employee_name, '')), '') is not null
  )
);

create table if not exists public.health_vaccinations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_user_id uuid null references auth.users(id) on delete set null,
  employee_name text null,
  vaccine_name text not null,
  dose_no integer null,
  date_administered date null,
  batch_no text null,
  administered_by text null,
  next_due_date date null,
  proof_attached_file_ids uuid[] not null default '{}',
  validity text null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    employee_user_id is not null
    or nullif(trim(coalesce(employee_name, '')), '') is not null
  )
);

create index if not exists idx_health_medicals_company_expiry on public.health_medicals(company_id, expiry_date);
create index if not exists idx_health_medicals_company_fitness on public.health_medicals(company_id, fitness_status);
create index if not exists idx_health_medicals_company_employee on public.health_medicals(company_id, employee_user_id);

create index if not exists idx_health_restricted_duty_company_status on public.health_restricted_duty(company_id, status);
create index if not exists idx_health_restricted_duty_company_employee on public.health_restricted_duty(company_id, employee_user_id);

create index if not exists idx_health_hygiene_company_date on public.health_hygiene_records(company_id, monitored_on desc);
create index if not exists idx_health_hygiene_company_compliance on public.health_hygiene_records(company_id, compliance_status);
create index if not exists idx_health_hygiene_company_action on public.health_hygiene_records(company_id, action_plan_id);

create index if not exists idx_health_wellness_company_dates on public.health_wellness_campaigns(company_id, date_from, date_to);

create index if not exists idx_health_substance_company_date on public.health_substance_cases(company_id, date_of_report desc);
create index if not exists idx_health_substance_company_employee on public.health_substance_cases(company_id, employee_user_id);

create index if not exists idx_health_vaccinations_company_due on public.health_vaccinations(company_id, next_due_date);
create index if not exists idx_health_vaccinations_company_employee on public.health_vaccinations(company_id, employee_user_id);

create or replace function public.health_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_health_medicals_set_updated_at on public.health_medicals;
create trigger trg_health_medicals_set_updated_at
before update on public.health_medicals
for each row execute function public.health_set_updated_at();

drop trigger if exists trg_health_restricted_duty_set_updated_at on public.health_restricted_duty;
create trigger trg_health_restricted_duty_set_updated_at
before update on public.health_restricted_duty
for each row execute function public.health_set_updated_at();

drop trigger if exists trg_health_hygiene_records_set_updated_at on public.health_hygiene_records;
create trigger trg_health_hygiene_records_set_updated_at
before update on public.health_hygiene_records
for each row execute function public.health_set_updated_at();

drop trigger if exists trg_health_wellness_campaigns_set_updated_at on public.health_wellness_campaigns;
create trigger trg_health_wellness_campaigns_set_updated_at
before update on public.health_wellness_campaigns
for each row execute function public.health_set_updated_at();

drop trigger if exists trg_health_substance_cases_set_updated_at on public.health_substance_cases;
create trigger trg_health_substance_cases_set_updated_at
before update on public.health_substance_cases
for each row execute function public.health_set_updated_at();

drop trigger if exists trg_health_vaccinations_set_updated_at on public.health_vaccinations;
create trigger trg_health_vaccinations_set_updated_at
before update on public.health_vaccinations
for each row execute function public.health_set_updated_at();

-- POPIA-style confidentiality helpers.
create or replace function public.is_health_admin(p_company_id uuid)
returns boolean
language sql
stable
as $$
  select public.company_role(p_company_id) in ('owner', 'admin', 'manager', 'hr');
$$;

create or replace function public.can_view_health_employee_record(p_company_id uuid, p_employee_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if public.is_platform_admin() then
    return true;
  end if;

  v_role := public.company_role(p_company_id);
  if v_role is null then
    return false;
  end if;

  if v_role in ('owner', 'admin', 'manager', 'hr') then
    return true;
  end if;

  if p_employee_user_id is null then
    return false;
  end if;

  if v_role = 'employee' then
    return p_employee_user_id = public.request_user_id();
  end if;

  if v_role = 'supervisor' then
    if p_employee_user_id = public.request_user_id() then
      return true;
    end if;
    return exists (
      select 1
      from public.user_profiles up
      where up.company_id = p_company_id
        and up.user_id = p_employee_user_id
        and up.supervisor_user_id = public.request_user_id()
    );
  end if;

  return false;
end;
$$;

grant execute on function public.is_health_admin(uuid) to authenticated;
grant execute on function public.can_view_health_employee_record(uuid, uuid) to authenticated;

alter table public.health_medicals enable row level security;
alter table public.health_restricted_duty enable row level security;
alter table public.health_hygiene_records enable row level security;
alter table public.health_wellness_campaigns enable row level security;
alter table public.health_substance_cases enable row level security;
alter table public.health_vaccinations enable row level security;

drop policy if exists health_medicals_select_policy on public.health_medicals;
create policy health_medicals_select_policy on public.health_medicals
for select
using (
  public.is_platform_admin()
  or public.is_health_admin(company_id)
  or public.can_view_health_employee_record(company_id, employee_user_id)
);

drop policy if exists health_medicals_write_policy on public.health_medicals;
create policy health_medicals_write_policy on public.health_medicals
for all
using (
  public.is_platform_admin()
  or public.company_role(company_id) in ('owner', 'admin', 'manager', 'supervisor', 'hr')
)
with check (
  public.is_platform_admin()
  or public.company_role(company_id) in ('owner', 'admin', 'manager', 'supervisor', 'hr')
);

drop policy if exists health_restricted_duty_select_policy on public.health_restricted_duty;
create policy health_restricted_duty_select_policy on public.health_restricted_duty
for select
using (
  public.is_platform_admin()
  or public.is_health_admin(company_id)
  or public.can_view_health_employee_record(company_id, employee_user_id)
);

drop policy if exists health_restricted_duty_write_policy on public.health_restricted_duty;
create policy health_restricted_duty_write_policy on public.health_restricted_duty
for all
using (
  public.is_platform_admin()
  or public.company_role(company_id) in ('owner', 'admin', 'manager', 'supervisor', 'hr')
)
with check (
  public.is_platform_admin()
  or public.company_role(company_id) in ('owner', 'admin', 'manager', 'supervisor', 'hr')
);

drop policy if exists health_hygiene_records_select_policy on public.health_hygiene_records;
create policy health_hygiene_records_select_policy on public.health_hygiene_records
for select
using (
  public.is_company_member(company_id)
  and public.company_role(company_id) not in ('consultant', 'auditor')
  or public.is_platform_admin()
);

drop policy if exists health_hygiene_records_write_policy on public.health_hygiene_records;
create policy health_hygiene_records_write_policy on public.health_hygiene_records
for all
using (
  public.company_role(company_id) in ('owner', 'admin', 'manager', 'supervisor', 'hr')
  or public.is_platform_admin()
)
with check (
  public.company_role(company_id) in ('owner', 'admin', 'manager', 'supervisor', 'hr')
  or public.is_platform_admin()
);

drop policy if exists health_wellness_campaigns_select_policy on public.health_wellness_campaigns;
create policy health_wellness_campaigns_select_policy on public.health_wellness_campaigns
for select
using (
  public.is_company_member(company_id)
  and public.company_role(company_id) not in ('consultant', 'auditor')
  or public.is_platform_admin()
);

drop policy if exists health_wellness_campaigns_write_policy on public.health_wellness_campaigns;
create policy health_wellness_campaigns_write_policy on public.health_wellness_campaigns
for all
using (
  public.company_role(company_id) in ('owner', 'admin', 'manager', 'supervisor', 'hr')
  or public.is_platform_admin()
)
with check (
  public.company_role(company_id) in ('owner', 'admin', 'manager', 'supervisor', 'hr')
  or public.is_platform_admin()
);

drop policy if exists health_substance_cases_select_policy on public.health_substance_cases;
create policy health_substance_cases_select_policy on public.health_substance_cases
for select
using (
  public.is_platform_admin()
  or public.company_role(company_id) in ('owner', 'admin', 'manager', 'hr')
);

drop policy if exists health_substance_cases_write_policy on public.health_substance_cases;
create policy health_substance_cases_write_policy on public.health_substance_cases
for all
using (
  public.is_platform_admin()
  or public.company_role(company_id) in ('owner', 'admin', 'manager', 'hr')
)
with check (
  public.is_platform_admin()
  or public.company_role(company_id) in ('owner', 'admin', 'manager', 'hr')
);

drop policy if exists health_vaccinations_select_policy on public.health_vaccinations;
create policy health_vaccinations_select_policy on public.health_vaccinations
for select
using (
  public.is_platform_admin()
  or public.is_health_admin(company_id)
  or public.can_view_health_employee_record(company_id, employee_user_id)
);

drop policy if exists health_vaccinations_write_policy on public.health_vaccinations;
create policy health_vaccinations_write_policy on public.health_vaccinations
for all
using (
  public.is_platform_admin()
  or public.company_role(company_id) in ('owner', 'admin', 'manager', 'supervisor', 'hr')
)
with check (
  public.is_platform_admin()
  or public.company_role(company_id) in ('owner', 'admin', 'manager', 'supervisor', 'hr')
);

