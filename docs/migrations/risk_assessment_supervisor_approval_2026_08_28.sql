-- Risk assessments: assigned supervisor/approver + reject/resubmit tracking (2026-08-28)
--
-- risk_assessments already has approved_by_user_id/approved_at (unused by application
-- code until now) but no way to assign WHO the approver actually is -- canWriteAssessment
-- in riskAssessmentsService.ts only checks the actor's company role, not a specific
-- assignment. This is why there was no real "assigned approver" concept: any
-- manager/supervisor/admin/owner could technically sign off any assessment, and there
-- was no per-document approver to notify or filter "my pending approvals" by.
--
-- supervisor_id points at hr_employees (not auth.users) to match the HR-employee-picker
-- pattern used across the app (see hr_ack_documents.employee_id, ppe_issues.issued_to_employee_id).
-- Reject sends the assessment back to status_v2='draft' (not a new status_v2 value --
-- see risk_assessment_active_archive_2026_08_27.sql, which deliberately trimmed status_v2
-- down to draft/submitted/active/archived) with rejected_by_user_id/rejected_at/
-- rejection_reason populated so the UI can show a "Rejected" badge distinct from a
-- plain draft. Resubmitting (status_v2 back to 'submitted') clears those three fields.
--
-- Idempotent: safe to re-run.

alter table public.risk_assessments
  add column if not exists supervisor_id uuid null references public.hr_employees(id) on delete set null,
  add column if not exists supervisor_name_snapshot text null,
  add column if not exists rejected_by_user_id uuid null references auth.users(id) on delete set null,
  add column if not exists rejected_at timestamptz null,
  add column if not exists rejection_reason text null;

comment on column public.risk_assessments.supervisor_id is
  'HR employee assigned to approve/reject this risk assessment before it can become active. Required before submission.';
comment on column public.risk_assessments.supervisor_name_snapshot is
  'Display name captured at assignment time, so the UI does not need an extra hr_employees lookup for every list row.';
comment on column public.risk_assessments.rejected_by_user_id is
  'Set when the assigned supervisor (or an admin/manager) rejects a submitted assessment. Cleared on resubmission.';
comment on column public.risk_assessments.rejected_at is
  'Timestamp of the most recent rejection. Cleared on resubmission.';
comment on column public.risk_assessments.rejection_reason is
  'Required reason captured on rejection. Cleared on resubmission.';

create index if not exists idx_risk_assessments_supervisor_pending
  on public.risk_assessments(company_id, supervisor_id)
  where status_v2 = 'submitted';
