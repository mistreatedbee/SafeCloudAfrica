# Phase 2/3 Implementation — Issues List

Issues addressed during Phase 2/3 Production + Operating Model implementation.

---

## 1. Incident Analytics risk level filter

- **What was broken:** Risk level filter on Incident Analytics page did not match stored values; options used capitalized labels (Low, Medium, High, Critical) while `RiskLevel` type and DB use lowercase (`low`, `medium`, `high`, `critical`).
- **Root cause:** Inconsistent casing between UI options and type/API.
- **Fix:** Normalised all risk level derivation and filter options to lowercase in `IncidentAnalyticsPage.tsx`; added display capitalisation for breakdown labels.

---

## 2. Incident Analytics error handling

- **What was broken:** If the incidents API call failed, the page could show a blank or confusing state with no error message.
- **Root cause:** `useAsync` returns `error` but the page only used `data` and `loading`.
- **Fix:** Destructured `loadError` from `useAsync` and rendered an error banner when present.

---

## 3. Licensing service try/catch

- **What was broken:** Build failed with "Expected finally but found export" in `licensingService.ts`.
- **Root cause:** `getLicenseInfo` had a `try` block without a matching `catch`/`finally`.
- **Fix:** Added a `catch` block that rethrows the error.

---

## 4. Organisation Owner role missing

- **What was broken:** Operating Model requires an "Organisation Owner" role; only admin/manager/supervisor/consultant/employee/auditor existed.
- **Root cause:** Schema and types did not include `owner`.
- **Fix:** Added `owner` to `CompanyRole` in `core.ts`, migration `operating_model_roles_licensing.sql` for `company_memberships` and `company_invites`, RLS helpers `is_company_owner` and `is_company_owner_or_admin`, and display label "Organisation Owner" in `useIdentity` and `UserMenu`.

---

## 5. Route guards for Owner

- **What was broken:** Owner could not access Users, Settings, Billing, or Risk create.
- **Root cause:** `RequireCompanyRole` allowed only `admin`/`manager` on those routes.
- **Fix:** Added `owner` to `allowed` for `/users`, `/settings`, `/billing`, and `/risks/new`.

---

## 6. Billing/Pricing and License usage not in UI

- **What was broken:** No in-app billing/pricing page or license seat usage for admins.
- **Root cause:** Not implemented.
- **Fix:** Added `BillingPricingPage` at `/billing` with Operating Model and legacy tiers; added "License usage (remaining seats)" widget on Dashboard for admin/owner with link to Billing.

---

## 7. Audit date proposal validation

- **What was broken:** Edge function accepted any body without requiring at least 3 proposed dates.
- **Root cause:** Stub implementation.
- **Fix:** Added validation in `auditProposalsSend.js` for `proposedDates.length >= 3` and return 400 if not met.
