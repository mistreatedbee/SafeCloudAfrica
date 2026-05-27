-- Migration: HR supervisor employee relationship + multi-competency support
-- Date: 2026-05-27

-- 1. Add employee-to-employee supervisor reference (replaces supervisor_user_id for HR-only employees)
ALTER TABLE hr_employees
  ADD COLUMN IF NOT EXISTS supervisor_employee_id UUID REFERENCES hr_employees(id) ON DELETE SET NULL;

-- 2. Add multi-competency array to vacancies (keeps existing competency_required for backwards compat)
ALTER TABLE hr_vacancies
  ADD COLUMN IF NOT EXISTS competencies_required TEXT[] NOT NULL DEFAULT '{}';

-- RLS for both new columns is inherited from the existing table-level policies on
-- hr_employees and hr_vacancies — no additional policy changes required.
