-- Consistent record numbers: PREFIX-YYYYMM-0001 (sequence per company per month).
-- NCR-, TSK-, INC-, PPE-, OBS- are (re)numbered for all records; DOC- only fills
-- documents that have no number, because document numbers can be typed in by users.
-- Runs as a single statement batch, so any error rolls the whole thing back.

-- Next free number for a company/prefix in a table's number column.
create or replace function public.next_record_number(p_table regclass, p_column text, p_company uuid, p_prefix text)
returns text
language plpgsql as $$
declare
  next_seq int;
begin
  -- Serialise per table+company so concurrent inserts can't get the same number.
  perform pg_advisory_xact_lock(hashtext(p_table::text || ':' || p_company::text));
  execute format(
    'select coalesce(max(substring(%1$I from %2$s)::int), 0) + 1 from %3$s where company_id = $1 and %1$I ~ $2',
    p_column, length(p_prefix) + 1, p_table
  ) into next_seq using p_company, '^' || p_prefix || '[0-9]+$';
  return p_prefix || lpad(next_seq::text, 4, '0');
end;
$$;

-- Trigger: args are (number column, prefix code, overwrite app-supplied value?).
create or replace function public.assign_record_number()
returns trigger
language plpgsql as $$
declare
  col text := tg_argv[0];
  code text := tg_argv[1];
  overwrite boolean := coalesce(tg_argv[2], 'false')::boolean;
  row_json jsonb := to_jsonb(new);
  current_value text := row_json ->> col;
  record_date timestamptz;
  prefix text;
begin
  if not overwrite and coalesce(current_value, '') <> '' then
    return new;
  end if;
  -- Not every table has created_at (ppe_issues records issued_at instead).
  record_date := coalesce((row_json ->> 'created_at')::timestamptz, (row_json ->> 'issued_at')::timestamptz, now());
  prefix := code || '-' || to_char(record_date, 'YYYYMM') || '-';
  new := jsonb_populate_record(
    new,
    jsonb_build_object(col, public.next_record_number(tg_relid::regclass, col, new.company_id, prefix))
  );
  return new;
end;
$$;

-- New number columns.
alter table public.tasks add column if not exists task_number text;
alter table public.incidents add column if not exists incident_number text;
alter table public.ppe_issues add column if not exists issue_number text;
alter table public.bbs_observations add column if not exists observation_number text;

-- Drop old uniqueness on NCR numbers (if any) before renumbering: numbers become unique
-- per company, so a database-wide unique rule on nc_number alone would now clash.
drop index if exists public.quality_ncrs_company_record_number_key;
do $$
declare
  r record;
  nc_attnum smallint := (select attnum from pg_attribute where attrelid = 'public.quality_ncrs'::regclass and attname = 'nc_number');
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.quality_ncrs'::regclass and contype = 'u' and conkey = array[nc_attnum]
  loop
    execute format('alter table public.quality_ncrs drop constraint %I', r.conname);
  end loop;
  for r in
    select c.relname from pg_index i join pg_class c on c.oid = i.indexrelid
    where i.indrelid = 'public.quality_ncrs'::regclass and i.indisunique and not i.indisprimary
      and i.indkey::smallint[] = array[nc_attnum]
  loop
    execute format('drop index public.%I', r.relname);
  end loop;
end;
$$;

-- Renumber / backfill in creation order.
with n as (
  select id, 'NCR-' || to_char(created_at, 'YYYYMM') || '-' ||
    lpad(row_number() over (partition by company_id, to_char(created_at, 'YYYYMM') order by created_at, id)::text, 4, '0') as num
  from public.quality_ncrs
)
update public.quality_ncrs t set nc_number = n.num from n where t.id = n.id;

with n as (
  select id, 'TSK-' || to_char(created_at, 'YYYYMM') || '-' ||
    lpad(row_number() over (partition by company_id, to_char(created_at, 'YYYYMM') order by created_at, id)::text, 4, '0') as num
  from public.tasks
)
update public.tasks t set task_number = n.num from n where t.id = n.id;

with n as (
  select id, 'INC-' || to_char(created_at, 'YYYYMM') || '-' ||
    lpad(row_number() over (partition by company_id, to_char(created_at, 'YYYYMM') order by created_at, id)::text, 4, '0') as num
  from public.incidents
)
update public.incidents t set incident_number = n.num from n where t.id = n.id;

with n as (
  select id, 'PPE-' || to_char(coalesce(issued_at, now()), 'YYYYMM') || '-' ||
    lpad(row_number() over (partition by company_id, to_char(coalesce(issued_at, now()), 'YYYYMM') order by issued_at, id)::text, 4, '0') as num
  from public.ppe_issues
)
update public.ppe_issues t set issue_number = n.num from n where t.id = n.id;

with n as (
  select id, 'OBS-' || to_char(created_at, 'YYYYMM') || '-' ||
    lpad(row_number() over (partition by company_id, to_char(created_at, 'YYYYMM') order by created_at, id)::text, 4, '0') as num
  from public.bbs_observations
)
update public.bbs_observations t set observation_number = n.num from n where t.id = n.id;

-- Documents: only those without a number.
with n as (
  select id, 'DOC-' || to_char(created_at, 'YYYYMM') || '-' ||
    lpad(row_number() over (partition by company_id, to_char(created_at, 'YYYYMM') order by created_at, id)::text, 4, '0') as num
  from public.documents
  where coalesce(document_number, '') = ''
)
update public.documents t set document_number = n.num from n where t.id = n.id;

-- Triggers for new records. NCR overwrites the app's own value so numbering stays sequential.
drop trigger if exists trg_record_number on public.quality_ncrs;
create trigger trg_record_number before insert on public.quality_ncrs
  for each row execute function public.assign_record_number('nc_number', 'NCR', 'true');

drop trigger if exists trg_record_number on public.tasks;
create trigger trg_record_number before insert on public.tasks
  for each row execute function public.assign_record_number('task_number', 'TSK');

drop trigger if exists trg_record_number on public.incidents;
create trigger trg_record_number before insert on public.incidents
  for each row execute function public.assign_record_number('incident_number', 'INC');

drop trigger if exists trg_record_number on public.ppe_issues;
create trigger trg_record_number before insert on public.ppe_issues
  for each row execute function public.assign_record_number('issue_number', 'PPE');

drop trigger if exists trg_record_number on public.bbs_observations;
create trigger trg_record_number before insert on public.bbs_observations
  for each row execute function public.assign_record_number('observation_number', 'OBS');

drop trigger if exists trg_record_number on public.documents;
create trigger trg_record_number before insert on public.documents
  for each row execute function public.assign_record_number('document_number', 'DOC');

-- Uniqueness (documents excluded: users may type their own numbers).
create unique index if not exists quality_ncrs_company_record_number_key on public.quality_ncrs (company_id, nc_number);
create unique index if not exists tasks_company_task_number_key on public.tasks (company_id, task_number);
create unique index if not exists incidents_company_incident_number_key on public.incidents (company_id, incident_number);
create unique index if not exists ppe_issues_company_issue_number_key on public.ppe_issues (company_id, issue_number);
create unique index if not exists bbs_observations_company_observation_number_key on public.bbs_observations (company_id, observation_number);

notify pgrst, 'reload schema';
