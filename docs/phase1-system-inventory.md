# Safe Cloud Africa (IDSMP) — Phase 1 System Inventory

## What exists now (frontend)

- **App shell**: `src/components/layout/` (header, sidebar, layout)
- **Routing**: `src/App.tsx` (React Router)
- **Core pages (demo-ready)**:
  - Dashboard: `/`
  - Modules: `/modules/*` (Safety, Quality, Environment, Health, Legal, HR, Security, General)
  - Core operations: Documents, Tasks & Time, Incidents, Training, Audits, Risks, PPE, Legal Register
  - Programme: Planning/Review, Approvals, Document Reviews, Improvement
  - Sellable features: BBS, Contractors/Visitors, Emergency Preparedness, Template Library
- **Mock data sources**:
  - Shared mock dataset: `src/utils/mockData.ts`
  - Some pages include page-local mock arrays (e.g. documents/tasks/audits)

## Required APIs (future)

### Auth & identity
- `GET /auth/me`
- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/invite`

### Tenant / Company (white-label)
- `GET /company`
- `PATCH /company` (branding, logo, preferences)
- `GET /sites`
- `GET /departments`

### Users / Roles / Access control
- `GET /users`
- `POST /users`
- `PATCH /users/:id`
- `GET /roles`
- `PATCH /permissions` (per module)

### Tasks & Time (core engine)
- `GET /tasks?status=&assignee=&module=`
- `POST /tasks`
- `PATCH /tasks/:id`
- `POST /tasks/:id/time-entries`
- `GET /time-entries?taskId=&userId=`

### Planning / KPIs / Performance review
- `GET /plans`
- `POST /plans`
- `PATCH /plans/:id`
- `GET /kpis?planId=`
- `POST /feedback` (supervisor + optional anonymous)

### DMS (documents)
- `GET /documents?category=&status=&search=`
- `POST /documents` (metadata)
- `PATCH /documents/:id`
- `GET /document-versions?documentId=`
- `POST /document-versions`

### Signatures & approvals
- `GET /approvals?status=`
- `POST /approvals`
- `POST /approvals/:id/sign` (re-auth/mfa in Phase 2)

### Reminders / notifications
- `GET /notifications`
- `PATCH /notifications/:id` (read/unread)
- `POST /reminders/run` (background job trigger / scheduler)

### Risk / hazard / permit (permit later)
- `GET /risks`
- `POST /risks`
- `PATCH /risks/:id`
- `GET /hazards?riskId=`
- `POST /hazards`
- `GET /permits` (Phase 3)

### Incidents & corrective actions
- `GET /incidents`
- `POST /incidents` (with media upload in Phase 2)
- `PATCH /incidents/:id`
- `POST /incidents/:id/investigation` (RCAT / 5-Why template)
- `GET /corrective-actions`
- `POST /corrective-actions`
- `PATCH /corrective-actions/:id`

### Training & competency
- `GET /training-records`
- `POST /training-records` (certificate upload Phase 2)
- `GET /training-matrix`

### Audits & inspections
- `GET /audits`
- `POST /audits`
- `POST /audits/:id/findings`
- `POST /audits/:id/evidence` (Phase 2)

### Compliance scoring & dashboards
- `GET /dashboard/summary`
- `GET /dashboard/compliance-scores`
- `GET /dashboard/trends`

### Legal register
- `GET /legal-register`
- `POST /legal-register`
- `PATCH /legal-register/:id`
- `POST /legal-register/:id/evidence`

### PPE
- `GET /ppe`
- `POST /ppe/issue`
- `POST /ppe/return`

### Sellable modules
- **BBS**: `GET /bbs/observations`, `POST /bbs/observations`
- **Contractors/Visitors**: `GET /contractors`, `POST /contractors`, `GET /visitors`, `POST /visitors/checkin`
- **Emergency**: `GET /emergency/plans`, `GET /emergency/drills`, `POST /emergency/alerts` (Phase 3)
- **Templates**: `GET /templates`, `POST /templates/clone`

## Required services (future)

- **Auth service** (sessions, invitations, password policy)
- **Tenant service** (company branding + module toggles)
- **DMS service** (versioning, permissions, approvals)
- **Notification service** (in-app + email, escalation rules)
- **Task/time engine** (time entries, status automation)
- **Compliance scoring service** (weights + clause mapping)
- **Audit & evidence service** (uploads + audit trail)
- **Integration service** (WhatsApp/SMS/email providers)

## Required background jobs (future)

- Document review reminders + escalations
- Training expiry reminders
- Task overdue escalation
- Scheduled report generation + email delivery (Phase 3)
- Legal register change monitoring (Phase 3)

