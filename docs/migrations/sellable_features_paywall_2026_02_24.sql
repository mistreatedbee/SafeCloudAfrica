-- Sellable Features paywall defaults (Super Admin lock/unlock control)
-- Safe to run multiple times.

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

-- Optional paid-org override:
-- Replace UUIDs below with organisations that have already paid for the sellable add-ons.
-- This update keeps enabled=true and sets locked=false for all sellable features.
--
-- with paid_orgs(company_id) as (
--   values
--     ('00000000-0000-0000-0000-000000000000'::uuid)
-- )
-- update public.companies c
-- set metadata = jsonb_set(
--   coalesce(c.metadata, '{}'::jsonb),
--   '{sellable_features}',
--   jsonb_build_object(
--     'bbs', jsonb_build_object('enabled', true, 'locked', false),
--     'contractorsVisitors', jsonb_build_object('enabled', true, 'locked', false),
--     'emergencyPreparedness', jsonb_build_object('enabled', true, 'locked', false),
--     'templateLibrary', jsonb_build_object('enabled', true, 'locked', false),
--     'assetManagement', jsonb_build_object('enabled', true, 'locked', false),
--     'hazardousChemicals', jsonb_build_object('enabled', true, 'locked', false)
--   ),
--   true
-- )
-- from paid_orgs p
-- where c.id = p.company_id;
