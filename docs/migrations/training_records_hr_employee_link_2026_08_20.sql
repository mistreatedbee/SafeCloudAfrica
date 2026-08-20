-- Training module: training_records could only reference a person via user_id (a
-- platform login), with no employee_id at all. In this company's real data every HR
-- employee has user_id = NULL (no linked login), and the Employee selector on
-- "Add Training Record" (HrEmployeeSelect, default valueField="user_id") only shows
-- employees WITH a linked user_id -- so the selector was always empty and no
-- training_records could ever be created (table has 0 rows).
--
-- Fix: add employee_id so a training record can be tied to an HR employee whether or
-- not that employee has a platform login. user_id is kept (existing notification/
-- job-description-sync logic still uses it for employees who do have logins) but is
-- no longer required -- at least one of employee_id/user_id must be set.
--
-- Idempotent: safe to re-run.

alter table if exists public.training_records
  add column if not exists employee_id uuid null references public.hr_employees(id) on delete set null;

create index if not exists idx_training_records_employee_id
  on public.training_records(employee_id);

alter table if exists public.training_records
  alter column user_id drop not null;

alter table if exists public.training_records
  drop constraint if exists training_records_employee_or_user_check;

alter table if exists public.training_records
  add constraint training_records_employee_or_user_check
  check (employee_id is not null or user_id is not null);

comment on column public.training_records.employee_id is
  'HR employee this training record belongs to. Preferred over user_id -- set for every employee regardless of whether they have a platform login. See training_records_employee_or_user_check.';
comment on column public.training_records.user_id is
  'Platform user this training record belongs to, when the employee has a linked login (used for in-app/email notifications and job-description training sync). NULL when the employee has no login -- use employee_id instead.';
