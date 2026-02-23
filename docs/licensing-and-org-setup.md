# Licensing and Organisation Setup

This document describes how organisations are created, how licensing and seat limits work, and how to stay within tenant isolation.

## Organisation creation (activation flow)

1. **Super Admin** generates a **license key** (plan, billing cycle, seat limit, modules) in Super Admin → Licenses.
2. **Client** goes to **Activate License** (`/activate`), enters the key and company details (name, industry, country, primary contact).
3. **Activation** (RPC `activate_license_key`):
   - Validates key (unused, not revoked, not expired).
   - Creates `companies` row (organisation).
   - Creates `company_memberships` row for the primary contact with role **owner** and status **ACTIVE**.
   - Creates `org_licenses` row (plan, seat_limit, start_date, end_date, status active, modules_enabled from key).
   - Marks the license key as used.

No organisation data is created without a valid license key (or a direct Super Admin action). There is no self-service signup that creates an org without a key.

## Subscription and seat limit

- **Seat limit** comes from the active `org_licenses` row for the company (`seat_limit`). If there is no `org_licenses` row, `companies.employee_limit` is used.
- **Billable seats**: Only members with `status = 'ACTIVE'` count. Consultant/auditor members consume a seat unless `seat_exempt = true` on the membership.
- **Super Admin** is not a company member; they do not consume any org seat.
- **Enforcement**:
  - **Invite**: Before creating an invite, the app checks that `countActiveMembers(companyId) < getSeatLimitForCompany(companyId)`. If at limit, invite is blocked with “Seat limit reached. Upgrade license to add users.”
  - **Accept invite**: Creating the membership is subject to a DB trigger that enforces the billable-seat count (via `count_billable_seats` and `get_company_seat_limit`).

## Trial and exports

- A subscription can be marked **trial** (`org_licenses.is_trial`, `trial_ends_at`). During trial, users can **view** data but **cannot download exports** (e.g. report CSV/PDF).
- The backend RPC `can_company_export(company_id)` returns false when the organisation’s active license is in trial (or trial has not ended). The Reports page uses this to disable export buttons and show a trial message.

## Expired or suspended subscription

- If the organisation’s subscription is **expired** or **suspended**, login redirects to **Billing status** (`/billing/status`) with a message to renew or contact support.
- **RequireActiveSubscription** blocks access to app routes (except billing/status and related) when the active company has no active, non-expired license.

## Invites and member status

- **Invite** creates a `company_invites` row (email, role, token, expires_at, status pending). It does **not** create a `company_memberships` row until the invite is accepted.
- **Accept invite** creates a `company_memberships` row with `status = 'ACTIVE'` (default). Only ACTIVE members can access org data.
- **INVITED** is reserved for future use (e.g. pre-accept state if we create a membership row on invite). **DISABLED** is for revoked access.

## Tenant isolation (hard rule)

- **Never trust frontend org id.** Every API must resolve the organisation from the authenticated user’s session (e.g. JWT) and their `company_memberships` (status = ACTIVE). Use RLS and server-side checks so that:
  - Users only see data for companies they belong to.
  - No API accepts `companyId` or `organizationId` from the client as the source of truth without verifying membership.

## Organisation member fields (company_memberships)

- `status`: INVITED | ACTIVE | DISABLED.
- `department_id`, `site_id`: Optional; used to scope supervisor/manager to a department or site.
- `consultant_scope`: JSONB for consultant/auditor: `allowedModules`, `allowedDepartments`, `allowedSites`, `auditIds`, `expiresAt`. Enforced in RLS and in `consultant_scope_permits()`.
- `seat_exempt`: If true, this member does not count toward the seat limit (e.g. external auditor add-on).

## Key files

- **Migrations**: `docs/migrations/organization_member_scope_seats.sql`, `docs/migrations/rbac_consultant_scope_and_trial_export.sql`, `docs/migrations/license_activation_schema.sql`, `docs/migrations/activate_license_key_rpc.sql`.
- **Frontend**: `src/api/services/tenantService.ts` (createInvite, createMembership, countActiveMembers, getSeatLimitForCompany), `src/api/services/licensingService.ts` (checkCanExport, getLicenseInfo).
- **Activation**: `src/pages/activate/ActivateLicensePage.tsx`, RPC `activate_license_key`.
