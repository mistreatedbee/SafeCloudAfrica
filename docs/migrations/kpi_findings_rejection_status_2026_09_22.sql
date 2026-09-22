-- Adds a real "rejected" status to kpi_findings plus its own rejection metadata,
-- instead of overloading manager_sign_off_comment (meant for closure sign-off)
-- to also carry rejection reasons.
-- Apply date: 2026-09-22

alter table public.kpi_findings
  add column if not exists rejection_reason text null,
  add column if not exists rejected_by_user_id uuid null,
  add column if not exists rejected_at timestamptz null;

alter table public.kpi_findings drop constraint if exists kpi_findings_status_check;
alter table public.kpi_findings
  add constraint kpi_findings_status_check
  check (
    status = any (
      array[
        'open',
        'in_progress',
        'awaiting_evidence',
        'under_review',
        'closed',
        'overdue',
        'rejected'
      ]
    )
  );
