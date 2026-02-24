-- HR Module baseline schema (compact)
create extension if not exists pgcrypto;

create table if not exists public.hr_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  owner_can_view_restricted boolean not null default false,
  leave_requires_hr_final_approval boolean not null default true,
  leave_escalation_days integer not null default 3,
  repeat_offence_window_months integer not null default 6,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_restricted_field_access_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  target_entity text not null,
  target_id uuid not null,
  field_name text not null,
  action text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.hr_employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid null references auth.users(id) on delete set null,
  employee_no text not null,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text null,
  id_number text null,
  date_of_birth date null,
  address text null,
  job_title text null,
  department_id uuid null references public.departments(id) on delete set null,
  site_id uuid null references public.sites(id) on delete set null,
  supervisor_user_id uuid null references auth.users(id) on delete set null,
  employment_type text not null,
  employment_type_other text null,
  employment_status text not null default 'ONBOARDING' check (employment_status in ('ONBOARDING', 'ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED', 'ARCHIVED')),
  start_date date not null,
  end_date date null,
  probation_end_date date null,
  next_review_date date null,
  emergency_contact_name text null,
  emergency_contact_phone text null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, employee_no),
  unique (company_id, email)
);

create table if not exists public.hr_employee_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  doc_type text not null,
  doc_type_other text null,
  title text not null,
  file_ids uuid[] not null default '{}',
  expiry_date date null,
  version text null,
  visible_to_employee boolean not null default false,
  uploaded_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_employment_contracts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  contract_type text not null,
  contract_type_other text null,
  start_date date not null,
  end_date date null,
  salary numeric(14,2) null,
  file_ids uuid[] not null default '{}',
  status text not null check (status in ('DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED')),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_leave_types (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  paid boolean not null default true,
  requires_proof boolean not null default false,
  default_days_per_year numeric(8,2) not null default 0,
  carry_over_allowed boolean not null default false,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

create table if not exists public.hr_leave_balances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  leave_type_id uuid not null references public.hr_leave_types(id) on delete cascade,
  year integer not null,
  allocated_days numeric(8,2) not null default 0,
  used_days numeric(8,2) not null default 0,
  remaining_days numeric(8,2) generated always as (allocated_days - used_days) stored,
  updated_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, employee_id, leave_type_id, year)
);

create table if not exists public.hr_leave_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  leave_type_id uuid not null references public.hr_leave_types(id) on delete restrict,
  start_date date not null,
  end_date date not null,
  total_days numeric(8,2) not null,
  reason text null,
  reason_other text null,
  proof_file_ids uuid[] not null default '{}',
  status text not null check (status in ('DRAFT', 'SUBMITTED', 'APPROVED', 'DECLINED', 'CANCELLED')),
  submitted_at timestamptz null,
  approved_by_user_id uuid null references auth.users(id) on delete set null,
  approved_at timestamptz null,
  decline_reason text null,
  supervisor_approval_status text not null default 'PENDING' check (supervisor_approval_status in ('PENDING', 'APPROVED', 'DECLINED')),
  hr_approval_status text not null default 'PENDING' check (hr_approval_status in ('PENDING', 'APPROVED', 'DECLINED', 'NOT_REQUIRED')),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (total_days >= 0)
);

create table if not exists public.hr_timesheets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  date date not null,
  hours_worked numeric(6,2) not null default 0,
  overtime_hours numeric(6,2) not null default 0,
  project_or_client text null,
  notes text null,
  status text not null check (status in ('SUBMITTED', 'APPROVED', 'DECLINED')),
  approved_by_user_id uuid null references auth.users(id) on delete set null,
  approved_at timestamptz null,
  decline_reason text null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, employee_id, date)
);

create table if not exists public.hr_performance_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  cycle text not null,
  review_date date not null,
  reviewer_user_id uuid not null references auth.users(id) on delete restrict,
  overall_rating integer not null check (overall_rating between 1 and 5),
  strengths text null,
  improvements text null,
  goals_next_period text null,
  attachments uuid[] not null default '{}',
  employee_acknowledged boolean not null default false,
  employee_acknowledged_at timestamptz null,
  hr_final_approved boolean not null default false,
  hr_final_approved_at timestamptz null,
  status text not null check (status in ('DRAFT', 'IN_REVIEW', 'ACK_PENDING', 'CLOSED')),
  linked_task_id uuid null references public.tasks(id) on delete set null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_disciplinary_cases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  case_type text not null,
  case_type_other text null,
  warning_level text null,
  warning_level_other text null,
  offence_category text not null,
  offence_category_other text null,
  offence_subcategory text null,
  offence_subcategory_other text null,
  description text not null,
  date_issued date not null,
  evidence_file_ids uuid[] not null default '{}',
  outcome text null,
  outcome_other text null,
  repeat_offence_flag boolean not null default false,
  status text not null check (status in ('OPEN', 'IN_PROGRESS', 'CLOSED')),
  closed_at timestamptz null,
  closed_by_user_id uuid null references auth.users(id) on delete set null,
  restricted_notes text null,
  linked_task_id uuid null references public.tasks(id) on delete set null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_policy_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  policy_doc_id uuid not null references public.hr_employee_documents(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  acknowledged_at timestamptz not null,
  acknowledgement_method text not null check (acknowledgement_method in ('Click', 'Signature')),
  signature_file_id uuid null,
  created_at timestamptz not null default now(),
  unique (company_id, policy_doc_id, employee_id)
);

create table if not exists public.hr_vacancies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  department_id uuid null references public.departments(id) on delete set null,
  site_id uuid null references public.sites(id) on delete set null,
  status text not null default 'OPEN' check (status in ('OPEN', 'ON_HOLD', 'CLOSED')),
  description text null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_applicants (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  vacancy_id uuid null references public.hr_vacancies(id) on delete set null,
  full_name text not null,
  email text null,
  phone text null,
  status text not null default 'NEW' check (status in ('NEW', 'SHORTLISTED', 'INTERVIEWED', 'OFFERED', 'REJECTED', 'HIRED')),
  notes text null,
  cv_file_ids uuid[] not null default '{}',
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_interview_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  applicant_id uuid not null references public.hr_applicants(id) on delete cascade,
  interview_date date not null,
  interviewer_user_id uuid null references auth.users(id) on delete set null,
  notes text not null,
  rating integer null check (rating between 1 and 5),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.hr_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.hr_can_view_restricted_fields(p_company_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_allow_owner boolean;
begin
  if public.is_platform_admin() then return true; end if;
  v_role := public.company_role(p_company_id);
  if v_role = 'admin' then return true; end if;
  if v_role = 'owner' then
    select coalesce(owner_can_view_restricted, false) into v_allow_owner from public.hr_settings where company_id = p_company_id;
    return coalesce(v_allow_owner, false);
  end if;
  return false;
end;
$$;

grant execute on function public.hr_can_view_restricted_fields(uuid) to authenticated;

create or replace function public.hr_apply_leave_approval(
  p_leave_request_id uuid,
  p_company_id uuid,
  p_decision text,
  p_actor_user_id uuid,
  p_decline_reason text default null
)
returns public.hr_leave_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_leave public.hr_leave_requests;
  v_leave_type public.hr_leave_types;
  v_year integer;
  v_balance public.hr_leave_balances;
begin
  select * into v_leave from public.hr_leave_requests where id = p_leave_request_id and company_id = p_company_id for update;
  if not found then raise exception 'Leave request not found.'; end if;
  select * into v_leave_type from public.hr_leave_types where id = v_leave.leave_type_id;

  if p_decision = 'SUPERVISOR_APPROVE' then
    update public.hr_leave_requests set supervisor_approval_status = 'APPROVED', updated_at = now() where id = v_leave.id returning * into v_leave;
  elsif p_decision = 'SUPERVISOR_DECLINE' then
    update public.hr_leave_requests set supervisor_approval_status = 'DECLINED', status = 'DECLINED', decline_reason = coalesce(p_decline_reason, 'Declined by supervisor'), approved_by_user_id = p_actor_user_id, approved_at = now(), updated_at = now() where id = v_leave.id returning * into v_leave;
  elsif p_decision = 'HR_APPROVE' then
    if v_leave_type.requires_proof and coalesce(array_length(v_leave.proof_file_ids, 1), 0) = 0 then raise exception 'Proof is required.'; end if;
    update public.hr_leave_requests set hr_approval_status = 'APPROVED', status = 'APPROVED', approved_by_user_id = p_actor_user_id, approved_at = now(), updated_at = now() where id = v_leave.id returning * into v_leave;
    v_year := extract(year from v_leave.start_date)::integer;
    select * into v_balance from public.hr_leave_balances where company_id = p_company_id and employee_id = v_leave.employee_id and leave_type_id = v_leave.leave_type_id and year = v_year for update;
    if not found then
      insert into public.hr_leave_balances (company_id, employee_id, leave_type_id, year, allocated_days, used_days, updated_by_user_id)
      values (p_company_id, v_leave.employee_id, v_leave.leave_type_id, v_year, v_leave_type.default_days_per_year, 0, p_actor_user_id)
      returning * into v_balance;
    end if;
    if v_leave.total_days > v_balance.remaining_days then raise exception 'Requested leave exceeds remaining balance.'; end if;
    update public.hr_leave_balances set used_days = used_days + v_leave.total_days, updated_by_user_id = p_actor_user_id, updated_at = now() where id = v_balance.id;
  elsif p_decision = 'HR_DECLINE' then
    update public.hr_leave_requests set hr_approval_status = 'DECLINED', status = 'DECLINED', decline_reason = coalesce(p_decline_reason, 'Declined by HR'), approved_by_user_id = p_actor_user_id, approved_at = now(), updated_at = now() where id = v_leave.id returning * into v_leave;
  else
    raise exception 'Unsupported decision';
  end if;

  return v_leave;
end;
$$;

grant execute on function public.hr_apply_leave_approval(uuid, uuid, text, uuid, text) to authenticated;

drop trigger if exists trg_hr_employees_updated_at on public.hr_employees;
create trigger trg_hr_employees_updated_at before update on public.hr_employees for each row execute function public.hr_set_updated_at();

drop trigger if exists trg_hr_employee_documents_updated_at on public.hr_employee_documents;
create trigger trg_hr_employee_documents_updated_at before update on public.hr_employee_documents for each row execute function public.hr_set_updated_at();

drop trigger if exists trg_hr_employment_contracts_updated_at on public.hr_employment_contracts;
create trigger trg_hr_employment_contracts_updated_at before update on public.hr_employment_contracts for each row execute function public.hr_set_updated_at();

drop trigger if exists trg_hr_leave_types_updated_at on public.hr_leave_types;
create trigger trg_hr_leave_types_updated_at before update on public.hr_leave_types for each row execute function public.hr_set_updated_at();

drop trigger if exists trg_hr_leave_balances_updated_at on public.hr_leave_balances;
create trigger trg_hr_leave_balances_updated_at before update on public.hr_leave_balances for each row execute function public.hr_set_updated_at();

drop trigger if exists trg_hr_leave_requests_updated_at on public.hr_leave_requests;
create trigger trg_hr_leave_requests_updated_at before update on public.hr_leave_requests for each row execute function public.hr_set_updated_at();

drop trigger if exists trg_hr_timesheets_updated_at on public.hr_timesheets;
create trigger trg_hr_timesheets_updated_at before update on public.hr_timesheets for each row execute function public.hr_set_updated_at();

drop trigger if exists trg_hr_performance_reviews_updated_at on public.hr_performance_reviews;
create trigger trg_hr_performance_reviews_updated_at before update on public.hr_performance_reviews for each row execute function public.hr_set_updated_at();

drop trigger if exists trg_hr_disciplinary_cases_updated_at on public.hr_disciplinary_cases;
create trigger trg_hr_disciplinary_cases_updated_at before update on public.hr_disciplinary_cases for each row execute function public.hr_set_updated_at();

drop trigger if exists trg_hr_vacancies_updated_at on public.hr_vacancies;
create trigger trg_hr_vacancies_updated_at before update on public.hr_vacancies for each row execute function public.hr_set_updated_at();

drop trigger if exists trg_hr_applicants_updated_at on public.hr_applicants;
create trigger trg_hr_applicants_updated_at before update on public.hr_applicants for each row execute function public.hr_set_updated_at();

drop trigger if exists trg_hr_interview_notes_updated_at on public.hr_interview_notes;
create trigger trg_hr_interview_notes_updated_at before update on public.hr_interview_notes for each row execute function public.hr_set_updated_at();

alter table public.hr_settings enable row level security;
alter table public.hr_restricted_field_access_logs enable row level security;
alter table public.hr_employees enable row level security;
alter table public.hr_employee_documents enable row level security;
alter table public.hr_employment_contracts enable row level security;
alter table public.hr_leave_types enable row level security;
alter table public.hr_leave_balances enable row level security;
alter table public.hr_leave_requests enable row level security;
alter table public.hr_timesheets enable row level security;
alter table public.hr_performance_reviews enable row level security;
alter table public.hr_disciplinary_cases enable row level security;
alter table public.hr_policy_acknowledgements enable row level security;
alter table public.hr_vacancies enable row level security;
alter table public.hr_applicants enable row level security;
alter table public.hr_interview_notes enable row level security;

drop policy if exists hr_settings_all on public.hr_settings;
create policy hr_settings_all on public.hr_settings for all
using (public.is_platform_admin() or public.company_role(company_id) in ('owner', 'admin'))
with check (public.is_platform_admin() or public.company_role(company_id) in ('owner', 'admin'));

drop policy if exists hr_restricted_logs_select on public.hr_restricted_field_access_logs;
create policy hr_restricted_logs_select on public.hr_restricted_field_access_logs for select
using (public.is_platform_admin() or public.company_role(company_id) in ('owner', 'admin', 'auditor'));

drop policy if exists hr_restricted_logs_insert on public.hr_restricted_field_access_logs;
create policy hr_restricted_logs_insert on public.hr_restricted_field_access_logs for insert
with check (public.is_platform_admin() or public.is_company_member(company_id));

drop policy if exists hr_employees_all on public.hr_employees;
create policy hr_employees_all on public.hr_employees for all
using (public.is_platform_admin() or public.is_company_member(company_id))
with check (public.is_platform_admin() or public.is_company_member(company_id));

drop policy if exists hr_employee_docs_all on public.hr_employee_documents;
create policy hr_employee_docs_all on public.hr_employee_documents for all
using (public.is_platform_admin() or public.is_company_member(company_id))
with check (public.is_platform_admin() or public.is_company_member(company_id));

drop policy if exists hr_contracts_all on public.hr_employment_contracts;
create policy hr_contracts_all on public.hr_employment_contracts for all
using (public.is_platform_admin() or public.is_company_member(company_id))
with check (public.is_platform_admin() or public.is_company_member(company_id));

drop policy if exists hr_leave_types_all on public.hr_leave_types;
create policy hr_leave_types_all on public.hr_leave_types for all
using (public.is_platform_admin() or public.is_company_member(company_id))
with check (public.is_platform_admin() or public.is_company_member(company_id));

drop policy if exists hr_leave_balances_all on public.hr_leave_balances;
create policy hr_leave_balances_all on public.hr_leave_balances for all
using (public.is_platform_admin() or public.is_company_member(company_id))
with check (public.is_platform_admin() or public.is_company_member(company_id));

drop policy if exists hr_leave_requests_all on public.hr_leave_requests;
create policy hr_leave_requests_all on public.hr_leave_requests for all
using (public.is_platform_admin() or public.is_company_member(company_id))
with check (public.is_platform_admin() or public.is_company_member(company_id));

drop policy if exists hr_timesheets_all on public.hr_timesheets;
create policy hr_timesheets_all on public.hr_timesheets for all
using (public.is_platform_admin() or public.is_company_member(company_id))
with check (public.is_platform_admin() or public.is_company_member(company_id));

drop policy if exists hr_reviews_all on public.hr_performance_reviews;
create policy hr_reviews_all on public.hr_performance_reviews for all
using (public.is_platform_admin() or public.is_company_member(company_id))
with check (public.is_platform_admin() or public.is_company_member(company_id));

drop policy if exists hr_disciplinary_all on public.hr_disciplinary_cases;
create policy hr_disciplinary_all on public.hr_disciplinary_cases for all
using (public.is_platform_admin() or public.is_company_member(company_id))
with check (public.is_platform_admin() or public.is_company_member(company_id));

drop policy if exists hr_ack_all on public.hr_policy_acknowledgements;
create policy hr_ack_all on public.hr_policy_acknowledgements for all
using (public.is_platform_admin() or public.is_company_member(company_id))
with check (public.is_platform_admin() or public.is_company_member(company_id));

drop policy if exists hr_vacancies_all on public.hr_vacancies;
create policy hr_vacancies_all on public.hr_vacancies for all
using (public.is_platform_admin() or public.is_company_member(company_id))
with check (public.is_platform_admin() or public.is_company_member(company_id));

drop policy if exists hr_applicants_all on public.hr_applicants;
create policy hr_applicants_all on public.hr_applicants for all
using (public.is_platform_admin() or public.is_company_member(company_id))
with check (public.is_platform_admin() or public.is_company_member(company_id));

drop policy if exists hr_interviews_all on public.hr_interview_notes;
create policy hr_interviews_all on public.hr_interview_notes for all
using (public.is_platform_admin() or public.is_company_member(company_id))
with check (public.is_platform_admin() or public.is_company_member(company_id));

insert into public.hr_settings (company_id)
select c.id from public.companies c
where not exists (select 1 from public.hr_settings s where s.company_id = c.id)
on conflict (company_id) do nothing;
