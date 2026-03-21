-- Phase 6: tighten HR RLS (personnel vs self-service vs supervisor line) and align health helpers with is_hr_manager.
-- Apply after: hr_module_2026_02_24.sql, hr_employee_sensitive_details_and_dependents_2026_03_18.sql (hr_is_hr_manager),
-- health_module_2026_02_24.sql, hr_management_full_update_2026_03_03.sql, hr_documents_module_2026_03_03.sql,
-- hr_employee_wellness_programme_2026_03_16.sql
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- HR access helpers
-- ---------------------------------------------------------------------------

create or replace function public.hr_has_personnel_access(p_company_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.is_platform_admin()
    or public.company_role(p_company_id) in ('owner', 'admin', 'manager', 'supervisor')
    or public.hr_is_hr_manager(p_company_id);
$$;

comment on function public.hr_has_personnel_access(uuid) is
  'HR/personnel: owner, admin, manager, supervisor, designated HR manager, or platform admin.';

create or replace function public.hr_can_access_employee_row(p_company_id uuid, p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_employee_id is not null
    and (
      public.hr_has_personnel_access(p_company_id)
      or exists (
        select 1
        from public.hr_employees e
        where e.id = p_employee_id
          and e.company_id = p_company_id
          and e.user_id = public.request_user_id()
      )
      or exists (
        select 1
        from public.hr_employees e
        where e.id = p_employee_id
          and e.company_id = p_company_id
          and e.supervisor_user_id is not null
          and e.supervisor_user_id = public.request_user_id()
      )
    );
$$;

comment on function public.hr_can_access_employee_row(uuid, uuid) is
  'Personnel, or employee owns the row, or current user is the supervisor_user_id on that employee record.';

grant execute on function public.hr_has_personnel_access(uuid) to authenticated;
grant execute on function public.hr_can_access_employee_row(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Health: replace unused membership role ''hr'' with hr_is_hr_manager (TypeScript never assigned ''hr'').
-- ---------------------------------------------------------------------------

create or replace function public.is_health_admin(p_company_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.company_role(p_company_id) in ('owner', 'admin', 'manager')
    or public.hr_is_hr_manager(p_company_id);
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

  if v_role in ('owner', 'admin', 'manager') or public.hr_is_hr_manager(p_company_id) then
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

create or replace function public.health_can_write_clinical(p_company_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.is_platform_admin()
    or public.company_role(p_company_id) in ('owner', 'admin', 'manager', 'supervisor')
    or public.hr_is_hr_manager(p_company_id);
$$;

create or replace function public.health_can_write_substance(p_company_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.is_platform_admin()
    or public.company_role(p_company_id) in ('owner', 'admin', 'manager')
    or public.hr_is_hr_manager(p_company_id);
$$;

grant execute on function public.health_can_write_clinical(uuid) to authenticated;
grant execute on function public.health_can_write_substance(uuid) to authenticated;

drop policy if exists health_medicals_write_policy on public.health_medicals;
create policy health_medicals_write_policy on public.health_medicals
for all
using (public.is_platform_admin() or public.health_can_write_clinical(company_id))
with check (public.is_platform_admin() or public.health_can_write_clinical(company_id));

drop policy if exists health_restricted_duty_write_policy on public.health_restricted_duty;
create policy health_restricted_duty_write_policy on public.health_restricted_duty
for all
using (public.is_platform_admin() or public.health_can_write_clinical(company_id))
with check (public.is_platform_admin() or public.health_can_write_clinical(company_id));

drop policy if exists health_hygiene_records_write_policy on public.health_hygiene_records;
create policy health_hygiene_records_write_policy on public.health_hygiene_records
for all
using (public.is_platform_admin() or public.health_can_write_clinical(company_id))
with check (public.is_platform_admin() or public.health_can_write_clinical(company_id));

drop policy if exists health_wellness_campaigns_write_policy on public.health_wellness_campaigns;
create policy health_wellness_campaigns_write_policy on public.health_wellness_campaigns
for all
using (public.is_platform_admin() or public.health_can_write_clinical(company_id))
with check (public.is_platform_admin() or public.health_can_write_clinical(company_id));

drop policy if exists health_substance_cases_select_policy on public.health_substance_cases;
create policy health_substance_cases_select_policy on public.health_substance_cases
for select
using (
  public.is_platform_admin()
  or public.health_can_write_substance(company_id)
);

drop policy if exists health_substance_cases_write_policy on public.health_substance_cases;
create policy health_substance_cases_write_policy on public.health_substance_cases
for all
using (public.is_platform_admin() or public.health_can_write_substance(company_id))
with check (public.is_platform_admin() or public.health_can_write_substance(company_id));

drop policy if exists health_vaccinations_write_policy on public.health_vaccinations;
create policy health_vaccinations_write_policy on public.health_vaccinations
for all
using (public.is_platform_admin() or public.health_can_write_clinical(company_id))
with check (public.is_platform_admin() or public.health_can_write_clinical(company_id));

-- ---------------------------------------------------------------------------
-- HR: hr_restricted_field_access_logs — tighten insert to personnel only
-- ---------------------------------------------------------------------------

drop policy if exists hr_restricted_logs_insert on public.hr_restricted_field_access_logs;
create policy hr_restricted_logs_insert on public.hr_restricted_field_access_logs
for insert
with check (public.is_platform_admin() or public.hr_has_personnel_access(company_id));

-- ---------------------------------------------------------------------------
-- HR: hr_employees
-- ---------------------------------------------------------------------------

drop policy if exists hr_employees_all on public.hr_employees;
create policy hr_employees_select on public.hr_employees
for select
using (
  public.is_platform_admin()
  or public.hr_has_personnel_access(company_id)
  or user_id = public.request_user_id()
  or supervisor_user_id = public.request_user_id()
);

create policy hr_employees_insert on public.hr_employees
for insert
with check (public.is_platform_admin() or public.hr_has_personnel_access(company_id));

create policy hr_employees_update on public.hr_employees
for update
using (
  public.is_platform_admin()
  or public.hr_has_personnel_access(company_id)
  or user_id = public.request_user_id()
)
with check (
  public.is_platform_admin()
  or public.hr_has_personnel_access(company_id)
  or user_id = public.request_user_id()
);

create policy hr_employees_delete on public.hr_employees
for delete
using (public.is_platform_admin() or public.hr_has_personnel_access(company_id));

-- ---------------------------------------------------------------------------
-- HR: documents & contracts (scoped by employee_id)
-- ---------------------------------------------------------------------------

drop policy if exists hr_employee_docs_all on public.hr_employee_documents;
create policy hr_employee_docs_select on public.hr_employee_documents
for select
using (public.hr_can_access_employee_row(company_id, employee_id));

create policy hr_employee_docs_insert on public.hr_employee_documents
for insert
with check (public.hr_can_access_employee_row(company_id, employee_id));

create policy hr_employee_docs_update on public.hr_employee_documents
for update
using (public.hr_can_access_employee_row(company_id, employee_id))
with check (public.hr_can_access_employee_row(company_id, employee_id));

create policy hr_employee_docs_delete on public.hr_employee_documents
for delete
using (public.hr_can_access_employee_row(company_id, employee_id));

drop policy if exists hr_contracts_all on public.hr_employment_contracts;
create policy hr_contracts_select on public.hr_employment_contracts
for select
using (public.hr_can_access_employee_row(company_id, employee_id));

create policy hr_contracts_insert on public.hr_employment_contracts
for insert
with check (public.is_platform_admin() or public.hr_has_personnel_access(company_id));

create policy hr_contracts_update on public.hr_employment_contracts
for update
using (public.is_platform_admin() or public.hr_has_personnel_access(company_id))
with check (public.is_platform_admin() or public.hr_has_personnel_access(company_id));

create policy hr_contracts_delete on public.hr_employment_contracts
for delete
using (public.is_platform_admin() or public.hr_has_personnel_access(company_id));

-- ---------------------------------------------------------------------------
-- HR: leave types (everyone in company can read; personnel manage)
-- ---------------------------------------------------------------------------

drop policy if exists hr_leave_types_all on public.hr_leave_types;
create policy hr_leave_types_select on public.hr_leave_types
for select
using (public.is_platform_admin() or public.is_company_member(company_id));

create policy hr_leave_types_insert on public.hr_leave_types
for insert
with check (public.is_platform_admin() or public.hr_has_personnel_access(company_id));

create policy hr_leave_types_update on public.hr_leave_types
for update
using (public.is_platform_admin() or public.hr_has_personnel_access(company_id))
with check (public.is_platform_admin() or public.hr_has_personnel_access(company_id));

create policy hr_leave_types_delete on public.hr_leave_types
for delete
using (public.is_platform_admin() or public.hr_has_personnel_access(company_id));

-- ---------------------------------------------------------------------------
-- HR: leave balances
-- ---------------------------------------------------------------------------

drop policy if exists hr_leave_balances_all on public.hr_leave_balances;
create policy hr_leave_balances_select on public.hr_leave_balances
for select
using (public.hr_can_access_employee_row(company_id, employee_id));

create policy hr_leave_balances_insert on public.hr_leave_balances
for insert
with check (public.is_platform_admin() or public.hr_has_personnel_access(company_id));

create policy hr_leave_balances_update on public.hr_leave_balances
for update
using (public.is_platform_admin() or public.hr_has_personnel_access(company_id))
with check (public.is_platform_admin() or public.hr_has_personnel_access(company_id));

create policy hr_leave_balances_delete on public.hr_leave_balances
for delete
using (public.is_platform_admin() or public.hr_has_personnel_access(company_id));

-- ---------------------------------------------------------------------------
-- HR: leave requests
-- ---------------------------------------------------------------------------

drop policy if exists hr_leave_requests_all on public.hr_leave_requests;
create policy hr_leave_requests_select on public.hr_leave_requests
for select
using (public.hr_can_access_employee_row(company_id, employee_id));

create policy hr_leave_requests_insert on public.hr_leave_requests
for insert
with check (
  public.is_platform_admin()
  or public.hr_has_personnel_access(company_id)
  or exists (
    select 1
    from public.hr_employees e
    where e.id = employee_id
      and e.company_id = company_id
      and e.user_id = public.request_user_id()
  )
);

create policy hr_leave_requests_update on public.hr_leave_requests
for update
using (public.hr_can_access_employee_row(company_id, employee_id))
with check (public.hr_can_access_employee_row(company_id, employee_id));

create policy hr_leave_requests_delete on public.hr_leave_requests
for delete
using (public.hr_can_access_employee_row(company_id, employee_id));

-- ---------------------------------------------------------------------------
-- HR: timesheets
-- ---------------------------------------------------------------------------

drop policy if exists hr_timesheets_all on public.hr_timesheets;
create policy hr_timesheets_select on public.hr_timesheets
for select
using (public.hr_can_access_employee_row(company_id, employee_id));

create policy hr_timesheets_insert on public.hr_timesheets
for insert
with check (
  public.is_platform_admin()
  or public.hr_has_personnel_access(company_id)
  or exists (
    select 1
    from public.hr_employees e
    where e.id = employee_id
      and e.company_id = company_id
      and e.user_id = public.request_user_id()
  )
);

create policy hr_timesheets_update on public.hr_timesheets
for update
using (public.hr_can_access_employee_row(company_id, employee_id))
with check (public.hr_can_access_employee_row(company_id, employee_id));

create policy hr_timesheets_delete on public.hr_timesheets
for delete
using (public.hr_can_access_employee_row(company_id, employee_id));

-- ---------------------------------------------------------------------------
-- HR: performance, disciplinary, policy acknowledgements
-- ---------------------------------------------------------------------------

drop policy if exists hr_reviews_all on public.hr_performance_reviews;
create policy hr_reviews_select on public.hr_performance_reviews
for select
using (public.hr_can_access_employee_row(company_id, employee_id));

create policy hr_reviews_insert on public.hr_performance_reviews
for insert
with check (public.hr_can_access_employee_row(company_id, employee_id));

create policy hr_reviews_update on public.hr_performance_reviews
for update
using (public.hr_can_access_employee_row(company_id, employee_id))
with check (public.hr_can_access_employee_row(company_id, employee_id));

create policy hr_reviews_delete on public.hr_performance_reviews
for delete
using (public.hr_can_access_employee_row(company_id, employee_id));

drop policy if exists hr_disciplinary_all on public.hr_disciplinary_cases;
create policy hr_disciplinary_select on public.hr_disciplinary_cases
for select
using (public.hr_can_access_employee_row(company_id, employee_id));

create policy hr_disciplinary_insert on public.hr_disciplinary_cases
for insert
with check (public.hr_can_access_employee_row(company_id, employee_id));

create policy hr_disciplinary_update on public.hr_disciplinary_cases
for update
using (public.hr_can_access_employee_row(company_id, employee_id))
with check (public.hr_can_access_employee_row(company_id, employee_id));

create policy hr_disciplinary_delete on public.hr_disciplinary_cases
for delete
using (public.hr_can_access_employee_row(company_id, employee_id));

drop policy if exists hr_ack_all on public.hr_policy_acknowledgements;
create policy hr_ack_select on public.hr_policy_acknowledgements
for select
using (public.hr_can_access_employee_row(company_id, employee_id));

create policy hr_ack_insert on public.hr_policy_acknowledgements
for insert
with check (public.hr_can_access_employee_row(company_id, employee_id));

create policy hr_ack_update on public.hr_policy_acknowledgements
for update
using (public.hr_can_access_employee_row(company_id, employee_id))
with check (public.hr_can_access_employee_row(company_id, employee_id));

create policy hr_ack_delete on public.hr_policy_acknowledgements
for delete
using (public.hr_can_access_employee_row(company_id, employee_id));

-- ---------------------------------------------------------------------------
-- HR: recruitment (company-scoped)
-- ---------------------------------------------------------------------------

drop policy if exists hr_vacancies_all on public.hr_vacancies;
create policy hr_vacancies_all on public.hr_vacancies
for all
using (public.is_platform_admin() or public.hr_has_personnel_access(company_id))
with check (public.is_platform_admin() or public.hr_has_personnel_access(company_id));

drop policy if exists hr_applicants_all on public.hr_applicants;
create policy hr_applicants_all on public.hr_applicants
for all
using (public.is_platform_admin() or public.hr_has_personnel_access(company_id))
with check (public.is_platform_admin() or public.hr_has_personnel_access(company_id));

drop policy if exists hr_interviews_all on public.hr_interview_notes;
create policy hr_interviews_all on public.hr_interview_notes
for all
using (public.is_platform_admin() or public.hr_has_personnel_access(company_id))
with check (public.is_platform_admin() or public.hr_has_personnel_access(company_id));

-- ---------------------------------------------------------------------------
-- HR: monthly hours rollup
-- ---------------------------------------------------------------------------

drop policy if exists hr_monthly_hours_all on public.hr_monthly_hours;
create policy hr_monthly_hours_select on public.hr_monthly_hours
for select
using (public.hr_can_access_employee_row(company_id, employee_id));

create policy hr_monthly_hours_insert on public.hr_monthly_hours
for insert
with check (
  public.is_platform_admin()
  or public.hr_has_personnel_access(company_id)
  or exists (
    select 1
    from public.hr_employees e
    where e.id = employee_id
      and e.company_id = company_id
      and e.user_id = public.request_user_id()
  )
);

create policy hr_monthly_hours_update on public.hr_monthly_hours
for update
using (
  public.is_platform_admin()
  or public.hr_has_personnel_access(company_id)
  or exists (
    select 1
    from public.hr_employees e
    where e.id = employee_id
      and e.company_id = company_id
      and e.user_id = public.request_user_id()
  )
)
with check (
  public.is_platform_admin()
  or public.hr_has_personnel_access(company_id)
  or exists (
    select 1
    from public.hr_employees e
    where e.id = employee_id
      and e.company_id = company_id
      and e.user_id = public.request_user_id()
  )
);

create policy hr_monthly_hours_delete on public.hr_monthly_hours
for delete
using (public.is_platform_admin() or public.hr_has_personnel_access(company_id));

-- ---------------------------------------------------------------------------
-- HR: policy ack documents / receipts
-- ---------------------------------------------------------------------------

drop policy if exists hr_ack_documents_all on public.hr_ack_documents;
create policy hr_ack_documents_select on public.hr_ack_documents
for select
using (public.is_platform_admin() or public.is_company_member(company_id));

create policy hr_ack_documents_insert on public.hr_ack_documents
for insert
with check (public.is_platform_admin() or public.hr_has_personnel_access(company_id));

create policy hr_ack_documents_update on public.hr_ack_documents
for update
using (public.is_platform_admin() or public.hr_has_personnel_access(company_id))
with check (public.is_platform_admin() or public.hr_has_personnel_access(company_id));

create policy hr_ack_documents_delete on public.hr_ack_documents
for delete
using (public.is_platform_admin() or public.hr_has_personnel_access(company_id));

drop policy if exists hr_ack_receipts_all on public.hr_ack_receipts;
create policy hr_ack_receipts_select on public.hr_ack_receipts
for select
using (public.hr_can_access_employee_row(company_id, employee_id));

create policy hr_ack_receipts_insert on public.hr_ack_receipts
for insert
with check (public.hr_can_access_employee_row(company_id, employee_id));

create policy hr_ack_receipts_update on public.hr_ack_receipts
for update
using (public.hr_can_access_employee_row(company_id, employee_id))
with check (public.hr_can_access_employee_row(company_id, employee_id));

create policy hr_ack_receipts_delete on public.hr_ack_receipts
for delete
using (public.hr_can_access_employee_row(company_id, employee_id));

-- ---------------------------------------------------------------------------
-- HR: employee wellness programme
-- ---------------------------------------------------------------------------

drop policy if exists hr_wellness_assessments_all on public.hr_employee_wellness_assessments;
create policy hr_wellness_assessments_select on public.hr_employee_wellness_assessments
for select
using (public.hr_can_access_employee_row(company_id, employee_id));

create policy hr_wellness_assessments_insert on public.hr_employee_wellness_assessments
for insert
with check (public.hr_can_access_employee_row(company_id, employee_id));

create policy hr_wellness_assessments_update on public.hr_employee_wellness_assessments
for update
using (public.hr_can_access_employee_row(company_id, employee_id))
with check (public.hr_can_access_employee_row(company_id, employee_id));

create policy hr_wellness_assessments_delete on public.hr_employee_wellness_assessments
for delete
using (public.hr_can_access_employee_row(company_id, employee_id));

drop policy if exists hr_wellness_actions_all on public.hr_employee_wellness_actions;
create policy hr_wellness_actions_select on public.hr_employee_wellness_actions
for select
using (
  public.is_platform_admin()
  or exists (
    select 1
    from public.hr_employee_wellness_assessments a
    where a.id = assessment_id
      and a.company_id = company_id
      and public.hr_can_access_employee_row(a.company_id, a.employee_id)
  )
);

create policy hr_wellness_actions_insert on public.hr_employee_wellness_actions
for insert
with check (
  public.is_platform_admin()
  or exists (
    select 1
    from public.hr_employee_wellness_assessments a
    where a.id = assessment_id
      and a.company_id = company_id
      and public.hr_can_access_employee_row(a.company_id, a.employee_id)
  )
);

create policy hr_wellness_actions_update on public.hr_employee_wellness_actions
for update
using (
  public.is_platform_admin()
  or exists (
    select 1
    from public.hr_employee_wellness_assessments a
    where a.id = assessment_id
      and a.company_id = company_id
      and public.hr_can_access_employee_row(a.company_id, a.employee_id)
  )
)
with check (
  public.is_platform_admin()
  or exists (
    select 1
    from public.hr_employee_wellness_assessments a
    where a.id = assessment_id
      and a.company_id = company_id
      and public.hr_can_access_employee_row(a.company_id, a.employee_id)
  )
);

create policy hr_wellness_actions_delete on public.hr_employee_wellness_actions
for delete
using (
  public.is_platform_admin()
  or exists (
    select 1
    from public.hr_employee_wellness_assessments a
    where a.id = assessment_id
      and a.company_id = company_id
      and public.hr_can_access_employee_row(a.company_id, a.employee_id)
  )
);
