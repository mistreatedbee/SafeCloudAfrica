-- HR final testing pass (2026-08-24)
--
-- 1. Archive support for performance reviews and disciplinary cases, matching
--    the existing archived-boolean pattern already used by hr_leave_requests
--    and hr_timesheets (see hr_module_2026_02_24.sql / hr_management_full_update_2026_03_03.sql).
--    Client code archives/restores these via the existing generic updateHrRecord()
--    helper (patch: { archived: true|false }) — no new archive RPC needed.
--
-- 2. hr_performance_reviews.corrective_responsible_user_id currently references
--    auth.users(id), so the "responsible person" picker only shows employees
--    with a linked login (hrService/HrPerformancePage.tsx filters on user_id).
--    Client testing wants ANY hr_employees row selectable. Repoint the FK at
--    hr_employees(id) so the column holds the HR employee id directly; the
--    corrective-action Task created alongside a review still resolves its own
--    assignee from that employee's linked user_id at the application layer
--    (a task needs a real platform user to be assigned to — an employee
--    without a login cannot receive a task assignment either way).
--
-- Idempotent: safe to re-run.

alter table public.hr_performance_reviews
  add column if not exists archived boolean not null default false;

alter table public.hr_disciplinary_cases
  add column if not exists archived boolean not null default false;

comment on column public.hr_performance_reviews.archived is
  'Archived reviews are hidden from the default list view (same pattern as hr_leave_requests.archived / hr_timesheets.archived).';
comment on column public.hr_disciplinary_cases.archived is
  'Archived cases are hidden from the default list view (same pattern as hr_leave_requests.archived / hr_timesheets.archived).';

alter table public.hr_performance_reviews
  drop constraint if exists hr_performance_reviews_corrective_responsible_user_id_fkey;

alter table public.hr_performance_reviews
  add constraint hr_performance_reviews_corrective_responsible_user_id_fkey
  foreign key (corrective_responsible_user_id) references public.hr_employees(id) on delete set null;

comment on column public.hr_performance_reviews.corrective_responsible_user_id is
  'References hr_employees(id) — the HR employee responsible for the corrective action (not necessarily a platform user; changed from auth.users(id) 2026-08-24 so unlinked employees can be picked too).';
