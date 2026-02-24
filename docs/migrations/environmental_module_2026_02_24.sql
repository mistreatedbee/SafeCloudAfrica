-- Environmental module expansion (2026-02-24)
-- Adds EIA, environmental risk/opportunity, waste, water, and air monitoring registers.

create extension if not exists pgcrypto;

create table if not exists public.env_impact_assessments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ref_number text not null,
  activity_or_process text not null,
  environmental_aspect_cause text not null,
  potential_impact_effect text not null,
  legal_requirement_id uuid null references public.legal_requirements(id) on delete set null,
  legal_requirement_label_snapshot text null,
  existing_controls text null,
  severity integer not null check (severity between 1 and 5),
  likelihood integer not null check (likelihood between 1 and 5),
  risk_rating integer generated always as (severity * likelihood) stored,
  risk_level text generated always as (
    case
      when (severity * likelihood) between 1 and 5 then 'Low'
      when (severity * likelihood) between 6 and 12 then 'Medium'
      else 'High'
    end
  ) stored,
  additional_controls text null,
  responsible_user_id uuid null references auth.users(id) on delete set null,
  responsible_external_name text null,
  review_date date null,
  linked_risk_assessment_ids uuid[] not null default '{}',
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, ref_number)
);

create table if not exists public.env_risk_opportunity (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  reference_number text not null,
  category text not null,
  type text not null check (type in ('Risk', 'Opportunity')),
  risk_or_opportunity text not null,
  description text null,
  cause text null,
  potential_impact text null,
  likelihood integer not null check (likelihood between 1 and 5),
  severity_or_benefit integer not null check (severity_or_benefit between 1 and 5),
  rating integer generated always as (likelihood * severity_or_benefit) stored,
  level text generated always as (
    case
      when (likelihood * severity_or_benefit) between 1 and 5 then 'Low'
      when (likelihood * severity_or_benefit) between 6 and 12 then 'Medium'
      else 'High'
    end
  ) stored,
  existing_controls text null,
  action_required text null,
  responsible_user_id uuid null references auth.users(id) on delete set null,
  responsible_external_name text null,
  target_date date null,
  status text not null default 'Open',
  linked_legal_requirement_id uuid null references public.legal_requirements(id) on delete set null,
  linked_eia_id uuid null references public.env_impact_assessments(id) on delete set null,
  linked_risk_assessment_ids uuid[] not null default '{}',
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, reference_number)
);

create table if not exists public.env_waste_disposal (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ref_no text not null,
  date date not null,
  site_department text not null,
  waste_category text not null,
  waste_type_name text not null,
  waste_classification text not null check (waste_classification in ('General', 'Hazardous')),
  quantity_value numeric(14, 3) not null,
  quantity_unit text not null,
  storage_location text null,
  disposal_method text null,
  disposal_site text null,
  contractor_name text null,
  contractor_licence_file_ids uuid[] not null default '{}',
  contractor_licence_expiry_date date null,
  facility_name text null,
  facility_permit_file_ids uuid[] not null default '{}',
  facility_permit_expiry_date date null,
  responsible_user_id uuid null references auth.users(id) on delete set null,
  responsible_external_name text null,
  remarks text null,
  non_conformances_deviations text[] not null default '{}',
  reviewed_by_user_id uuid null references auth.users(id) on delete set null,
  approved_by_user_id uuid null references auth.users(id) on delete set null,
  approved_at timestamptz null,
  status text not null default 'Draft' check (status in ('Draft', 'Submitted', 'Approved')),
  escalation_flag boolean not null default false,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, ref_no)
);

create table if not exists public.env_water_monitoring (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  reference_number text not null,
  site_facility_name text not null,
  gps_location_or_sampling_point_id text not null,
  water_type text not null,
  sampling_date date not null,
  sampling_time time null,
  purpose text null,
  scope text null,
  legal_requirement_id uuid null references public.legal_requirements(id) on delete set null,
  legal_reference_snapshot text null,
  sample_type text null,
  sampling_method_used text null,
  weather_conditions text null,
  sampler_name text null,
  sampler_company text null,
  laboratory_used text null,
  visual_condition text null,
  odour text null,
  oil_sheen text null,
  sediment_presence text null,
  blocked_drains_or_overflows text null,
  photo_file_ids uuid[] not null default '{}',
  parameters jsonb not null default '[]'::jsonb,
  overall_compliance_status text not null default 'Pass' check (overall_compliance_status in ('Pass', 'Fail')),
  breached_legislation_or_permit_reference text null,
  assessed_environmental_risk text null,
  potential_cause text null,
  system_generated_capa_id uuid null references public.quality_ncrs(id) on delete set null,
  controls_effectiveness_review text null,
  conclusion_compliance_statement text null,
  reviewed_by_user_id uuid null references auth.users(id) on delete set null,
  approved_by_user_id uuid null references auth.users(id) on delete set null,
  approved_at timestamptz null,
  laboratory_reports_file_ids uuid[] not null default '{}',
  calibration_certificates_file_ids uuid[] not null default '{}',
  permits_licences_file_ids uuid[] not null default '{}',
  sampling_locations_file_ids uuid[] not null default '{}',
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, reference_number)
);

create table if not exists public.env_air_quality (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  reference_number text not null,
  emission_source_categories text[] not null default '{}',
  legal_requirement_ids uuid[] not null default '{}',
  legal_references_snapshot text[] not null default '{}',
  monitoring_frequency text not null,
  monitoring_date date not null,
  monitoring_time time null,
  monitoring_location text not null,
  method_used text not null,
  equipment_id text null,
  calibration_status text null,
  weather_conditions text null,
  conducted_by_name text null,
  conducted_by_company text null,
  results jsonb not null default '[]'::jsonb,
  auto_flag_exceedances boolean not null default true,
  overall_status text not null default 'Pass' check (overall_status in ('Pass', 'Fail')),
  system_generated_capa_id uuid null references public.quality_ncrs(id) on delete set null,
  non_conformance_notes text null,
  trend_analysis_notes text null,
  attachment_file_ids uuid[] not null default '{}',
  reviewed_by_user_id uuid null references auth.users(id) on delete set null,
  approved_by_user_id uuid null references auth.users(id) on delete set null,
  approved_at timestamptz null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, reference_number)
);

create index if not exists idx_env_impact_assessments_company_review_date on public.env_impact_assessments(company_id, review_date);
create index if not exists idx_env_risk_opportunity_company_status_target on public.env_risk_opportunity(company_id, status, target_date);
create index if not exists idx_env_waste_disposal_company_date on public.env_waste_disposal(company_id, date desc);
create index if not exists idx_env_waste_disposal_company_expiry on public.env_waste_disposal(company_id, contractor_licence_expiry_date, facility_permit_expiry_date);
create index if not exists idx_env_water_monitoring_company_sampling on public.env_water_monitoring(company_id, sampling_date desc);
create index if not exists idx_env_water_monitoring_company_compliance on public.env_water_monitoring(company_id, overall_compliance_status);
create index if not exists idx_env_air_quality_company_monitoring on public.env_air_quality(company_id, monitoring_date desc);
create index if not exists idx_env_air_quality_company_status on public.env_air_quality(company_id, overall_status);

create or replace function public.env_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_env_impact_assessments_set_updated_at on public.env_impact_assessments;
create trigger trg_env_impact_assessments_set_updated_at
before update on public.env_impact_assessments
for each row execute function public.env_set_updated_at();

drop trigger if exists trg_env_risk_opportunity_set_updated_at on public.env_risk_opportunity;
create trigger trg_env_risk_opportunity_set_updated_at
before update on public.env_risk_opportunity
for each row execute function public.env_set_updated_at();

drop trigger if exists trg_env_waste_disposal_set_updated_at on public.env_waste_disposal;
create trigger trg_env_waste_disposal_set_updated_at
before update on public.env_waste_disposal
for each row execute function public.env_set_updated_at();

drop trigger if exists trg_env_water_monitoring_set_updated_at on public.env_water_monitoring;
create trigger trg_env_water_monitoring_set_updated_at
before update on public.env_water_monitoring
for each row execute function public.env_set_updated_at();

drop trigger if exists trg_env_air_quality_set_updated_at on public.env_air_quality;
create trigger trg_env_air_quality_set_updated_at
before update on public.env_air_quality
for each row execute function public.env_set_updated_at();

alter table public.env_impact_assessments enable row level security;
alter table public.env_risk_opportunity enable row level security;
alter table public.env_waste_disposal enable row level security;
alter table public.env_water_monitoring enable row level security;
alter table public.env_air_quality enable row level security;

drop policy if exists env_impact_assessments_tenant_isolation on public.env_impact_assessments;
create policy env_impact_assessments_tenant_isolation on public.env_impact_assessments
for all using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists env_risk_opportunity_tenant_isolation on public.env_risk_opportunity;
create policy env_risk_opportunity_tenant_isolation on public.env_risk_opportunity
for all using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists env_waste_disposal_tenant_isolation on public.env_waste_disposal;
create policy env_waste_disposal_tenant_isolation on public.env_waste_disposal
for all using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists env_water_monitoring_tenant_isolation on public.env_water_monitoring;
create policy env_water_monitoring_tenant_isolation on public.env_water_monitoring
for all using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists env_air_quality_tenant_isolation on public.env_air_quality;
create policy env_air_quality_tenant_isolation on public.env_air_quality
for all using (public.is_company_member(company_id) or public.is_platform_admin());

create or replace function public.get_env_expiry_reminders(p_company_id uuid)
returns table (
  reminder_type text,
  entity_type text,
  entity_id uuid,
  days_remaining integer,
  message text
)
language sql
stable
as $$
  with waste_items as (
    select
      w.id,
      least(
        coalesce(w.contractor_licence_expiry_date, '9999-12-31'::date),
        coalesce(w.facility_permit_expiry_date, '9999-12-31'::date)
      ) as expiry_date
    from public.env_waste_disposal w
    where w.company_id = p_company_id
  )
  select
    'expiry'::text,
    'env_waste_disposal'::text,
    wi.id,
    (wi.expiry_date - current_date)::integer,
    case
      when (wi.expiry_date - current_date) < 0 then 'Waste contractor/facility permit has expired.'
      else 'Waste contractor/facility permit expires in ' || (wi.expiry_date - current_date)::text || ' day(s).'
    end
  from waste_items wi
  where (wi.expiry_date - current_date) in (-3650, -1, 0, 1, 7, 14, 30)

  union all

  select
    'review_due'::text,
    'env_impact_assessments'::text,
    e.id,
    (e.review_date - current_date)::integer,
    case
      when (e.review_date - current_date) < 0 then 'EIA review date is overdue.'
      else 'EIA review due in ' || (e.review_date - current_date)::text || ' day(s).'
    end
  from public.env_impact_assessments e
  where e.company_id = p_company_id
    and e.review_date is not null
    and (e.review_date - current_date) in (-3650, -1, 0, 1, 7, 14, 30)

  union all

  select
    'target_due'::text,
    'env_risk_opportunity'::text,
    r.id,
    (r.target_date - current_date)::integer,
    case
      when (r.target_date - current_date) < 0 then 'Risk/opportunity action target date is overdue.'
      else 'Risk/opportunity action due in ' || (r.target_date - current_date)::text || ' day(s).'
    end
  from public.env_risk_opportunity r
  where r.company_id = p_company_id
    and r.target_date is not null
    and (r.target_date - current_date) in (-3650, -1, 0, 1, 7, 14, 30);
$$;
