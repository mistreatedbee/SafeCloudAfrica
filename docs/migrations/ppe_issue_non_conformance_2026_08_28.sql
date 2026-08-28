-- PPE issue non-conformance flag (2026-08-28)
--
-- Lets the assigner flag a specific PPE issue as non-conformant (e.g. wrong
-- size worn, PPE not being used correctly) with a required reason, so it can
-- be surfaced to the employee's supervisor. Client code sends a notification
-- via notificationEventsService.notifyRelevantUsers when this is set — see
-- flagPpeIssueNonConformance() in ppeService.ts.
--
-- Idempotent: safe to re-run.

alter table public.ppe_issues
  add column if not exists is_non_conformant boolean not null default false,
  add column if not exists non_conformance_reason text null;

comment on column public.ppe_issues.is_non_conformant is
  'True when this PPE issue has been flagged as a non-conformance by the assigner (e.g. incorrect use, wrong size). See non_conformance_reason.';
comment on column public.ppe_issues.non_conformance_reason is
  'Required free-text reason captured when is_non_conformant is set to true. Null while not flagged.';

create index if not exists idx_ppe_issues_is_non_conformant
  on public.ppe_issues(company_id, is_non_conformant)
  where is_non_conformant = true;
