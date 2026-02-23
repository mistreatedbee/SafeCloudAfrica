# RBAC and Dashboards

This document describes role-based access control (RBAC) and the six dashboards in SafeCloud Africa (IDSMP).

## Roles

| Role | Description | Dashboard path |
|------|-------------|----------------|
| **Super Admin** | Platform owner (SafeCloud Africa). Not a company member; does not consume org seats. | `/super-admin` |
| **Organisation Owner** | Company director. Compliance overview, appoint admins, view reports, approve critical actions. | `/owner` |
| **Admin** | Company system admin. Full access within org: users, license, modules, incidents, risks, audits, training, documents, reports. | `/admin` |
| **Manager / Supervisor** | Scoped to department/site. Team incidents, corrective actions, training, audits, PPE. No user management or system settings. | `/manager` |
| **Employee** | Own profile, tasks, training, incidents, PPE. Report incidents, upload evidence, acknowledge training. | `/employee` |
| **Consultant / Auditor** | External, time-bound. Assigned modules/departments/sites only. Audits, documents, incidents (if allowed), risk registers. All actions logged. | `/external` |

## Login redirect

After login, users are sent to their dashboard by role:

- Super Admin → `/super-admin/overview`
- No organisation → `/activate`
- Subscription expired/suspended → `/billing/status`
- Owner → `/owner`
- Admin → `/admin`
- Manager / Supervisor → `/manager`
- Employee → `/employee`
- Consultant / Auditor → `/external`

The generic `/app` route redirects to the role-based dashboard above.

## Route guards

- **RequireSignedIn** — user must be authenticated.
- **RequireWorkspace** — user must have at least one company membership (status ACTIVE).
- **RequireActiveSubscription** — active company must have an active, non-expired subscription.
- **RequireCompanyRole** — user’s role in the active company must be in the allowed list. Otherwise redirect to `/access-denied`.
- **RequirePlatformAdmin** — user must be in `platform_admins` (Super Admin).
- **OwnerOnboardingGate** — if owner has not completed onboarding, redirect to `/owner/onboarding`.

Dashboard routes are wrapped with the appropriate role:

- `/owner` — `RequireCompanyRole allowed={['owner']}`
- `/admin` — `RequireCompanyRole allowed={['admin']}`
- `/manager` — `RequireCompanyRole allowed={['manager','supervisor']}`
- `/employee` — `RequireCompanyRole allowed={['employee']}`
- `/external` — `RequireCompanyRole allowed={['consultant','auditor']}`

## Sidebar (navigation)

The sidebar is filtered by role:

- **Dashboard** link points to the role-specific path (e.g. owner → `/owner`, employee → `/employee`).
- **Modules** (General, Safety, Quality, etc.) — visible to owner, admin, manager, supervisor only.
- **Management** (Documents, Forms, Tasks, Incidents, Audits, etc.) — some items are restricted to management roles; Documents, Forms, Tasks, Incidents, Training, Audits, Risk Management, PPE are visible to all org members (with backend scoping by role).
- **Settings, Billing, License, User Management** — owner and admin only.
- **Sellable features** (BBS, Contractors, Emergency, Templates) — management roles only.

Consultant/auditor see a reduced set (e.g. Audits, Documents, Incidents, Risk Management) and no settings or user management.

## Backend (RLS and helpers)

- **Organization** is represented by the `companies` table; **OrganizationMember** by `company_memberships` with `status` (INVITED | ACTIVE | DISABLED).
- Only **ACTIVE** members can access org data. `is_company_member()` and `company_role()` require `status = 'ACTIVE'`.
- Helpers: `is_company_owner`, `is_company_owner_or_admin`, `is_company_consultant_or_admin`, `is_company_supervisor`, etc.
- Consultant/auditor scope: `consultant_scope_permits(company_id, module, department_id, site_id)` checks `consultant_scope` (allowedModules, allowedDepartments, allowedSites, expiresAt).
- **Tenant isolation**: Every API must resolve organisation from the session (e.g. JWT + company_memberships). Do not trust `orgId` or `companyId` from the request body or query without validating membership.

## Access denied

If a user hits a route they are not allowed to access, they are redirected to `/access-denied`, which shows a short message and a link back to their role dashboard.

## Naming (spec vs codebase)

The spec uses “Organization” and “OrganizationMember”; the codebase and database use **Company** and **company_memberships**. The meaning is the same; this document uses both where helpful.
