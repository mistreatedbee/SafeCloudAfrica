-- Organization member scope and seat logic (6-dashboard architecture).
-- Apply after phase2-schema.sql, operating_model_roles_licensing.sql, org_licenses.sql, license_activation_schema.sql, sites_departments_user_profiles.sql.
-- Safe to run multiple times (idempotent).

-- ---------------------------------------------------------------------------
-- 1) company_memberships: status, department_id, site_id, invited_by_user_id, consultant_scope, seat_exempt
-- ---------------------------------------------------------------------------
alter table public.company_memberships
  add column if not exists status text null;

update public.company_memberships set status = 'ACTIVE' where status is null;
alter table public.company_memberships alter column status set default 'ACTIVE';
alter table public.company_memberships alter column status set not null;

alter table public.company_memberships drop constraint if exists company_memberships_status_check;
alter table public.company_memberships
  add constraint company_memberships_status_check
  check (status in ('INVITED','ACTIVE','DISABLED'));

alter table public.company_memberships
  add column if not exists department_id uuid null references public.departments(id) on delete set null;

alter table public.company_memberships
  add column if not exists site_id uuid null references public.sites(id) on delete set null;

alter table public.company_memberships
  add column if not exists invited_by_user_id uuid null;

alter table public.company_memberships
  add column if not exists consultant_scope jsonb null;

alter table public.company_memberships
  add column if not exists seat_exempt boolean not null default false;

comment on column public.company_memberships.status is 'INVITED = pending accept; ACTIVE = can access; DISABLED = revoked.';
comment on column public.company_memberships.department_id is 'For supervisor/manager: scope to this department.';
comment on column public.company_memberships.site_id is 'For supervisor/manager: scope to this site.';
comment on column public.company_memberships.consultant_scope is 'For consultant/auditor: { allowedModules[], allowedDepartments[], allowedSites[], auditIds[], expiresAt }.';
comment on column public.company_memberships.seat_exempt is 'If true, this member does not count toward seat_limit (e.g. external auditor add-on).';

create index if not exists idx_company_memberships_status on public.company_memberships(company_id, status);
create index if not exists idx_company_memberships_department on public.company_memberships(department_id) where department_id is not null;
create index if not exists idx_company_memberships_site on public.company_memberships(site_id) where site_id is not null;

-- ---------------------------------------------------------------------------
-- 2) org_licenses: is_trial, trial_ends_at, billing_status
-- ---------------------------------------------------------------------------
alter table public.org_licenses
  add column if not exists is_trial boolean not null default false;

alter table public.org_licenses
  add column if not exists trial_ends_at date null;

alter table public.org_licenses
  add column if not exists billing_status text null;

alter table public.org_licenses drop constraint if exists org_licenses_billing_status_check;
alter table public.org_licenses
  add constraint org_licenses_billing_status_check
  check (billing_status is null or billing_status in ('ACTIVE','PAST_DUE','CANCELED'));

comment on column public.org_licenses.is_trial is 'True when subscription is in trial (e.g. 30 days); exports blocked.';
comment on column public.org_licenses.trial_ends_at is 'When trial ends; used to block exports during trial.';
comment on column public.org_licenses.billing_status is 'ACTIVE | PAST_DUE | CANCELED for future billing integration.';

-- ---------------------------------------------------------------------------
-- 3) Count billable seats (ACTIVE members; consultant/auditor consume seat unless seat_exempt)
-- ---------------------------------------------------------------------------
create or replace function public.count_billable_seats(p_company_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.company_memberships m
  where m.company_id = p_company_id
    and m.status = 'ACTIVE'
    and (m.role not in ('consultant','auditor') or m.seat_exempt = false);
$$;

comment on function public.count_billable_seats(uuid) is 'Number of members that consume a seat (ACTIVE; consultant/auditor only if not seat_exempt).';

grant execute on function public.count_billable_seats(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Get effective seat limit for a company (from latest org_licenses or company.employee_limit)
-- ---------------------------------------------------------------------------
create or replace function public.get_company_seat_limit(p_company_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select ol.seat_limit
     from public.org_licenses ol
     where ol.company_id = p_company_id
       and ol.status = 'active'
     order by ol.end_date desc
     limit 1),
    (select c.employee_limit from public.companies c where c.id = p_company_id),
    1
  );
$$;

comment on function public.get_company_seat_limit(uuid) is 'Effective seat limit for company (org_licenses.active or company.employee_limit).';

grant execute on function public.get_company_seat_limit(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) RLS: only ACTIVE members have access (INVITED cannot access org data)
-- ---------------------------------------------------------------------------
create or replace function public.is_company_member(p_company_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.company_memberships m
    where m.company_id = p_company_id
      and m.user_id = public.request_user_id()
      and m.status = 'ACTIVE'
  );
$$;

create or replace function public.company_role(p_company_id uuid)
returns text
language sql
stable
as $$
  select m.role
  from public.company_memberships m
  where m.company_id = p_company_id
    and m.user_id = public.request_user_id()
    and m.status = 'ACTIVE'
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 6) Trigger: enforce seat limit on insert (billable seats only)
-- ---------------------------------------------------------------------------
create or replace function public.enforce_employee_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  limit_val integer;
  current_billable integer;
  new_billable boolean;
begin
  limit_val := public.get_company_seat_limit(new.company_id);
  current_billable := public.count_billable_seats(new.company_id);
  new_billable := (new.role not in ('consultant','auditor') or new.seat_exempt = false);
  if new_billable then
    current_billable := current_billable + 1;
  end if;
  if current_billable > limit_val then
    raise exception 'Seat limit reached (% users). Upgrade license to add more.', limit_val;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_employee_limit on public.company_memberships;
create trigger trg_enforce_employee_limit
  before insert on public.company_memberships
  for each row execute function public.enforce_employee_limit();
