-- Add a decline path to hr_ack_receipts for client testing fixes (2026-07-01).
--
-- Employees can currently only Acknowledge/Sign a policy document; there is no
-- way to decline with a reason. Add 'DECLINED' to the status check constraint
-- and a nullable decline_reason column to capture why.
--
-- Run via InsForge dashboard or CLI `db query` before deploying the client update.

alter table public.hr_ack_receipts
  drop constraint if exists hr_ack_receipts_status_check;

alter table public.hr_ack_receipts
  add constraint hr_ack_receipts_status_check
  check (status in ('PENDING', 'ACKNOWLEDGED', 'SIGNED', 'DECLINED'));

alter table public.hr_ack_receipts
  add column if not exists decline_reason text null;
