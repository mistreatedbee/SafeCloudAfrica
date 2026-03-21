# Authentication and audit notes

## InsForge auth webhooks

This repository does **not** include handlers or configuration for InsForge (or other IdP) **login/logout webhooks**. Sign-in and sign-out events are therefore **not** automatically written to `activity_logs` or `platform_admin_audit_logs` from the auth provider.

If you need a definitive login trail for compliance, use:

- Your identity provider or InsForge project logs (dashboard / support), and/or  
- A future integration that calls a secure backend on `session.created` / `session.ended` (or equivalent) and appends to your audit store.

## Application-level session signal

The web app may record **`session.workspace.active`** in `activity_logs` when a signed-in user finishes loading tenant context for an active organisation. That entry is **not** a cryptographic proof of login; it indicates that the client assumed a workspace session for that user and company. It is **deduplicated per browser tab session** for a given `(user_id, company_id)` pair so periodic tenant refresh does not spam the log.

Do not rely on it as a complete access audit—pair it with database RLS, role checks, and provider logs where required.

## Related surfaces

- **Organisation activity**: various modules call `createActivityLog` for mutations; some pages list recent `activity_logs` (for example Security module, General module, Safety).
- **Platform (Super Admin) actions**: `platform_admin_audit_logs` via `logPlatformAdminAction` in the Super Admin UI (licences, modules, support mode, etc.).
