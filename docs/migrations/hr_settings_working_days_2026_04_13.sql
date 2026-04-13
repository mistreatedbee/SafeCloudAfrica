alter table if exists public.hr_settings
  add column if not exists working_days text[] not null default array['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'hr_settings_working_days_allowed'
  ) then
    alter table public.hr_settings
      add constraint hr_settings_working_days_allowed
      check (
        working_days <@ array[
          'MONDAY',
          'TUESDAY',
          'WEDNESDAY',
          'THURSDAY',
          'FRIDAY',
          'SATURDAY',
          'SUNDAY'
        ]::text[]
      );
  end if;
end $$;
