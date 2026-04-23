-- Notifications: add metadata jsonb column
-- 2026-04-23
-- Fixes PostgREST "Could not find the 'metadata' column of 'notifications' in the schema cache"
-- Safe to run multiple times.

alter table if exists public.notifications
  add column if not exists metadata jsonb not null default '{}'::jsonb;

