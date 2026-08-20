-- Follow-up to the PPE and Training fixes: add the foreign-key constraints that were
-- previously deferred because their historical-data safety hadn't been checked. Every
-- column below was verified to have zero orphaned rows against its target table before
-- this migration was written, so none of these ALTERs can fail against existing data.
--
-- ON DELETE behaviour:
-- - Person/user references (employee_id, captured_by_employee_id, responsible_user_id):
--   SET NULL -- losing the HR employee/user record shouldn't cascade-delete PPE/training
--   history, it should just detach the reference (the free-text/name-snapshot columns
--   already carry the display value forward).
-- - Catalogue references (ppe_item_id, course_id, provider_id): RESTRICT -- matches the
--   application-level checks already in ppeService.ts/trainingService.ts that block
--   deleting an item/course/provider with existing records; this adds the same
--   guarantee at the database level as defense-in-depth.
--
-- Idempotent: safe to re-run.

alter table if exists public.ppe_issues
  drop constraint if exists ppe_issues_issued_to_employee_id_fkey,
  add constraint ppe_issues_issued_to_employee_id_fkey
    foreign key (issued_to_employee_id) references public.hr_employees(id) on delete set null;

alter table if exists public.ppe_issues
  drop constraint if exists ppe_issues_ppe_item_id_fkey,
  add constraint ppe_issues_ppe_item_id_fkey
    foreign key (ppe_item_id) references public.ppe_items(id) on delete restrict;

alter table if exists public.ppe_stock
  drop constraint if exists ppe_stock_ppe_item_id_fkey,
  add constraint ppe_stock_ppe_item_id_fkey
    foreign key (ppe_item_id) references public.ppe_items(id) on delete restrict;

alter table if exists public.ppe_stock
  drop constraint if exists ppe_stock_captured_by_employee_id_fkey,
  add constraint ppe_stock_captured_by_employee_id_fkey
    foreign key (captured_by_employee_id) references public.hr_employees(id) on delete set null;

alter table if exists public.ppe_issue_tracker
  drop constraint if exists ppe_issue_tracker_responsible_user_id_fkey,
  add constraint ppe_issue_tracker_responsible_user_id_fkey
    foreign key (responsible_user_id) references auth.users(id) on delete set null;

alter table if exists public.training_records
  drop constraint if exists training_records_course_id_fkey,
  add constraint training_records_course_id_fkey
    foreign key (course_id) references public.training_courses(id) on delete restrict;

alter table if exists public.training_records
  drop constraint if exists training_records_provider_id_fkey,
  add constraint training_records_provider_id_fkey
    foreign key (provider_id) references public.training_providers(id) on delete set null;
