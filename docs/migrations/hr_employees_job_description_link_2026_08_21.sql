-- Closes the Training gap: syncTrainingRequirementsForUser() (auto-assigning required
-- training when a job description is set) was keyed entirely off
-- user_profiles.job_description_id / user_id, so it silently did nothing for any HR
-- employee without a platform login (i.e. most real employees in this system -- see
-- training_records_hr_employee_link_2026_08_20.sql). Add the employee-level
-- equivalent field so the same auto-sync can work from the HR employee record
-- directly.
--
-- Idempotent: safe to re-run.

alter table if exists public.hr_employees
  add column if not exists job_description_id uuid null references public.job_descriptions(id) on delete set null;

create index if not exists idx_hr_employees_job_description_id
  on public.hr_employees(job_description_id);

comment on column public.hr_employees.job_description_id is
  'Links this employee to a Training Matrix job description so required training can be auto-assigned (see syncTrainingRequirementsForEmployee). Distinct from job_title (free text).';
