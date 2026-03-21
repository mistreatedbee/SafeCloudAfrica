# Backup and restore runbook

This document describes how backups relate to SafeCloud Africa, what the platform does **not** do, and how operations should verify and recover data. For deployment steps, see [PRODUCTION-DEPLOYMENT.md](./PRODUCTION-DEPLOYMENT.md).

## Scope: who owns what

| Area | Responsibility |
|------|----------------|
| Managed PostgreSQL (schema in `public`, RLS, application data) | **InsForge** hosts and operates the database stack described in [InsForge database architecture](https://docs.insforge.dev/core-concepts/database/architecture). |
| File storage (buckets, object metadata in InsForge storage subsystem) | **InsForge** for the storage layer; the app uses InsForge APIs/SDK. |
| Application deployment (Vercel), environment variables, custom domains | **Your team** (SafeCloud deployment). |
| Application-level exports or reports | **Your team**, if you add them; they are not a substitute for database backups. |

The web application **cannot** perform an honest one-click database or full storage restore without **provider APIs and elevated credentials** that are not exposed to the browser. Restore is a **console- and support-led** process through InsForge (or as documented for your plan).

## Backup expectation (provider-managed)

Backup **frequency**, **retention**, and **restore mechanics** depend on your **InsForge project and plan**. Public InsForge documentation does not publish fixed RPO/RTO numbers for all tiers.

**Action for operations:** Confirm in the InsForge dashboard or with InsForge support:

- Whether automated backups exist for your project and how often they run.
- Retention (how far back you can restore).
- The approved procedure to request or perform a restore (ticket, console action, or other).

Do **not** assume a specific schedule (for example “daily”) in internal SLAs until it is **written down for your account**.

## How to verify backups

Use a lightweight, repeatable checklist:

1. **Document provider confirmation**  
   Save a short note (ticket ID, email, or dashboard screenshot reference) when InsForge confirms backup coverage for production.

2. **Optional: non-production restore drill**  
   Periodically validate that you can restore into a **non-production** environment (or that InsForge’s documented drill matches your expectations). Record the date and outcome.

3. **Surface “last verified” in the app (optional)**  
   So super-admins see a declared date on Platform health, you can either:
   - Set `VITE_PLATFORM_LAST_BACKUP_DECLARED_AT` (ISO 8601) at build/deploy after you verify backups, **or**
   - Insert a `backup.verified` row into `platform_operational_events` (see below).

Neither replaces InsForge’s actual backup job; they are **operational attestations** only.

### Optional: `backup.verified` operational event

The super-admin **Platform health** page reads `platform_operational_events`. Platform admins have **SELECT** only on that table (RLS); inserts from the app use the **service role** on the server.

To record a manual verification without redeploying, insert a row using **InsForge SQL Editor** (or any tooling that uses elevated database access), for example:

```sql
insert into public.platform_operational_events (
  event_type,
  status,
  module,
  message
) values (
  'backup.verified',
  'info',
  'ops',
  'Confirmed with InsForge support — ticket EXAMPLE-123'
);
```

Use `event_type` exactly `backup.verified`. The UI uses `created_at` as the displayed “last recorded verification” time.

## Restore procedure (no in-app restore)

1. **Stop or isolate writes** if required by your incident process (coordinate with stakeholders).
2. **Contact InsForge** or use the InsForge console per your plan’s documented restore path.
3. **Do not rely on the SafeCloud UI** for restore until a future integration explicitly supports provider backup APIs and your security review.

After restore, redeploy or verify Vercel environment variables and application config as needed; see [PRODUCTION-DEPLOYMENT.md](./PRODUCTION-DEPLOYMENT.md).

## RPO and RTO (how to talk about them)

- **RPO (Recovery Point Objective):** How much data you can afford to lose, usually measured as maximum acceptable time since the last good backup. Your **actual** RPO is bounded by **InsForge backup frequency and any replication** for your project, plus how often critical data changes.
- **RTO (Recovery Time Objective):** How long restoration and cutover are allowed to take, including provider response time, restore execution, and application validation.

**These numbers are plan- and process-dependent.** They must be **validated** against InsForge (and your own runbooks) after you know your tier and have run at least one drill or support-confirmed procedure. The Platform health “last backup” field does **not** compute RPO/RTO; it only reflects a **declared or recorded** verification timestamp when configured.

## Future: live backup metadata

If InsForge exposes backup metadata via an API, the application can prefer that source for the same UI slot and retire or demote static env/event fallbacks. Until then, treat the dashboard field as **declared/recorded**, not a live probe of InsForge backup jobs.
