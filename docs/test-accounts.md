# Demo test accounts (Phase 2)

Use these accounts to test role-based dashboards and multi-tenancy.

## Before you seed
- Apply the latest schema: `docs/phase2-schema.sql` and `docs/migrations/operating_model_roles_licensing.sql`
- In your local environment set:
  - `INSFORGE_BASE_URL` (or `VITE_INSFORGE_BASE_URL`)
  - `INSFORGE_ANON_KEY` (or `VITE_INSFORGE_ANON_KEY`)

**Option 1 — Two companies (Admin, Consultant, Employee each):**

```bash
node scripts/seed-demo.mjs
```

**Option 2 — Single South African org with all roles (Owner, Admin, Manager, Supervisor, Employee, Auditor):**

```bash
node scripts/seed-sa-single-org.mjs
```

## Login credentials
All accounts use the same password:
- **Password**: `SafeCloud@123`

### Super Admin (platform-wide)
- **Email**: `superadmin@safecloud.africa`
- **Role**: Platform Super Admin
- **Access**: `/super-admin`

To enable platform access, insert this user into `platform_admins` in your InsForge SQL console:

```sql
insert into public.platform_admins (user_id) values ('<SUPER_ADMIN_USER_UUID>');
```

The seeding script prints the user UUIDs in the terminal output.

### Company A — Khanyisa Construction (Pty) Ltd
- **Admin**: `admin@khanyisa.co.za`
- **Consultant**: `consultant@khanyisa.co.za`
- **Employee**: `employee@khanyisa.co.za`

### Company B — Umzansi Logistics (Pty) Ltd
- **Admin**: `admin@umzansi.co.za`
- **Consultant**: `consultant@umzansi.co.za`
- **Employee**: `employee@umzansi.co.za`

### Single SA org — Mzanzi Safety (Pty) Ltd (from seed-sa-single-org.mjs)
- **Owner**: `owner@mzanzisafety.co.za` (Organisation Owner)
- **Admin**: `admin@mzanzisafety.co.za`
- **Manager**: `manager@mzanzisafety.co.za`
- **Supervisor**: `supervisor@mzanzisafety.co.za`
- **Employee**: `employee@mzanzisafety.co.za`
- **Auditor**: `auditor@mzanzisafety.co.za`

## Notes
- If InsForge email verification is enabled, user sign-in may fail after sign-up. For demo/testing, disable email verification in your InsForge auth settings, then rerun the seed script.
- The seed script inserts a few **incidents** and **tasks** into each company so dashboards show real data.

