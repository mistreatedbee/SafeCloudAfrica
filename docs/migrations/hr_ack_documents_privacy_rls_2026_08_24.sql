-- HR document acknowledgement: single-employee assignment + privacy RLS (2026-08-24)
--
-- 1. hr_ack_documents currently only supports "assign to all" or "assign by
--    role/department" — there is no way to assign a policy/ack document to
--    exactly one employee. Add employee_id (nullable) for that case.
-- 2. hr_ack_documents has no archive/lifecycle status. Add status so assigners
--    can archive an acknowledged document and hide it from the default list.
-- 3. hr_employee_documents (personal docs) gets a decline_reason column so an
--    employee can decline to acknowledge a document with a reason, mirroring
--    the existing hr_ack_receipts decline path (hr_ack_receipts_decline_2026_07_03.sql).
-- 4. Privacy fix: hr_ack_documents_select (from hr_rls_personnel_and_self_service_2026_03_21.sql)
--    currently lets ANY company member read ANY ack document row — including
--    one assigned to a single named employee. Once employee_id is populated,
--    only that employee (or personnel/admin roles) should be able to see it.
--    hr_employee_documents is already correctly scoped per-employee via
--    hr_can_access_employee_row (see hr_rls_personnel_and_self_service_2026_03_21.sql)
--    and needs no change.
--
-- Run via InsForge dashboard or CLI `db query` before deploying the client update.
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

alter table public.hr_ack_documents
  add column if not exists employee_id uuid null references public.hr_employees(id) on delete set null;

alter table public.hr_ack_documents
  add column if not exists status text not null default 'ACTIVE'
  check (status in ('ACTIVE', 'ARCHIVED'));

comment on column public.hr_ack_documents.employee_id is
  'When set, this document is assigned to exactly one HR employee (not the whole company/role/department). Takes priority over assigned_roles/assigned_department_ids.';
comment on column public.hr_ack_documents.status is
  'ACTIVE (default) or ARCHIVED. Archived documents are hidden from the default acknowledgement list view.';

create index if not exists idx_hr_ack_documents_employee_id on public.hr_ack_documents(employee_id) where employee_id is not null;

alter table public.hr_employee_documents
  add column if not exists decline_reason text null;

comment on column public.hr_employee_documents.decline_reason is
  'Reason the employee gave for declining to acknowledge this document. Null while pending or once acknowledged.';

-- ---------------------------------------------------------------------------
-- RLS: hr_ack_documents privacy for single-employee assignment
-- ---------------------------------------------------------------------------

drop policy if exists hr_ack_documents_select on public.hr_ack_documents;
create policy hr_ack_documents_select on public.hr_ack_documents
for select
using (
  public.is_platform_admin()
  or public.hr_has_personnel_access(company_id)
  or (employee_id is null and public.is_company_member(company_id)) -- assigned to all / by role / by department: visible to all company members
  or public.hr_can_access_employee_row(company_id, employee_id) -- assigned to one employee: only that employee (personnel access already covered above)
);
