-- Allow PC (Partial Conformity) as an audit response compliance status.
alter table public.audit_responses drop constraint if exists audit_responses_compliance_status_check;
alter table public.audit_responses
  add constraint audit_responses_compliance_status_check
  check (compliance_status is null or compliance_status in ('C', 'PC', 'NC', 'Obs', 'N/A'));
