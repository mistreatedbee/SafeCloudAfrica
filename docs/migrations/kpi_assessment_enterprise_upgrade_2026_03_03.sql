-- KPI Assessment enterprise upgrade: terminology alignment, lifecycle, scoring, reporting, and audit controls
-- Date: 2026-03-03
-- Safe to run multiple times.

alter table public.kpi_assessments
  add column if not exists assessment_name text null;
alter table public.kpi_assessments
  add column if not exists achievement_percentage numeric(6,2) null;
alter table public.kpi_assessments
  add column if not exists employee_overall_performance_score numeric(6,2) null;
alter table public.kpi_assessments
  add column if not exists weighted_score_total numeric(10,2) null;

update public.kpi_assessments
set assessment_name = coalesce(
  nullif(trim(assessment_name), ''),
  concat('KPI Assessment - ', coalesce(employee_name_snapshot, project_name, 'General'), ' (', period_type, ')')
)
where assessment_name is null or trim(assessment_name) = '';

-- Legacy lifecycle mapping for backward compatibility.
update public.kpi_assessments set status = 'in_progress' where status = 'submitted';
update public.kpi_assessments set status = 'completed' where status = 'finalized';

-- Replace legacy status check constraint with enterprise lifecycle values.
do $$
declare
  rec record;
begin
  for rec in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'kpi_assessments'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
  loop
    execute format('alter table public.kpi_assessments drop constraint if exists %I', rec.conname);
  end loop;
end $$;

alter table public.kpi_assessments
  add constraint kpi_assessments_status_check
  check (status in ('draft', 'in_progress', 'under_review', 'completed', 'closed'));

alter table public.kpi_assessment_lines
  add column if not exists kpi_questionnaire text null;
alter table public.kpi_assessment_lines
  add column if not exists achievement_status text null;
alter table public.kpi_assessment_lines
  add column if not exists weighted_score numeric(10,2) null;

update public.kpi_assessment_lines
set kpi_questionnaire = coalesce(nullif(trim(kpi_questionnaire), ''), kpi_title)
where kpi_questionnaire is null or trim(kpi_questionnaire) = '';

-- Keep legacy and new naming aligned.
update public.kpi_assessment_lines
set kpi_title = kpi_questionnaire
where kpi_questionnaire is not null
  and trim(kpi_questionnaire) <> ''
  and coalesce(kpi_title, '') <> kpi_questionnaire;

-- Auto-calculate achievement fields from manager rating only.
create or replace function public.kpi_assessment_questionnaire_rating_fn()
returns trigger
language plpgsql
as $$
declare
  v_weight numeric;
begin
  new.kpi_questionnaire := coalesce(nullif(trim(new.kpi_questionnaire), ''), new.kpi_title);
  new.kpi_title := new.kpi_questionnaire;

  v_weight := case new.importance_rating
    when 'high' then 2
    when 'medium' then 1.5
    else 1
  end;

  if new.manager_rating is null then
    new.not_achieved := null;
    new.achieved := null;
    new.achievement_status := null;
    new.weighted_score := null;
  elsif new.manager_rating <= 2 then
    new.not_achieved := true;
    new.achieved := false;
    new.achievement_status := 'not_achieved';
    new.weighted_score := round((new.manager_rating::numeric * v_weight)::numeric, 2);
  elsif new.manager_rating = 3 then
    new.not_achieved := false;
    new.achieved := false;
    new.achievement_status := 'partially_achieved';
    new.weighted_score := round((new.manager_rating::numeric * v_weight)::numeric, 2);
  else
    new.not_achieved := false;
    new.achieved := true;
    new.achievement_status := 'achieved';
    new.weighted_score := round((new.manager_rating::numeric * v_weight)::numeric, 2);
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists kpi_assessment_questionnaire_rating_trigger on public.kpi_assessment_lines;
create trigger kpi_assessment_questionnaire_rating_trigger
before insert or update of manager_rating, importance_rating, achieved, not_achieved, kpi_questionnaire, kpi_title
on public.kpi_assessment_lines
for each row execute function public.kpi_assessment_questionnaire_rating_fn();

-- Backfill derived fields.
update public.kpi_assessment_lines
set manager_rating = manager_rating;

-- Guard: assessment cannot be closed unless all manager ratings are captured.
create or replace function public.kpi_assessment_require_ratings_before_close_fn()
returns trigger
language plpgsql
as $$
declare
  v_missing integer;
begin
  if new.status = 'closed' and old.status is distinct from new.status then
    select count(*) into v_missing
    from public.kpi_assessment_lines l
    where l.assessment_id = new.assessment_id
      and l.manager_rating is null;

    if v_missing > 0 then
      raise exception 'Manager rating is required for all KPI Questionnaires before closing assessment.';
    end if;
  end if;

  if new.status in ('completed', 'closed') and old.status is distinct from new.status then
    select count(*) into v_missing
    from public.kpi_assessment_lines l
    where l.assessment_id = new.assessment_id
      and l.manager_rating is null;

    if v_missing > 0 then
      raise exception 'Manager rating is required for all KPI Questionnaires before completing assessment.';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists kpi_assessment_require_ratings_before_close_trigger on public.kpi_assessments;
create trigger kpi_assessment_require_ratings_before_close_trigger
before update of status on public.kpi_assessments
for each row execute function public.kpi_assessment_require_ratings_before_close_fn();

create table if not exists public.kpi_assessment_audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.companies(id) on delete cascade,
  assessment_id uuid not null references public.kpi_assessments(assessment_id) on delete cascade,
  line_id uuid null references public.kpi_assessment_lines(line_id) on delete cascade,
  event_type text not null,
  old_values jsonb null,
  new_values jsonb null,
  actor_user_id uuid null,
  created_at timestamptz not null default now()
);

create index if not exists idx_kpi_assessment_audit_org on public.kpi_assessment_audit_log(organization_id, created_at desc);
create index if not exists idx_kpi_assessment_audit_assessment on public.kpi_assessment_audit_log(assessment_id, created_at desc);
create index if not exists idx_kpi_assessment_audit_line on public.kpi_assessment_audit_log(line_id, created_at desc);

create or replace function public.kpi_assessment_audit_assessment_fn()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.kpi_assessment_audit_log(organization_id, assessment_id, event_type, old_values, new_values, actor_user_id)
    values (new.organization_id, new.assessment_id, 'assessment_insert', null, to_jsonb(new), public.request_user_id());
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.kpi_assessment_audit_log(organization_id, assessment_id, event_type, old_values, new_values, actor_user_id)
    values (new.organization_id, new.assessment_id, 'assessment_update', to_jsonb(old), to_jsonb(new), public.request_user_id());
    return new;
  else
    insert into public.kpi_assessment_audit_log(organization_id, assessment_id, event_type, old_values, new_values, actor_user_id)
    values (old.organization_id, old.assessment_id, 'assessment_delete', to_jsonb(old), null, public.request_user_id());
    return old;
  end if;
end;
$$;

create or replace function public.kpi_assessment_audit_line_fn()
returns trigger
language plpgsql
as $$
declare
  v_org uuid;
  v_assessment uuid;
begin
  if tg_op = 'DELETE' then
    v_assessment := old.assessment_id;
  else
    v_assessment := new.assessment_id;
  end if;

  select a.organization_id into v_org
  from public.kpi_assessments a
  where a.assessment_id = v_assessment;

  if v_org is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    insert into public.kpi_assessment_audit_log(organization_id, assessment_id, line_id, event_type, old_values, new_values, actor_user_id)
    values (v_org, new.assessment_id, new.line_id, 'questionnaire_insert', null, to_jsonb(new), public.request_user_id());
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.kpi_assessment_audit_log(organization_id, assessment_id, line_id, event_type, old_values, new_values, actor_user_id)
    values (v_org, new.assessment_id, new.line_id, 'questionnaire_update', to_jsonb(old), to_jsonb(new), public.request_user_id());
    return new;
  else
    insert into public.kpi_assessment_audit_log(organization_id, assessment_id, line_id, event_type, old_values, new_values, actor_user_id)
    values (v_org, old.assessment_id, old.line_id, 'questionnaire_delete', to_jsonb(old), null, public.request_user_id());
    return old;
  end if;
end;
$$;

drop trigger if exists trg_kpi_assessment_audit_assessment on public.kpi_assessments;
create trigger trg_kpi_assessment_audit_assessment
after insert or update or delete on public.kpi_assessments
for each row execute function public.kpi_assessment_audit_assessment_fn();

drop trigger if exists trg_kpi_assessment_audit_line on public.kpi_assessment_lines;
create trigger trg_kpi_assessment_audit_line
after insert or update or delete on public.kpi_assessment_lines
for each row execute function public.kpi_assessment_audit_line_fn();

alter table public.kpi_assessment_audit_log enable row level security;
drop policy if exists kpi_assessment_audit_log_all on public.kpi_assessment_audit_log;
create policy kpi_assessment_audit_log_all on public.kpi_assessment_audit_log for all
using (
  public.is_platform_admin()
  or public.company_role(organization_id) in ('owner', 'admin', 'manager', 'supervisor')
)
with check (
  public.is_platform_admin()
  or public.company_role(organization_id) in ('owner', 'admin', 'manager', 'supervisor')
);

-- Reporting views
create or replace view public.v_kpi_individual_history as
select
  a.organization_id,
  a.assessment_id,
  a.assessment_name,
  a.employee_id,
  a.employee_name_snapshot,
  a.manager_id,
  a.manager_name_snapshot,
  a.department_id,
  a.period_type,
  a.period_start_date,
  a.period_end_date,
  a.status,
  a.overall_score,
  a.achievement_percentage,
  l.line_id,
  l.kpi_questionnaire,
  l.importance_rating,
  l.manager_rating,
  l.achievement_status,
  l.weighted_score,
  l.updated_at as line_updated_at
from public.kpi_assessments a
left join public.kpi_assessment_lines l on l.assessment_id = a.assessment_id;

create or replace view public.v_kpi_department_trends as
select
  a.organization_id,
  a.department_id,
  a.period_type,
  date_trunc('month', a.period_start_date::timestamp)::date as period_month,
  count(*) as assessment_count,
  round(avg(a.overall_score)::numeric, 2) as avg_overall_score,
  round(avg(a.achievement_percentage)::numeric, 2) as avg_achievement_percentage
from public.kpi_assessments a
group by a.organization_id, a.department_id, a.period_type, date_trunc('month', a.period_start_date::timestamp)::date;

create or replace view public.v_kpi_achieved_vs_not_achieved as
select
  a.organization_id,
  a.department_id,
  a.period_type,
  date_trunc('month', a.period_start_date::timestamp)::date as period_month,
  count(*) filter (where l.manager_rating >= 4) as achieved_count,
  count(*) filter (where l.manager_rating = 3) as partially_achieved_count,
  count(*) filter (where l.manager_rating <= 2 and l.manager_rating is not null) as not_achieved_count
from public.kpi_assessments a
join public.kpi_assessment_lines l on l.assessment_id = a.assessment_id
group by a.organization_id, a.department_id, a.period_type, date_trunc('month', a.period_start_date::timestamp)::date;

create or replace view public.v_kpi_manager_rating_distribution as
select
  a.organization_id,
  a.manager_id,
  a.period_type,
  date_trunc('month', a.period_start_date::timestamp)::date as period_month,
  l.manager_rating,
  count(*) as rating_count
from public.kpi_assessments a
join public.kpi_assessment_lines l on l.assessment_id = a.assessment_id
where l.manager_rating is not null
group by a.organization_id, a.manager_id, a.period_type, date_trunc('month', a.period_start_date::timestamp)::date, l.manager_rating;

create or replace view public.v_kpi_period_comparison as
select
  organization_id,
  period_type,
  count(*) as assessment_count,
  round(avg(overall_score)::numeric, 2) as avg_overall_score,
  round(avg(achievement_percentage)::numeric, 2) as avg_achievement_percentage
from public.kpi_assessments
group by organization_id, period_type;

-- Backward-compatible naming view for API/report consumers.
create or replace view public.kpi_assessment_questionnaires as
select
  line_id as questionnaire_id,
  assessment_id,
  kpi_item_id,
  coalesce(kpi_questionnaire, kpi_title) as kpi_questionnaire,
  importance_rating,
  employee_own_rating,
  manager_rating,
  achievement_status,
  weighted_score,
  achieved,
  not_achieved,
  notes,
  finding_generated,
  finding_id,
  created_at,
  updated_at
from public.kpi_assessment_lines;
