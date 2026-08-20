-- PPE module: link the reported/affected employee on ppe_issue_tracker to HR, and
-- support a free-text name for people receiving PPE who aren't in HR (contractors,
-- visitors, or staff without a linked platform user account).
--
-- ppe_issue_tracker already had responsible_user_id, supervisor_user_id, department_id
-- and site_id as real relational columns, but the reported employee/contractor was
-- only ever captured as free text (contractor_or_employee_name, employee_number,
-- job_role_or_task) with no employee_id to trace it back to HR -- so PPE
-- non-conformances involving a known HR employee could not be linked to that
-- employee's record. Add employee_id, matching the existing
-- ppe_issues.issued_to_employee_id pattern.
--
-- ppe_issues has issued_to_employee_id (HR) and issued_to_user_id (platform user) but
-- no free-text name column, so a person issued PPE who is neither an HR employee nor
-- a platform user (e.g. a contractor) could not be named on the record at all. Add
-- issued_to_name for that manual-entry case; issued_to_employee_id/issued_to_user_id
-- remain the source of truth whenever the person is HR-linked.
--
-- Idempotent: safe to re-run.

alter table if exists public.ppe_issue_tracker
  add column if not exists employee_id uuid null references public.hr_employees(id) on delete set null;

create index if not exists idx_ppe_issue_tracker_employee_id
  on public.ppe_issue_tracker(employee_id);

alter table if exists public.ppe_issues
  add column if not exists issued_to_name text null;

comment on column public.ppe_issue_tracker.employee_id is
  'HR employee this report concerns, when the person is a known HR employee. NULL for manually-entered contractors/employees not in HR -- see contractor_or_employee_name for the display name in that case.';

comment on column public.ppe_issues.issued_to_name is
  'Display name for the person PPE was issued to when they are not linked via issued_to_employee_id/issued_to_user_id (e.g. a contractor not in HR). NULL when the person is HR/user-linked -- resolve the name from that relationship instead.';
