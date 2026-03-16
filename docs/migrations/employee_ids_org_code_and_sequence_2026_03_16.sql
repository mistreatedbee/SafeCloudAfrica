-- Employee IDs / User Reference IDs
-- Date: 2026-03-16
-- Goal: generate permanent, org-scoped, human-friendly Employee IDs for every org user.
-- Format: ORGCODE-ROLECODE-0001 (shared per-org sequence; role code derived from membership.role)
-- Storage: public.user_profiles.employee_number (canonical Employee ID)
-- Safe to run multiple times (idempotent where possible).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) companies.code
-- ---------------------------------------------------------------------------
alter table public.companies
  add column if not exists code text null;

-- Enforce 2-5 chars, uppercase, alnum only (if provided)
alter table public.companies drop constraint if exists companies_code_format_check;
alter table public.companies
  add constraint companies_code_format_check
  check (
    code is null
    or (
      length(code) between 2 and 5
      and code = upper(code)
      and code ~ '^[A-Z0-9]+$'
    )
  );

create unique index if not exists idx_companies_code_unique
  on public.companies(code)
  where code is not null;

-- ---------------------------------------------------------------------------
-- 2) Helper: derive & ensure unique company code
-- ---------------------------------------------------------------------------
create or replace function public.derive_company_code(p_name text)
returns text
language plpgsql
immutable
as $$
declare
  v_name text;
  v_code text;
  v_word text;
begin
  v_name := coalesce(nullif(trim(p_name), ''), '');
  if v_name = '' then
    return 'ORG';
  end if;

  -- Build initials from words, fallback to first 5 alnum chars
  v_code := '';
  for v_word in
    select regexp_replace(w, '[^a-zA-Z0-9]+', '', 'g') as w
    from regexp_split_to_table(v_name, '\s+') as w
  loop
    if v_word is null or v_word = '' then
      continue;
    end if;
    v_code := v_code || upper(substr(v_word, 1, 1));
    if length(v_code) >= 5 then
      exit;
    end if;
  end loop;

  if v_code = '' then
    v_code := upper(substr(regexp_replace(v_name, '[^a-zA-Z0-9]+', '', 'g'), 1, 5));
  end if;

  if length(v_code) < 2 then
    v_code := rpad(v_code, 2, 'X');
  end if;

  if length(v_code) > 5 then
    v_code := substr(v_code, 1, 5);
  end if;

  return v_code;
end;
$$;

create or replace function public.ensure_company_code(p_company_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing text;
  v_name text;
  v_base text;
  v_candidate text;
  v_suffix int;
begin
  select c.code, c.name into v_existing, v_name
  from public.companies c
  where c.id = p_company_id;

  if v_existing is not null and nullif(trim(v_existing), '') is not null then
    return v_existing;
  end if;

  v_base := public.derive_company_code(v_name);
  v_candidate := v_base;

  -- Try to reserve a unique code. Limit suffix attempts to prevent infinite loops.
  v_suffix := 2;
  loop
    begin
      update public.companies
      set code = v_candidate
      where id = p_company_id
        and (code is null or nullif(trim(code), '') is null);

      -- If we updated and the candidate is unique, return it.
      select code into v_existing from public.companies where id = p_company_id;
      if v_existing is not null then
        return v_existing;
      end if;
    exception when unique_violation then
      -- collision on companies.code unique index; try another
      null;
    end;

    if v_suffix > 99 then
      -- last resort (still human readable enough)
      v_candidate := substr(v_base, 1, greatest(2, 5 - length('99'))) || '99';
      begin
        update public.companies set code = v_candidate where id = p_company_id and (code is null or nullif(trim(code), '') is null);
        select code into v_existing from public.companies where id = p_company_id;
        if v_existing is not null then
          return v_existing;
        end if;
      exception when unique_violation then
        -- fall through
        null;
      end;
      raise exception 'Could not generate unique organization code for company_id=%', p_company_id;
    end if;

    -- Build code with numeric suffix, respecting max length 5
    v_candidate := substr(v_base, 1, greatest(2, 5 - length(v_suffix::text))) || v_suffix::text;
    v_suffix := v_suffix + 1;
  end loop;
end;
$$;

grant execute on function public.ensure_company_code(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Sequence table + generator
-- ---------------------------------------------------------------------------
create table if not exists public.company_user_sequences (
  company_id uuid primary key references public.companies(id) on delete cascade,
  last_sequence integer not null default 0,
  updated_at timestamptz not null default now()
);

create or replace function public.role_code(p_role text)
returns text
language sql
immutable
as $$
  select case lower(coalesce(nullif(trim(p_role), ''), 'employee'))
    when 'owner' then 'OWN'
    when 'admin' then 'ADM'
    when 'manager' then 'MGR'
    when 'supervisor' then 'SUP'
    when 'employee' then 'EMP'
    when 'consultant' then 'CON'
    when 'auditor' then 'AUD'
    else 'USR'
  end;
$$;

create or replace function public.generate_employee_number(p_company_id uuid, p_role text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_role_code text;
  v_next integer;
  v_emp text;
begin
  v_code := public.ensure_company_code(p_company_id);
  v_role_code := public.role_code(p_role);

  insert into public.company_user_sequences(company_id, last_sequence)
  values (p_company_id, 0)
  on conflict (company_id) do nothing;

  -- Lock sequence row for concurrency safety
  select last_sequence into v_next
  from public.company_user_sequences
  where company_id = p_company_id
  for update;

  v_next := coalesce(v_next, 0) + 1;

  update public.company_user_sequences
  set last_sequence = v_next,
      updated_at = now()
  where company_id = p_company_id;

  v_emp := v_code || '-' || v_role_code || '-' || lpad(v_next::text, 4, '0');
  return v_emp;
end;
$$;

grant execute on function public.generate_employee_number(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Ensure user_profiles.employee_number exists + enforce uniqueness per company
-- ---------------------------------------------------------------------------
alter table public.user_profiles
  add column if not exists employee_number text null;

create unique index if not exists idx_user_profiles_company_employee_number_unique
  on public.user_profiles(company_id, employee_number)
  where employee_number is not null;

create index if not exists idx_user_profiles_company_employee_number
  on public.user_profiles(company_id, employee_number);

-- ---------------------------------------------------------------------------
-- 5) Trigger: assign employee_number when membership becomes ACTIVE
-- ---------------------------------------------------------------------------
create or replace function public.trg_assign_employee_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_profile_id uuid;
  v_existing text;
  v_new_emp text;
begin
  v_status := upper(coalesce(nullif(trim(new.status), ''), 'ACTIVE'));
  if v_status <> 'ACTIVE' then
    return new;
  end if;

  -- Ensure profile row exists
  insert into public.user_profiles(company_id, user_id, created_at, updated_at)
  values (new.company_id, new.user_id, now(), now())
  on conflict (company_id, user_id) do update
    set updated_at = excluded.updated_at;

  select id, employee_number into v_profile_id, v_existing
  from public.user_profiles
  where company_id = new.company_id and user_id = new.user_id
  limit 1;

  if v_existing is null or nullif(trim(v_existing), '') is null then
    v_new_emp := public.generate_employee_number(new.company_id, new.role);
    update public.user_profiles
    set employee_number = v_new_emp,
        updated_at = now()
    where company_id = new.company_id and user_id = new.user_id
      and (employee_number is null or nullif(trim(employee_number), '') is null);

    -- Audit trail
    insert into public.activity_logs(company_id, actor_user_id, action, entity_type, entity_id, metadata, created_at)
    values (
      new.company_id,
      coalesce(public.request_user_id(), new.user_id),
      'employee_id.generated',
      'user_profile',
      v_profile_id,
      jsonb_build_object(
        'employee_number', v_new_emp,
        'role', new.role,
        'user_id', new.user_id
      ),
      now()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_company_memberships_assign_employee_number on public.company_memberships;
create trigger trg_company_memberships_assign_employee_number
after insert on public.company_memberships
for each row execute function public.trg_assign_employee_number();

-- Also handle status transitions to ACTIVE (invite -> active, reactivation, etc.)
drop trigger if exists trg_company_memberships_assign_employee_number_on_update on public.company_memberships;
create trigger trg_company_memberships_assign_employee_number_on_update
after update of status on public.company_memberships
for each row
when (coalesce(nullif(trim(old.status), ''), 'ACTIVE') <> 'ACTIVE' and coalesce(nullif(trim(new.status), ''), 'ACTIVE') = 'ACTIVE')
execute function public.trg_assign_employee_number();

-- ---------------------------------------------------------------------------
-- 6) Admin override RPC (optional): update employee_number with audit
-- ---------------------------------------------------------------------------
create or replace function public.admin_update_employee_number(p_company_id uuid, p_user_id uuid, p_new text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new text;
  v_old text;
  v_profile_id uuid;
  v_role text;
begin
  if not (public.is_company_manager(p_company_id) or public.is_platform_admin()) then
    raise exception 'PERMISSION_DENIED';
  end if;

  v_new := upper(coalesce(nullif(trim(p_new), ''), ''));
  if v_new = '' then
    raise exception 'INVALID_EMPLOYEE_ID';
  end if;

  -- Must match ORG-ROLE-0001 style (org 2-5, role 2-3, seq 4)
  if v_new !~ '^[A-Z0-9]{2,5}-[A-Z]{2,3}-[0-9]{4}$' then
    raise exception 'INVALID_EMPLOYEE_ID_FORMAT';
  end if;

  -- Ensure profile exists
  insert into public.user_profiles(company_id, user_id, created_at, updated_at)
  values (p_company_id, p_user_id, now(), now())
  on conflict (company_id, user_id) do update set updated_at = excluded.updated_at;

  select id, employee_number into v_profile_id, v_old
  from public.user_profiles
  where company_id = p_company_id and user_id = p_user_id
  limit 1;

  update public.user_profiles
  set employee_number = v_new,
      updated_at = now()
  where company_id = p_company_id and user_id = p_user_id;

  select role into v_role
  from public.company_memberships
  where company_id = p_company_id and user_id = p_user_id
  limit 1;

  insert into public.activity_logs(company_id, actor_user_id, action, entity_type, entity_id, metadata, created_at)
  values (
    p_company_id,
    public.request_user_id(),
    'employee_id.changed',
    'user_profile',
    v_profile_id,
    jsonb_build_object(
      'old', v_old,
      'new', v_new,
      'user_id', p_user_id,
      'role', v_role
    ),
    now()
  );

  return v_new;
end;
$$;

grant execute on function public.admin_update_employee_number(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Backfill existing users (idempotent)
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_emp text;
begin
  for r in
    select m.company_id, m.user_id, m.role
    from public.company_memberships m
    where upper(coalesce(nullif(trim(m.status), ''), 'ACTIVE')) = 'ACTIVE'
  loop
    -- Ensure profile row exists
    insert into public.user_profiles(company_id, user_id, created_at, updated_at)
    values (r.company_id, r.user_id, now(), now())
    on conflict (company_id, user_id) do update set updated_at = excluded.updated_at;

    if exists (
      select 1 from public.user_profiles p
      where p.company_id = r.company_id and p.user_id = r.user_id
        and (p.employee_number is null or nullif(trim(p.employee_number), '') is null)
    ) then
      v_emp := public.generate_employee_number(r.company_id, r.role);
      update public.user_profiles
      set employee_number = v_emp,
          updated_at = now()
      where company_id = r.company_id and user_id = r.user_id
        and (employee_number is null or nullif(trim(employee_number), '') is null);

      insert into public.activity_logs(company_id, actor_user_id, action, entity_type, entity_id, metadata, created_at)
      select
        r.company_id,
        coalesce(public.request_user_id(), r.user_id),
        'employee_id.backfill',
        'user_profile',
        p.id,
        jsonb_build_object(
          'employee_number', v_emp,
          'role', r.role,
          'user_id', r.user_id
        ),
        now()
      from public.user_profiles p
      where p.company_id = r.company_id and p.user_id = r.user_id
      limit 1;
    end if;
  end loop;
end $$;

