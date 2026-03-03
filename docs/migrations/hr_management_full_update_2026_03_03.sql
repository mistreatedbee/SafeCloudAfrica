-- HR management full update: disciplinary, recruitment, performance, hours aggregation, leave defaults
-- Date: 2026-03-03
-- Safe to run multiple times.

alter table public.hr_disciplinary_cases
  add column if not exists offence_type text null;
alter table public.hr_disciplinary_cases
  add column if not exists disciplinary_action_taken text null;
alter table public.hr_disciplinary_cases
  add column if not exists repeat_offence_action text null;
alter table public.hr_disciplinary_cases
  add column if not exists recommended_action text null;
alter table public.hr_disciplinary_cases
  add column if not exists offence_severity text null
  check (offence_severity in ('minor', 'major', 'repeat') or offence_severity is null);

alter table public.hr_vacancies
  add column if not exists job_description text null;
alter table public.hr_vacancies
  add column if not exists competency_required text null;
alter table public.hr_vacancies
  add column if not exists experience_required text null;
alter table public.hr_vacancies
  add column if not exists department_manager_approved boolean not null default false;
alter table public.hr_vacancies
  add column if not exists department_manager_approved_by uuid null references auth.users(id) on delete set null;
alter table public.hr_vacancies
  add column if not exists department_manager_approved_at timestamptz null;
alter table public.hr_vacancies
  add column if not exists reference_checks_done boolean not null default false;

alter table public.hr_applicants
  add column if not exists interviewed_met_requirements boolean null;
alter table public.hr_applicants
  add column if not exists offer_accepted boolean null;
alter table public.hr_applicants
  add column if not exists previous_employer_leaving_reason text null;
alter table public.hr_applicants
  add column if not exists criminal_record boolean null;
alter table public.hr_applicants
  add column if not exists hr_manager_approved boolean not null default false;
alter table public.hr_applicants
  add column if not exists hr_manager_approved_by uuid null references auth.users(id) on delete set null;
alter table public.hr_applicants
  add column if not exists hr_manager_approved_at timestamptz null;
alter table public.hr_applicants
  add column if not exists department_manager_approved boolean not null default false;
alter table public.hr_applicants
  add column if not exists department_manager_approved_by uuid null references auth.users(id) on delete set null;
alter table public.hr_applicants
  add column if not exists department_manager_approved_at timestamptz null;
alter table public.hr_applicants
  add column if not exists converted_employee_id uuid null references public.hr_employees(id) on delete set null;

alter table public.hr_performance_reviews
  add column if not exists assistance_required text null;
alter table public.hr_performance_reviews
  add column if not exists weaknesses text null;
alter table public.hr_performance_reviews
  add column if not exists manager_rating integer null check (manager_rating between 1 and 5);
alter table public.hr_performance_reviews
  add column if not exists manager_remarks text null;
alter table public.hr_performance_reviews
  add column if not exists corrective_actions_required text null;
alter table public.hr_performance_reviews
  add column if not exists corrective_responsible_user_id uuid null references auth.users(id) on delete set null;
alter table public.hr_performance_reviews
  add column if not exists corrective_due_date date null;

create table if not exists public.hr_monthly_hours (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  year integer not null,
  month integer not null check (month between 1 and 12),
  total_hours numeric(10,2) not null default 0,
  overtime_hours numeric(10,2) not null default 0,
  total_with_overtime numeric(10,2) not null default 0,
  last_calculated_at timestamptz not null default now(),
  updated_by_user_id uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, employee_id, year, month)
);

drop trigger if exists trg_hr_monthly_hours_updated_at on public.hr_monthly_hours;
create trigger trg_hr_monthly_hours_updated_at
before update on public.hr_monthly_hours
for each row execute function public.hr_set_updated_at();

alter table public.hr_monthly_hours enable row level security;
drop policy if exists hr_monthly_hours_all on public.hr_monthly_hours;
create policy hr_monthly_hours_all on public.hr_monthly_hours for all
using (public.is_platform_admin() or public.is_company_member(company_id))
with check (public.is_platform_admin() or public.is_company_member(company_id));

insert into public.hr_leave_types (company_id, name, paid, requires_proof, default_days_per_year, carry_over_allowed, created_by_user_id)
select
  c.id as company_id,
  lt.name,
  lt.paid,
  lt.requires_proof,
  lt.default_days_per_year,
  lt.carry_over_allowed,
  coalesce(cm.user_id, c.primary_admin_user_id)
from public.companies c
left join lateral (
  select m.user_id
  from public.company_memberships m
  where m.company_id = c.id
  order by
    case m.role
      when 'owner' then 1
      when 'admin' then 2
      when 'manager' then 3
      when 'supervisor' then 4
      else 5
    end
  limit 1
) cm on true
cross join (
  values
    ('Annual Leave', true, false, 15::numeric, true),
    ('Sick Leave', true, true, 10::numeric, false),
    ('Maternity Leave', true, true, 0::numeric, false),
    ('Parental Leave', true, false, 0::numeric, false),
    ('Adoption Leave', true, false, 0::numeric, false),
    ('Commissioning Parental Leave (Surrogacy)', true, false, 0::numeric, false),
    ('Family Responsibility Leave', true, false, 3::numeric, false),
    ('Study Leave', true, false, 0::numeric, false),
    ('Compassionate Leave (Extended)', true, false, 0::numeric, false),
    ('Unpaid Leave', false, false, 0::numeric, false),
    ('Special Leave', true, false, 0::numeric, false),
    ('Occupational Injury Leave', true, true, 0::numeric, false)
) as lt(name, paid, requires_proof, default_days_per_year, carry_over_allowed)
where not exists (
  select 1
  from public.hr_leave_types hlt
  where hlt.company_id = c.id
    and lower(hlt.name) = lower(lt.name)
);
