-- Incident form hardening and alignment with updated UI
-- Date: 2026-02-27
-- Safe to run multiple times.

alter table public.incidents
  add column if not exists incident_type text null,
  add column if not exists reported_by text null,
  add column if not exists reported_to text null,
  add column if not exists copy_to_emails text[] null,
  add column if not exists immediate_causes_unsafe_acts jsonb null default '[]'::jsonb,
  add column if not exists immediate_causes_unsafe_conditions jsonb null default '[]'::jsonb,
  add column if not exists loss_production_value numeric null,
  add column if not exists loss_reputational_value numeric null,
  add column if not exists loss_damage_asset_value numeric null,
  add column if not exists loss_illness_injury_value numeric null,
  add column if not exists loss_other_text text null,
  add column if not exists loss_notes text null;

alter table public.incidents
  alter column risk_severity_1_5 type smallint,
  alter column risk_likelihood_1_5 type smallint,
  alter column risk_rating_product type smallint;

alter table public.incidents
  drop constraint if exists incidents_risk_severity_1_5_check;
alter table public.incidents
  add constraint incidents_risk_severity_1_5_check
  check (risk_severity_1_5 is null or (risk_severity_1_5 between 1 and 5));

alter table public.incidents
  drop constraint if exists incidents_risk_likelihood_1_5_check;
alter table public.incidents
  add constraint incidents_risk_likelihood_1_5_check
  check (risk_likelihood_1_5 is null or (risk_likelihood_1_5 between 1 and 5));

alter table public.incidents
  drop constraint if exists incidents_risk_classification_check;
alter table public.incidents
  add constraint incidents_risk_classification_check
  check (risk_classification is null or risk_classification in ('Low', 'Medium', 'High', 'Critical'));

create index if not exists idx_incidents_risk_matrix
  on public.incidents(company_id, risk_likelihood_1_5, risk_severity_1_5, risk_rating_product);

create index if not exists idx_incidents_risk_classification
  on public.incidents(company_id, risk_classification);
