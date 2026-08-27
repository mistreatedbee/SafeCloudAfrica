-- Audit checklist schema sync for app features (section, scores, finding types)
-- Apply date: 2026-08-27

alter table public.audit_questions
  add column if not exists section text,
  add column if not exists allocated_score numeric;

alter table public.audit_responses
  add column if not exists deviation_type text;

alter table public.audit_responses drop constraint if exists audit_responses_deviation_type_check;

alter table public.audit_responses
  add constraint audit_responses_deviation_type_check
  check (
    deviation_type is null
    or deviation_type in ('observation', 'finding', 'non_conformance', 'opportunity_for_improvement')
  );
