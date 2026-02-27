CODEX / CURSOR PROMPT — IMPLEMENT “LEGAL REQUIREMENTS REGISTER” + “LEGAL UPDATE TRACKING”
(Use the uploaded spec “Legal Requirement19-02-2025.docx” as source of truth.) :contentReference[oaicite:0]{index=0}

GOAL
Implement a production-ready Legal Requirements module that lets each organization capture legal/standard requirements, track compliance status + evidence, and track updates/amendments to laws with deadlines and closure. Must integrate with Documents (DMS) for evidence linking and support multi-tenant org isolation + RBAC.

CONSTRAINTS
- Do NOT redesign branding/colors. Use existing UI patterns.
- Must save/load from backend. No mock data.
- Must enforce org isolation and role permissions.
- Add “dropdown with option to type manually” wherever needed.
- When done and verified, push changes to GitHub.

A) PAGES / ROUTES
1) Sidebar
- Add/confirm “Legal Register” or “Legal Requirements” under the Legal module.
- Route example: /dashboard/legal/register
- Ensure sidebar remains visible (no layout loss).

2) Legal Requirements Register (List Page)
- Table columns:
  - Requirement/Standard
  - Reference (Sections)
  - Applicability
  - Compliance Status (Non compliant / Partially compliant / Compliant)
  - Responsible Person
  - Last Updated
- Filters:
  - Compliance Status
  - Responsible Person
  - Applicability
  - Requirement/Standard (search)
  - Date range (created/updated)
- Actions:
  - Add Requirement
  - View/Edit
  - View Updates History
  - Link Evidence
  - Export (CSV/PDF)

3) Add/Edit Requirement Form (Create + Update)
Add the following fields EXACTLY as in the doc:
- Requirement/Standard (IMPORTANT: requirement can have multiple references)
  - Implement as a “Requirement” main text + ability to add multiple reference rows OR multi-select reference inputs.
- Reference (Sections) — label must show: Reference (Sections) and “Sections” should be indicated in brackets.
- Applicability
- Actions needed
- Compliance status (dropdown):
  - Non compliant
  - Partially compliant
  - Compliant
- Compliance Evidence:
  - Link to an existing document in the system (DMS picker)
  - Store both documentId + display title
  - Allow multiple evidence links
- Responsible person (user picker + option to type external name if needed)

4) Requirement Detail Page
- Display requirement info + evidence links
- Show compliance status + actions needed
- Show audit trail (who updated what/when)
- Show “Legal Update Tracking” entries for this requirement

5) Legal Update Tracking (per requirement + global view)
- A tab on each requirement: “Updates”
- Also a global page: /dashboard/legal/updates
- Table columns:
  - Date amended
  - Law updated date
  - Summary of change
  - Impact on business
  - Action required
  - Responsible person
  - Deadline
  - Completion status (Open / Closed)
- Filters:
  - Completion status
  - Responsible person
  - Deadline range
  - Overdue only
  - Requirement/Standard search

B) BACKEND / DATABASE (PERSIST EVERYTHING)
Create models/tables/collections:

1) legal_requirements
Fields:
- id
- organizationId
- requirementStandard (string/text)
- applicability (string/text)
- actionsNeeded (string/text)
- complianceStatus (enum: NON_COMPLIANT | PARTIALLY_COMPLIANT | COMPLIANT)
- responsibleUserId (nullable)
- responsibleExternalName (nullable)
- references: array of { referenceText }   // “Reference (Sections)” supports multiple refs
- evidenceLinks: array of { documentId, documentTitleSnapshot }  // allow multiple
- createdByUserId
- createdAt, updatedAt
- auditTrailEnabled (use your existing audit logging if available)

2) legal_updates
Fields:
- id
- organizationId
- legalRequirementId (FK)
- dateAmended (date)
- lawUpdatedDate (date)
- summaryOfChange (text)
- impactOnBusiness (text)
- actionRequired (text)
- responsibleUserId (nullable)
- responsibleExternalName (nullable)
- deadline (date)
- completionStatus (enum: OPEN | CLOSED)
- closedAt (timestamp nullable)
- closedByUserId (nullable)
- createdByUserId
- createdAt, updatedAt

API endpoints (minimum):
- POST /legal/requirements
- GET /legal/requirements (filters + pagination)
- GET /legal/requirements/:id (include updates)
- PATCH /legal/requirements/:id
- DELETE /legal/requirements/:id (optional; soft delete preferred)

- POST /legal/requirements/:id/updates
- GET /legal/updates (global view with filters)
- PATCH /legal/updates/:updateId
- POST /legal/updates/:updateId/close

C) INTEGRATIONS (DOCUMENT EVIDENCE)
- Add a DMS “Document Picker” component:
  - Search documents by title
  - Select one or many
  - Save links under evidenceLinks
- Evidence links must open the document viewer page.

D) STATUS + DEADLINE LOGIC
- If completionStatus = OPEN and today > deadline → mark as OVERDUE in UI (computed), and trigger escalation notifications.
- When an update is marked CLOSED:
  - auto-set closedAt + closedByUserId
  - require a closure note (optional but recommended)

E) NOTIFICATIONS + ESCALATIONS
Send in-app + email (if available) for:
- Legal update created and assigned to a responsible person
- Reminder:
  - 7 days before deadline
  - 1 day before deadline
  - On deadline
- Overdue escalation:
  - responsible person → supervisor/admin → owner (based on your escalation rules)

F) RBAC / PERMISSIONS
- Admin: full CRUD for legal requirements and updates.
- Owner: view all + can close updates + export reports.
- Supervisor/Manager: view for their dept/site (if dept/site exists in your org structure) and update items assigned to them.
- Employee: read-only (optional) OR only view items relevant to their assigned module.
- Consultant/Auditor: view-only if invited/assigned.

G) EXPORTS / REPORTS
- Export Legal Requirements Register (CSV + PDF)
- Export Legal Updates Report (CSV + PDF)
Include:
- requirement info + compliance status + evidence titles + responsible person
- updates info + deadlines + completion status

H) “TYPE MANUALLY” SUPPORT
Wherever there is a dropdown or picker that might need custom input:
- Responsible person: allow externalName
- Applicability: dropdown + custom value
- Requirement/Standard: text (no dropdown)
- Reference: text inputs (multiple)

I) FINAL QA CHECKS
- No white screen errors
- Lists load fast with pagination
- Filters work
- Org isolation is enforced in every query
- Evidence links open correctly
- Notifications trigger correctly
- Push all changes to GitHub when done.

IMPLEMENT THIS NOW using the existing codebase patterns and ensure everything is integrated and stable, then push changes.