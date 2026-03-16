-- Environmental air quality enhancements (2026-03-16)
-- Adds monitoring tools and laboratory accreditation fields to env_air_quality.

alter table if exists public.env_air_quality
  add column if not exists monitoring_tools text[] not null default '{}';

alter table if exists public.env_air_quality
  add column if not exists lab_name text null;

alter table if exists public.env_air_quality
  add column if not exists lab_accreditation_number text null;

alter table if exists public.env_air_quality
  add column if not exists lab_accreditation_authority text null;

alter table if exists public.env_air_quality
  add column if not exists lab_accreditation_certificate_file_ids uuid[] not null default '{}';

