-- Asset Management + Hazardous Chemical Management registers
-- Safe to run multiple times.

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  asset_tag text null,
  name text not null,
  category text null,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'under_maintenance', 'disposed')),
  location text null,
  assigned_user_id uuid null,
  maintenance_due_date date null,
  inspection_due_date date null,
  last_maintenance_at timestamptz null,
  notes text null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_assets_company_status
  on public.assets(company_id, status, updated_at desc);
create index if not exists idx_assets_company_maintenance_due
  on public.assets(company_id, maintenance_due_date);
create index if not exists idx_assets_company_inspection_due
  on public.assets(company_id, inspection_due_date);

alter table public.assets enable row level security;

drop policy if exists assets_select_member on public.assets;
create policy assets_select_member
on public.assets for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists assets_write_management on public.assets;
create policy assets_write_management
on public.assets for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

create table if not exists public.hazardous_chemicals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  chemical_name text not null,
  cas_number text null,
  storage_location text null,
  quantity text null,
  hazard_class text null,
  sds_status text not null default 'missing'
    check (sds_status in ('missing', 'on_file', 'expired')),
  approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'restricted')),
  notes text null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_hazardous_chemicals_company_name
  on public.hazardous_chemicals(company_id, chemical_name);
create index if not exists idx_hazardous_chemicals_company_sds
  on public.hazardous_chemicals(company_id, sds_status);

alter table public.hazardous_chemicals enable row level security;

drop policy if exists hazardous_chemicals_select_member on public.hazardous_chemicals;
create policy hazardous_chemicals_select_member
on public.hazardous_chemicals for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists hazardous_chemicals_write_management on public.hazardous_chemicals;
create policy hazardous_chemicals_write_management
on public.hazardous_chemicals for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- Register sellable-feature keys in company metadata (locked by default; Super Admin unlocks per org).
with defaults as (
  select
    '{
      "bbs": {"enabled": true, "locked": true},
      "contractorsVisitors": {"enabled": true, "locked": true},
      "emergencyPreparedness": {"enabled": true, "locked": true},
      "templateLibrary": {"enabled": true, "locked": true},
      "assetManagement": {"enabled": true, "locked": true},
      "hazardousChemicals": {"enabled": true, "locked": true}
    }'::jsonb as cfg
)
update public.companies c
set metadata = jsonb_set(
  coalesce(c.metadata, '{}'::jsonb),
  '{sellable_features}',
  (
    select jsonb_object_agg(
      k.key,
      jsonb_build_object(
        'enabled',
        coalesce(
          (c.metadata -> 'sellable_features' -> k.key ->> 'enabled')::boolean,
          (d.cfg -> k.key ->> 'enabled')::boolean
        ),
        'locked',
        coalesce(
          (c.metadata -> 'sellable_features' -> k.key ->> 'locked')::boolean,
          (d.cfg -> k.key ->> 'locked')::boolean
        )
      )
    )
    from defaults d,
      lateral jsonb_object_keys(d.cfg) as k(key)
  ),
  true
);

notify pgrst, 'reload schema';
