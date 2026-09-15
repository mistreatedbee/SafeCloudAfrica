-- Improvements: add a flat "comments" field on the record itself.
-- Apply date: 2026-09-15
--
-- The improvements table only ever had a separate improvement_comments
-- discussion-thread table (SECTION 6 on the detail page); there was no
-- single comments column on the record, so a "Comments" field on the
-- main form had nowhere to save to and nothing to display from.

alter table public.improvements
  add column if not exists comments text null;
