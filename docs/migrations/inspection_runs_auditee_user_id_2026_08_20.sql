-- Fix: "Could not create inspection" / "Could not find the 'auditee_user_id' column
-- of 'inspection_runs' in the schema cache" when creating an inspection with a
-- checklist template selected.
--
-- checklist_authoritative_workflow_2026_02_27.sql added auditee_user_id to
-- public.inspections but missed adding it to public.inspection_runs, even though
-- createInspectionRunFromTemplate() (src/api/services/inspectionsService.ts) has
-- always inserted auditee_user_id into inspection_runs alongside auditor_user_id.
-- inspection_runs.auditor_user_id exists from that same migration; auditee_user_id
-- was simply never added to this table.
--
-- Idempotent: safe to re-run.

alter table if exists public.inspection_runs
  add column if not exists auditee_user_id uuid null;
