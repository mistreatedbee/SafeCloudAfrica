-- Incident KPI classification fields for TRIR, LTIFR, Severity, Near Miss, etc.
-- Apply after incident_module_enhancements.sql. Safe to run multiple times.

alter table public.incidents
  add column if not exists lost_days numeric null,
  add column if not exists is_recordable_injury boolean null,
  add column if not exists is_lost_time_injury boolean null,
  add column if not exists is_fatality boolean null,
  add column if not exists is_near_miss boolean null,
  add column if not exists is_accident boolean null,
  add column if not exists is_environmental_incident boolean null,
  add column if not exists is_spill boolean null,
  add column if not exists project_id uuid null,
  add column if not exists client_id uuid null;

comment on column public.incidents.lost_days is 'Total lost days (for Severity Rate)';
comment on column public.incidents.is_recordable_injury is 'Recordable injury (TRIR numerator)';
comment on column public.incidents.is_lost_time_injury is 'Lost time injury (LTIFR, LTI-free reset)';
comment on column public.incidents.is_fatality is 'Fatality (Fatality Rate, LTI-free reset)';
comment on column public.incidents.is_near_miss is 'Near miss (Near Miss Frequency Rate)';
comment on column public.incidents.is_accident is 'Accident (Accident Frequency Rate)';
comment on column public.incidents.is_environmental_incident is 'Environmental incident';
comment on column public.incidents.is_spill is 'Spill (Spill Frequency Rate)';

-- Backfill from category/subcategory/incident_type where column is still null (safe to re-run)
update public.incidents set is_fatality = (trim(lower(coalesce(subcategory, ''))) = 'fatality') where is_fatality is null;
update public.incidents set is_lost_time_injury = (trim(lower(coalesce(subcategory, ''))) = 'lti') where is_lost_time_injury is null;
update public.incidents set is_recordable_injury = (trim(lower(coalesce(subcategory, ''))) in ('lti', 'nlti')) where is_recordable_injury is null;
update public.incidents set is_near_miss = (trim(lower(coalesce(incident_type, ''))) = 'near miss' or trim(lower(coalesce(type_of_incident, ''))) = 'near miss') where is_near_miss is null;
update public.incidents set is_accident = (trim(lower(coalesce(incident_type, ''))) = 'accident' or trim(lower(coalesce(type_of_incident, ''))) = 'accident') where is_accident is null;
update public.incidents set is_environmental_incident = (trim(lower(coalesce(category, ''))) = 'environmental' or trim(lower(coalesce(incident_type, ''))) like '%environmental%') where is_environmental_incident is null;
update public.incidents set is_spill = (trim(lower(coalesce(category, ''))) = 'environmental' and (trim(lower(coalesce(subcategory, ''))) like '%spill%')) where is_spill is null;

create index if not exists idx_incidents_kpi_classification on public.incidents(company_id, occurred_at)
  where is_recordable_injury = true or is_lost_time_injury = true or is_fatality = true or is_near_miss = true or is_accident = true or is_environmental_incident = true or is_spill = true;
