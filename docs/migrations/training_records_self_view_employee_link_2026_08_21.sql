-- Follow-up to training_records_hr_employee_link_2026_08_20.sql: an employee with a
-- platform login could see their own training via the user_id = request_user_id()
-- clause, but not via employee_id -- so once employees start getting logins, an
-- employee-linked-only record they own wouldn't be visible to them. Widen the
-- self-view clause to also match through hr_employees.user_id.
--
-- Idempotent: safe to re-run.

drop policy if exists training_records_select_role on public.training_records;
create policy training_records_select_role on public.training_records
for select
using (
  is_company_consultant_or_admin(company_id)
  or is_platform_admin()
  or user_id = request_user_id()
  or employee_id in (select id from public.hr_employees where user_id = request_user_id())
);
