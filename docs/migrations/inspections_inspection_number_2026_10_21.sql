-- Short, searchable inspection numbers: INS-YYYYMM-0001 (sequence per company per month).
alter table public.inspections add column if not exists inspection_number text;

-- Backfill existing inspections in creation order.
with numbered as (
  select id,
         'INS-' || to_char(created_at, 'YYYYMM') || '-' ||
         lpad(row_number() over (partition by company_id, to_char(created_at, 'YYYYMM') order by created_at, id)::text, 4, '0') as num
  from public.inspections
  where inspection_number is null
)
update public.inspections i set inspection_number = n.num from numbered n where i.id = n.id;

create or replace function public.set_inspection_number() returns trigger
language plpgsql as $$
declare
  prefix text := 'INS-' || to_char(coalesce(new.created_at, now()), 'YYYYMM') || '-';
  next_seq int;
begin
  if new.inspection_number is not null then
    return new;
  end if;
  -- Serialise numbering per company so concurrent inserts don't get the same number.
  perform pg_advisory_xact_lock(hashtext('inspection_number:' || new.company_id::text));
  select coalesce(max(substring(inspection_number from length(prefix) + 1)::int), 0) + 1
    into next_seq
    from public.inspections
    where company_id = new.company_id and inspection_number like prefix || '%';
  new.inspection_number := prefix || lpad(next_seq::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists trg_set_inspection_number on public.inspections;
create trigger trg_set_inspection_number
  before insert on public.inspections
  for each row execute function public.set_inspection_number();

create unique index if not exists inspections_company_inspection_number_key
  on public.inspections (company_id, inspection_number);

notify pgrst, 'reload schema';
