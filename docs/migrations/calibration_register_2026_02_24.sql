-- Calibration Register (Quality shared across modules)
-- Source template: Quality Forms19-2-26.docx (Calibration)

create extension if not exists pgcrypto;

create table if not exists public.calibration_record_counter (
  company_id uuid primary key references public.companies(id) on delete cascade,
  last_number integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.calibration_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  site_id uuid null references public.sites(id) on delete set null,
  department_id uuid null references public.departments(id) on delete set null,
  sr_no integer not null,
  equipment_name text not null,
  equipment_id text not null,
  location text not null,
  criticality text not null check (criticality in ('HIGH', 'MEDIUM', 'LOW')),
  equipment_status text not null check (equipment_status in ('IN_SERVICE', 'OUT_OF_SERVICE', 'REQUIRES_ADJUSTMENT_REPAIR')),
  measuring_range text null,
  calibration_type text null,
  calibration_frequency text null,
  calibration_date date not null,
  result text not null check (result in ('PASS', 'FAIL')),
  next_calibration_date date not null,
  responsible_user_id uuid null references auth.users(id) on delete set null,
  responsible_name_snapshot text not null,
  item_picture_file_id uuid null references public.evidence_attachments(id) on delete set null,
  certificate_file_ids uuid[] not null default '{}',
  module_tags text[] not null default array['Quality']::text[],
  notes text null,
  failure_notes text null,
  action_required boolean not null default false,
  linked_ncr_id uuid null references public.quality_ncrs(id) on delete set null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, sr_no),
  check (array_length(module_tags, 1) >= 1),
  check (module_tags <@ array['Quality', 'Health', 'Safety', 'Environment', 'General']::text[])
);

create index if not exists idx_calibration_records_company_calibration_date
  on public.calibration_records(company_id, calibration_date desc);
create index if not exists idx_calibration_records_company_next_date
  on public.calibration_records(company_id, next_calibration_date asc);
create index if not exists idx_calibration_records_company_criticality
  on public.calibration_records(company_id, criticality);
create index if not exists idx_calibration_records_company_status
  on public.calibration_records(company_id, equipment_status);
create index if not exists idx_calibration_records_company_result
  on public.calibration_records(company_id, result);
create index if not exists idx_calibration_records_company_responsible
  on public.calibration_records(company_id, responsible_user_id);
create index if not exists idx_calibration_records_company_module_tags
  on public.calibration_records using gin(module_tags);

create table if not exists public.calibration_reminder_sent (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  calibration_record_id uuid not null references public.calibration_records(id) on delete cascade,
  reminder_type text not null,
  reminder_key text not null,
  sent_at timestamptz not null default now(),
  unique (company_id, calibration_record_id, reminder_key)
);

create index if not exists idx_calibration_reminder_sent_record
  on public.calibration_reminder_sent(calibration_record_id);

create or replace function public.calibration_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_calibration_records_set_updated_at on public.calibration_records;
create trigger trg_calibration_records_set_updated_at
before update on public.calibration_records
for each row execute function public.calibration_set_updated_at();

create or replace function public.can_access_calibration_scope(
  p_company_id uuid,
  p_site_id uuid,
  p_department_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_scope_site uuid;
  v_scope_department uuid;
begin
  if public.is_platform_admin() then
    return true;
  end if;

  v_role := public.company_role(p_company_id);

  if v_role in ('owner', 'admin') then
    return true;
  end if;

  if v_role in ('manager', 'supervisor') then
    select m.site_id, m.department_id
    into v_scope_site, v_scope_department
    from public.company_memberships m
    where m.company_id = p_company_id
      and m.user_id = public.request_user_id()
      and m.status = 'ACTIVE'
    order by m.created_at desc
    limit 1;

    if v_scope_site is null and v_scope_department is null then
      return true;
    end if;

    return (
      (v_scope_site is not null and p_site_id = v_scope_site)
      or (v_scope_department is not null and p_department_id = v_scope_department)
    );
  end if;

  if v_role in ('consultant', 'auditor') then
    return true;
  end if;

  return false;
end;
$$;

grant execute on function public.can_access_calibration_scope(uuid, uuid, uuid) to authenticated;

alter table public.calibration_record_counter enable row level security;
alter table public.calibration_records enable row level security;
alter table public.calibration_reminder_sent enable row level security;

drop policy if exists calibration_record_counter_select_policy on public.calibration_record_counter;
create policy calibration_record_counter_select_policy on public.calibration_record_counter
for select
using (
  public.is_platform_admin()
  or public.company_role(company_id) in ('owner', 'admin', 'manager', 'supervisor')
);

drop policy if exists calibration_record_counter_write_policy on public.calibration_record_counter;
create policy calibration_record_counter_write_policy on public.calibration_record_counter
for all
using (
  public.is_platform_admin()
  or public.company_role(company_id) in ('admin', 'manager', 'supervisor')
)
with check (
  public.is_platform_admin()
  or public.company_role(company_id) in ('admin', 'manager', 'supervisor')
);

drop policy if exists calibration_records_select_policy on public.calibration_records;
create policy calibration_records_select_policy on public.calibration_records
for select
using (
  public.is_platform_admin()
  or (
    public.company_role(company_id) in ('owner', 'admin', 'manager', 'supervisor')
    and public.can_access_calibration_scope(company_id, site_id, department_id)
  )
  or public.company_role(company_id) in ('consultant', 'auditor')
  or (public.company_role(company_id) = 'employee' and responsible_user_id = public.request_user_id())
);

drop policy if exists calibration_records_insert_policy on public.calibration_records;
create policy calibration_records_insert_policy on public.calibration_records
for insert
with check (
  public.is_platform_admin()
  or (
    public.company_role(company_id) in ('admin', 'manager', 'supervisor')
    and public.can_access_calibration_scope(company_id, site_id, department_id)
  )
);

drop policy if exists calibration_records_update_policy on public.calibration_records;
create policy calibration_records_update_policy on public.calibration_records
for update
using (
  public.is_platform_admin()
  or (
    public.company_role(company_id) in ('admin', 'manager', 'supervisor')
    and public.can_access_calibration_scope(company_id, site_id, department_id)
  )
)
with check (
  public.is_platform_admin()
  or (
    public.company_role(company_id) in ('admin', 'manager', 'supervisor')
    and public.can_access_calibration_scope(company_id, site_id, department_id)
  )
);

drop policy if exists calibration_records_delete_policy on public.calibration_records;
create policy calibration_records_delete_policy on public.calibration_records
for delete
using (
  public.is_platform_admin()
  or public.company_role(company_id) = 'admin'
);

drop policy if exists calibration_reminder_sent_select_policy on public.calibration_reminder_sent;
create policy calibration_reminder_sent_select_policy on public.calibration_reminder_sent
for select
using (
  public.is_platform_admin() or public.is_company_member(company_id)
);

drop policy if exists calibration_reminder_sent_insert_policy on public.calibration_reminder_sent;
create policy calibration_reminder_sent_insert_policy on public.calibration_reminder_sent
for insert
with check (true);
