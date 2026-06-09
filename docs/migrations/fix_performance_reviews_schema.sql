-- Fix hr_performance_reviews schema for client compatibility.
--
-- 1. overall_rating was defined NOT NULL but the client omits it during creation
--    (computed later after manager review); make it nullable.
-- 2. kpa_rows JSONB column was added in final_feature_pass_2026_05_04.sql but
--    may not be present in all environments; add it idempotently.
--
-- Run via InsForge dashboard or MCP run-raw-sql before deploying the client update.

alter table public.hr_performance_reviews
  alter column overall_rating drop not null;

alter table public.hr_performance_reviews
  add column if not exists kpa_rows jsonb not null default '[]'::jsonb;
