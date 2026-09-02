alter table public.calibration_records
  add column if not exists calibration_provider text null;

notify pgrst, 'reload schema';
