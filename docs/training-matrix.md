# Training Matrix (Job-Linked) – Fields, Auto-Population, Reminders

## Overview

Training is linked to **Job Descriptions** so the system can auto-populate which training each employee requires. Employees are linked to positions via `user_profiles.job_description_id`.

## Data model (summary)

- **job_descriptions** – Positions (e.g. Safety Officer, Operator). Optional link to department.
- **training_courses** – Course catalog: name, unit standard, credits, default frequency/validity (months).
- **training_providers** – Internal/External providers; optional contact info.
- **course_provider_prices** – Price per course per provider (ZAR).
- **job_training_requirements** – Matrix: which courses are required for which job; frequency override and mandatory flag.
- **user_profiles** – Extended with `job_description_id`, `employee_number`, `supervisor_user_id`.
- **training_records** – Per-employee, per-course assignment: status, arranged date, completed date, certificate, cost, expiry. Evolves from “record” to full lifecycle (REQUIRED → SCHEDULED → COMPLETED → EXPIRED/OVERDUE).

## Status rules

- **REQUIRED** – Assigned but no arranged date.
- **SCHEDULED** – Arranged date set, not completed.
- **COMPLETED** – Completed date set and **certificate upload required** (enforced in DB and API).
- **EXPIRED** – Expiry date passed and not renewed.
- **OVERDUE** – Arranged date passed but not completed (or required past due).

Re-training: when a record is COMPLETED, set `expires_at` from course default or manual entry. When the cron detects expired training, the preferred approach is to **create a new** `training_records` row with status REQUIRED for the same user+course (clear history of completions). Alternatively the same row can be reset to REQUIRED and cleared; the implementation uses the “new row” approach for a clear audit trail.

## Auto-population

When an employee is assigned to a job description (`user_profiles.job_description_id` set or changed):

1. Load all **job_training_requirements** for that `job_description_id`.
2. For each required course, create a **training_records** row for that user+course if one does not already exist (status REQUIRED, no arranged/completed date, no certificate).
3. “Already exists” means: same company, user, and course with status in REQUIRED, SCHEDULED, or COMPLETED.
4. When the employee’s job description **changes**, new requirements for the new job are added; **historic** assignments are not deleted.

Trigger: app layer in `profilesService` (when updating `job_description_id` in `updateUserProfile` or `upsertUserProfileAsManager`) calls `syncTrainingRequirementsForUser(userId, companyId)` from `trainingService`.

## Reminder logic

- **Expiry reminders** (in-app + email, respecting user notification settings):
  - 30 days before expiry
  - 14 days before expiry
  - 7 days before expiry
  - Day of expiry
  Dedupe: one notification per record per window, using `training_reminder_sent` (training_record_id, reminder_type e.g. `expiry_30`, `expiry_14`, `expiry_7`, `expiry_0`).

- **Outstanding training**:
  - Records with status REQUIRED or OVERDUE, or SCHEDULED with `arranged_at` in the past.
  - One “outstanding” reminder per record (reminder_type `outstanding`), then deduped via `training_reminder_sent`.

- **Escalation**:
  - After notifying the employee, the cron notifies the **supervisor** (`user_profiles.supervisor_user_id`) and one **company admin** (from escalation chain) with a short message that the employee has training expiring or overdue.

Cron: `scripts/insforge-functions/cronDailyComplianceReminders.js` (run daily). Requires migration `training_reminder_sent` for dedupe; if the table is missing, reminders still run but without dedupe.

## Permissions

- **Owner/Admin** – Full access to matrix setup, reports, and cost data.
- **Supervisor** – Can manage employee training (schedule, mark completed); scope can be restricted to their team when department/supervisor structure is used.
- **Employee** – Own training only (and own certificates); “My Training” tab.
- **Consultant/Auditor** – Read-only where allowed by company role.

All data is scoped by `company_id` (tenant isolation).
