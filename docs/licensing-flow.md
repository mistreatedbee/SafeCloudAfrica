# Licensing flow — How it works

This document describes the end-to-end licensing flow for SafeCloud Africa (IDSMP): from Super Admin generating a license key to clients activating, creating their organisation, and using role-based dashboards.

## Overview

1. **Super Admin** generates one or more **license keys** (plan, billing cycle, seat limit, optional contract reference).
2. **Client** receives a license key (e.g. by contract) and goes to **Activate License**.
3. **Activation** creates the organisation, the Organisation Owner account (or links an existing user), and an active subscription; the key is marked used.
4. **Owner** (and optionally Admin) can **invite users** up to the seat limit and complete the **owner onboarding** wizard (sites, departments, admin, modules).
5. **Login** redirects by role and subscription status: no org → activate; expired/suspended → billing status; else role-based dashboard.

## 1. Super Admin: generate license key

- **Where:** Super Admin → Licenses (`/super-admin/licenses`).
- **Actions:** Generate license key (plan: Base / Growth / Professional / HR-only; billing cycle: 3 / 6 / 9 / 12 months; seat limit; optional “issued to”).
- **Output:** A unique key (e.g. `XXXX-XXXX-XXXX-XXXX`) shown once; share securely with the client.
- **Other:** List all license keys; revoke unused keys; view organisations and their subscription status; suspend an organisation’s subscription if needed.

## 2. Client: activate license

- **Where:** Public **Activate License** page (`/activate`), linked from the landing page and nav.
- **Steps:**
  - Enter license key (validated; plan details shown).
  - Enter company details (name, industry, country, primary contact name, email, phone).
  - Optionally create account (password) if the primary contact email is new.
  - Submit **Activate & Create Organisation**.
- **Backend:** Validates key (unused, not revoked, not expired); ensures primary contact email is not already in another organisation; creates company, owner membership, `org_licenses` row, marks key used; audit log.
- **After success:** Redirect to login with message “License activated. Please log in to continue.”

## 3. Organisation and subscription

- **Company (tenant):** Created with name, industry, country, status `active`, and `primary_admin_user_id` set to the owner.
- **Subscription:** `org_licenses` row with plan, seat limit, billing cycle, modules, start/end date, status `active`, linked to the license key.
- **Owner:** One user (primary contact) has role `owner` in `company_memberships`.

## 4. Owner onboarding (first-time)

- **Where:** After first login as owner, redirect to **Owner onboarding** (`/owner/onboarding`).
- **Steps:** Organisation setup (sites, departments) → Assign Admin → Invite users (with seat meter) → Enable modules (from subscription).
- **Completion:** “Finish setup” stores an onboarding-completed flag; next time the owner goes to `/owner` they see the normal dashboard.

## 5. Invites and seats

- **Invites:** Owner/Admin/Manager can invite users (role and email). Each invite has a **token** and **expires_at**.
- **Links:** Invite link can be `/invite/:inviteId` or `/invite/accept?token=...` (token is resolved to invite id).
- **Seat limit:** Invites and memberships are blocked when current members reach the subscription seat limit.

## 6. Login and redirect rules

On successful login:

- **Super Admin** (platform admin) → `/super-admin`.
- **No organisation** (no memberships) → `/activate?reason=no_org`.
- **Subscription expired or suspended** (or company suspended) → `/billing/status?reason=expired` or `?reason=suspended`.
- **Otherwise,** role-based redirect:
  - Owner → `/owner`
  - Admin → `/admin`
  - Manager / Supervisor → `/manager`
  - Employee → `/employee`
  - Consultant → `/consultant`
  - Auditor → `/auditor`

Protected dashboard routes use:

- **RequireSignedIn** — must be authenticated.
- **RequireWorkspace** — must have at least one company membership (else redirect to `/activate`).
- **RequireActiveSubscription** — must have an active subscription for the active company (else redirect to `/billing/status`). Billing and billing/status pages are excluded so users can always see status and renewal message.

## 7. Key entities

- **companies:** Tenant; `status` (active/suspended), `country`, `industry`, `primary_admin_user_id`, license fields.
- **license_keys:** Key, plan, billing cycle, seat limit, modules, status (unused/used/revoked), optional issued_to and expires_at.
- **org_licenses:** Subscription per company; plan, dates, status (pending/active/expired/suspended), optional link to license key and activated_at/activated_by.
- **company_invites:** Token, expires_at, status (pending/accepted/expired).

## 8. Guard summary

| Route / area        | Signed in | Workspace | Active subscription | Role        |
|---------------------|-----------|-----------|----------------------|------------|
| `/`, `/login`, `/activate`, `/invite/*` | —         | —         | —                    | —          |
| `/super-admin/*`    | ✓         | —         | —                    | Platform admin |
| `/owner`, `/admin`, … (dashboards) | ✓ | ✓         | ✓                    | Per route  |
| `/billing`, `/billing/status` | ✓ | ✓         | Skipped              | Billing: owner/admin/manager; Status: any |

This keeps the flow consistent and production-ready from key generation through activation, onboarding, and daily use.

---

## Testing checklist

- **Activation success:** Generate a key (Super Admin), open `/activate`, enter key + company details + new email/password; submit; confirm redirect to login and success banner; log in and confirm redirect to `/owner`.
- **Activation failures:** Try used key (message: already activated); try revoked key (invalid); try primary contact email that already has another org (message: email already used in another organisation).
- **Seat limit:** As owner/admin, invite users until seat limit; next invite should be blocked with licence limit message.
- **Route guards:** Signed out → open `/owner` → redirect to login; signed in, no memberships → redirect to `/activate`; signed in, org with expired subscription → redirect to `/billing/status`.
- **Role redirects:** Log in as owner → `/owner`; as admin → `/admin`; as manager/supervisor → `/manager`; as employee → `/employee`; as consultant → `/consultant`; as auditor → `/auditor`.
- **Super Admin:** Log in as platform admin → `/super-admin`; generate license key; revoke unused key; suspend an org from Organisations.
- **Invite by token:** Create invite; open `/invite/accept?token=<token>` (token from DB or from invite email); confirm redirect to `/invite/:id` and accept flow.
