-- Migration: Add employee self-acknowledgement to personal HR documents
-- Date: 2026-05-25
-- Employees can tick "I acknowledge that I have read this document" on their own personal documents.
-- Policy/acknowledgement documents already use hr_ack_documents + hr_ack_receipts.
-- This adds a lightweight flag directly on hr_employee_documents for personal docs only.

alter table public.hr_employee_documents
  add column if not exists acknowledged_by_employee boolean not null default false,
  add column if not exists acknowledged_at timestamptz null;

comment on column public.hr_employee_documents.acknowledged_by_employee is
  'True when the employee has confirmed they have read this document via the self-service checkbox.';
comment on column public.hr_employee_documents.acknowledged_at is
  'Timestamp of the employee acknowledgement click. Null if not yet acknowledged.';
