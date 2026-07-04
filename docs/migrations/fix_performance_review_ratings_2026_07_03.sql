-- Fix hr_performance_reviews rating columns for client testing fixes (2026-07-01).
--
-- overall_rating and manager_rating were defined as `integer`, but the UI now
-- computes overall rating as an average of two other averages rounded to one
-- decimal place (e.g. 3.5) instead of collecting a single top-level 1-5
-- manager input. Widen both columns to numeric(3,1) so the computed value can
-- be stored precisely instead of being silently rounded/coerced to an integer.
--
-- Run via InsForge dashboard or CLI `db query` before deploying the client update.

alter table public.hr_performance_reviews
  alter column overall_rating type numeric(3,1) using overall_rating::numeric(3,1);

alter table public.hr_performance_reviews
  drop constraint if exists hr_performance_reviews_overall_rating_check;

alter table public.hr_performance_reviews
  add constraint hr_performance_reviews_overall_rating_check
  check (overall_rating is null or (overall_rating between 1 and 5));

alter table public.hr_performance_reviews
  alter column manager_rating type numeric(3,1) using manager_rating::numeric(3,1);

alter table public.hr_performance_reviews
  drop constraint if exists hr_performance_reviews_manager_rating_check;

alter table public.hr_performance_reviews
  add constraint hr_performance_reviews_manager_rating_check
  check (manager_rating is null or (manager_rating between 1 and 5));
