# Risk assessments: review & event integration tests

This file documents manual test flows for the new baseline/task/critical/prework risk assessments, signatures, and review flags triggered by incidents/NCRs.

## 1. Schema and basic creation

1. In the database, confirm `risk_assessments` has:
   - `is_critical boolean`, `is_prework boolean`
   - `source_entity_type text`, `source_entity_id uuid`
   - `review_due_at timestamptz`
2. In the app, go to `/risks` and create a baseline and a task-based assessment.
3. Verify they appear in the list and detail views without errors.

## 2. Critical / prework flags and review_due_at

1. From the API (or future UI extension), create a risk assessment with:
   - `isCritical = true`, `isPrework = false`, and a `reviewDueAt` in the future.
2. Open `/risks`:
   - Confirm the assessment shows a **Critical** badge and a “Review due …” pill.
   - Toggle the “Critical only” and “Prework only” filters and confirm it appears only in the correct view.
3. Repeat with `isCritical = false`, `isPrework = true` and confirm the **Prework** badge appears.

## 3. Incident-triggered assessments

1. Go to `/incidents`, create an incident with severity **High** or **Critical**.
2. In the incident list, click **Create risk assessment** on that row.
3. Verify:
   - You are navigated to `/risks`.
   - A new task-based assessment exists with:
     - `source_entity_type = 'incident'`
     - `source_entity_id = <incident id>`
     - `is_critical = true` when severity is high/critical.
4. Back on `/incidents`, click **Flag linked assessments for review** for the same incident.
5. In the database (or via UI), confirm `review_due_at` is set on the linked assessments.

## 4. NCR-triggered assessments

1. Go to `/ncrs` and create an NCR with severity **High** or **Critical**.
2. In the NCR list, on the right-hand side of the card, click:
   - **Create linked risk assessment**
   - Confirm a baseline assessment is created and linked:
     - `source_entity_type = 'ncr'`
     - `source_entity_id = <ncr id>`
   - Confirm `is_critical` is true for high/critical NCRs.
3. Click **Flag assessments for review** for that NCR and verify the linked assessments have `review_due_at` populated.

## 5. Review dashboard

1. Navigate to `/risks/reviews`.
2. Confirm:
   - Only assessments with `review_due_at` set appear.
   - **Due today** shows items with `review_due_at` on the current date.
   - **Overdue** shows items with `review_due_at` before today.
   - **Next 30 days** shows upcoming reviews in the next 30 days.

## 6. Status changes and review flags

1. For an assessment with `review_due_at` set, change its status to **reviewed** or **approved** using the backend/API (or future UI).
2. When calling `updateRiskAssessmentStatus` with `clearReviewDueAt = true`, confirm:
   - `review_due_at` is cleared in the database.
   - The assessment disappears from `/risks/reviews` where appropriate.

