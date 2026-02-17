# Task Manager Module — Acceptance Test Scenarios

Use these flows for manual or automated QA of the Task Manager (Task Master Register).

## 1. Core lifecycle

- Create task → assign to employee → employee accepts → Mark In Progress → upload evidence → Submit for review → manager approves → set effectiveness check → Close task.
- Verify: activity timeline shows each step; time tracking updates; approvals section shows supervisor/manager approved; closure succeeds only after evidence + approvals + effectiveness check.

## 2. Auto-overdue

- Create a task with due date in the past (or run job with mocked today).
- Run `markOverdueTasks(companyId)` (e.g. via scheduled job or script).
- Check: task status = `overdue`, `time_status_indicator` = `overdue`, assignee/owner notified.

## 3. Reminders

- Create tasks with due dates 7 days and 3 days out.
- Run `sendTaskReminders(companyId)` with appropriate date.
- Verify: reminder notifications sent per schedule (7d, 3d, due day, overdue).

## 4. High-risk escalation

- Create task with `risk_level` = `high` or `critical`.
- Run escalation helper (or rely on job).
- Verify: notifications to assignee, task owner, and managers/admins.

## 5. Closure validation

- Try closing a CAPA/audit task **without** evidence or approvals.
- Expect: backend rejects with descriptive error.
- Add at least one evidence attachment, supervisor approval, manager approval, and effectiveness check.
- Close again: should succeed.

## 6. Auto-task creation hooks

- Create: NCR, inspection NC item (with corrective action), PPE issue (corrective action required), incident (investigation required or high severity), audit finding (nonconformance).
- Verify: a task is created with correct `source_entity_type` / `source_entity_id` and prefilled fields; link from task detail to source works.

## 7. Gantt and analytics

- Create several tasks with `category` = `project_task` and planned start/due dates.
- Open Tasks → Project Gantt: bars show planned window.
- Open Resource planning: department and assignee summaries match data.
- Open Time analytics: utilization and average closure time reflect closed tasks.

## 8. RBAC and scoping

- **Employee**: sees only own assigned tasks (My Tasks); can Accept, Start, log time, add comments; cannot Approve or Close.
- **Supervisor**: Team Tasks scoped to own department (department_id from profile); can Approve and Close.
- **Manager/Admin**: sees all team tasks; can create, assign, approve, close, set effectiveness check.
- **Auditor**: can perform auditor verification for audit-related tasks; appropriate approval actions visible.
- All task API calls are scoped by `company_id`; department filter applied for supervisor team view.

## 9. Exports

- Export CSV: full Task Master Register fields present (department/site, owner, assignee, planned/actual dates, time spent, delays, risk, status, time status, source, closure data).
- Export CAPA closure: only tasks with `category` = `capa` and status `closed` or `approved`; CAPA-specific columns included.
