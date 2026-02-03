# Safe Cloud Africa (IDSMP) — Phase 2 Backend Endpoints / Contracts

Phase 2 uses InsForge **Auth + Database (PostgREST)** directly from the frontend SDK. “Endpoints” below are expressed as the *logical* API surface you must support (tables/RLS + optional edge functions).

## Authentication
- **POST** `auth.signUp({ email, password, name })`
- **POST** `auth.signInWithPassword({ email, password })`
- **POST** `auth.signOut()`
- **GET** `auth.getCurrentSession()`
- **GET** `auth.getProfile(userId)` (optional)
- **PATCH** `auth.setProfile(fields)` (optional)

## Multi-tenancy (Company isolation)
### Companies
- **DB** `companies`
  - **Create**: Admin registration flow inserts a company row
  - **Read**: members can read their company
  - **Update**: admin only

### Memberships
- **DB** `company_memberships`
  - **Create**: company admin creates membership (or via invite acceptance)
  - **Read**: admin/consultant can read all in company; employees read own
  - **Update**: admin only (role changes, removals)

### Invites (recommended)
- **DB** `company_invites`
  - **Create**: admin creates invite (enforces licence limit)
  - **Accept**: invited user accepts invite → creates membership
  - If your JWT does not expose email for RLS, implement `accept` via edge function.

## Core shared systems (global, reused by all modules)
### Activity logs / Audit trail (required)
- **DB** `activity_logs`
  - **Create**: on every consultant action and key admin actions
  - **Read**: admin sees all company logs

### Tasks (required)
- **DB** `tasks`
  - **Create**: admin/consultant
  - **Read**:
    - admin/consultant: all company tasks
    - employee: tasks assigned to them only
  - **Update**: status changes, assignment, due dates

### Corrective actions (required; can be enabled incrementally)
- **DB** `corrective_actions`
  - **Create/Draft**: consultant
  - **Approve/Close**: admin only
  - **Link**: incidents ↔ CAPA (Phase 2 core relationship)

### Document control (required; can be enabled incrementally)
- **DB** `documents`
- **Storage** buckets:
  - `documents`
  - `evidence`
  - `forms`

## Incidents (Phase 2 focus)
- **DB** `incidents`
  - Must include: `company_id`, `module`, `category`, `subcategory`, `severity`, `status`, `occurred_at`
  - **Read**:
    - admin/consultant: all company incidents
    - employee: their own / assigned only
  - **Write**:
    - create by any member
    - update (investigate/close) by admin/consultant

## Forms system (Phase 2 “manual first”)
- **DB** `form_templates` (JSON schema)
- **Storage** `forms` bucket for PDFs
- **OCR / auto extraction**: deferred to Phase 3 (edge function + AI/OCR)

## Minimum edge functions (optional but useful in Phase 2)
- **POST** `functions/accept-invite`
  - Use when invite RLS by email is not feasible
- **POST** `functions/seed-demo-data`
  - Admin-only helper to insert a small demo dataset per company

