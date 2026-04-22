-- User profile avatar support
-- 2026-04-22

alter table if exists public.user_profiles
  add column if not exists avatar_bucket text null;

alter table if exists public.user_profiles
  add column if not exists avatar_key text null;
