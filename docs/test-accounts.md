# Demo test accounts (Phase 2)

Use these accounts to test role-based dashboards and multi-tenancy.

## Before you seed
- Apply the latest schema: `docs/phase2-schema.sql`
- In your local environment set:
  - `INSFORGE_BASE_URL` (or `VITE_INSFORGE_BASE_URL`)
  - `INSFORGE_ANON_KEY` (or `VITE_INSFORGE_ANON_KEY`)

Run:

```bash
node scripts/seed-demo.mjs
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

## Notes
- If InsForge email verification is enabled, user sign-in may fail after sign-up. For demo/testing, disable email verification in your InsForge auth settings, then rerun the seed script.
- The seed script inserts a few **incidents** and **tasks** into each company so dashboards show real data.

