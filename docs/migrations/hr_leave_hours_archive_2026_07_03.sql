-- Add archive support to Leave and Hours Worked for client testing fixes (2026-07-01).
--
-- Approved leave/timesheet records need to be archivable without deleting them
-- and without disturbing existing status-driven gating logic (status still
-- means SUBMITTED/APPROVED/DECLINED). A dedicated boolean keeps that separate,
-- mirroring the is_active pattern already used for Departments/Sites.
--
-- Run via InsForge dashboard or CLI `db query` before deploying the client update.

alter table public.hr_leave_requests
  add column if not exists archived boolean not null default false;

alter table public.hr_timesheets
  add column if not exists archived boolean not null default false;
