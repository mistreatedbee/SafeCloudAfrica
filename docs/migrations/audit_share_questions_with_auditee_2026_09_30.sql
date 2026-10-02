-- Lets an auditor/admin explicitly share the audit question list with the
-- auditee (read-only, no responses/scores) and notify them by email.
-- Apply date: 2026-09-30

alter table public.audits
  add column if not exists share_questions_with_auditee boolean not null default false,
  add column if not exists questions_shared_at timestamptz null;
