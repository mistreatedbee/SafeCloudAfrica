# SafeCloud Africa - Production Deployment Guide

**Version**: Phase 2 Complete  
**Last Updated**: February 3, 2026  
**Status**: Ready for Production

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Database Setup (InsForge/PostgreSQL)](#database-setup)
3. [Backend Configuration](#backend-configuration)
4. [Frontend Deployment (Vercel)](#frontend-deployment)
5. [Seed Demo Data](#seed-demo-data)
6. [Post-Deployment Testing](#post-deployment-testing)
7. [Monitoring & Maintenance](#monitoring--maintenance)

---

## Pre-Deployment Checklist

- [ ] InsForge project created with PostgreSQL database
- [ ] Database credentials and endpoints available
- [ ] GitHub repository created and connected to Vercel
- [ ] Vercel project created
- [ ] Node.js 18+ installed locally
- [ ] Schema file validated (`docs/phase2-schema.sql`)
- [ ] Seed script updated with demo data
- [ ] SMTP/Email service configured (optional for Phase 2)
- [ ] SSL certificates ready (Vercel handles this)
- [ ] Domain/subdomain configured (optional)

---

## Database Setup

### Step 1: Execute Schema on InsForge

The database schema includes:
- 47 tables with full CRUD operations
- 40+ Row-Level Security (RLS) policies for multi-tenancy
- Comprehensive audit trails and activity logging
- Support for all Phase 2 modules

#### Option A: Via InsForge Web Console

1. Log in to InsForge dashboard
2. Select your project → SQL Editor
3. Copy entire contents of `docs/phase2-schema.sql`
4. Execute the script
5. Verify all tables were created:

```sql
SELECT COUNT(*) as total_tables FROM information_schema.tables 
WHERE table_schema = 'public';
-- Should return: 47 tables
```

#### Option B: Via psql (Command Line)

```bash
# Set your InsForge connection details
export PGHOST=your-insforge-host.insforge.app
export PGUSER=postgres
export PGPASSWORD=your-password
export PGDATABASE=your_database

# Execute schema
psql < docs/phase2-schema.sql
```

#### Verify RLS Policies

```sql
-- Verify Row-Level Security is enabled on core tables
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND rowsecurity = true
ORDER BY tablename;

-- Should return 30+ tables with RLS enabled
```

### Step 2: Create Platform Admin User

```sql
-- Create platform admin (replace with your user UUID from InsForge Auth)
INSERT INTO public.platform_admins (user_id, created_at)
VALUES (
  'YOUR_USER_UUID'::uuid,
  now()
) ON CONFLICT (user_id) DO NOTHING;
```

### Step 3: Seed Demo Company (Optional - for testing)

See [Seed Demo Data](#seed-demo-data) section below.

---

## Backend Configuration

### Environment Setup

**Note**: For Phase 2, the backend uses InsForge's PostgREST, so traditional backend server deployment is not required. However, if you're using Render or another backend service, configure:

#### `.env.production` (if using Render/traditional backend)

```bash
# === Database ===
DATABASE_URL=postgresql://user:password@host:5432/dbname
DB_POOL_SIZE=20

# === InsForge / PostgREST ===
INSFORGE_BASE_URL=https://your-project.insforge.app
INSFORGE_ADMIN_API_KEY=your-admin-key-only-backend
INSFORGE_JWT_SECRET=your-jwt-secret

# === Security ===
JWT_AUDIENCE=your-jwt-audience
CORS_ORIGINS=https://your-app.vercel.app

# === Email (Optional) ===
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@safecloud.co.za
SMTP_PASSWORD=your-app-password

# === Logging ===
LOG_LEVEL=info
NODE_ENV=production
```

### RLS Configuration

InsForge uses JWT claims for RLS enforcement. Ensure your JWT settings include:

```json
{
  "sub": "user-uuid",
  "email": "user@company.com",
  "role": "authenticated",
  "tenant.company_id": "company-uuid"
}
```

---

## Frontend Deployment (Vercel)

### Step 1: Configure Environment Variables

In Vercel project settings → Environment Variables, add:

```
VITE_INSFORGE_BASE_URL=https://your-project.insforge.app
VITE_INSFORGE_ANON_KEY=your-public-anon-key
INSFORGE_BASE_URL=https://your-project.insforge.app
INSFORGE_ANON_KEY=your-public-anon-key
VITE_API_MODE=insforge
VITE_SHOW_ENV_DEBUG=false
```

### Step 2: Confirm Proxy-Based `vercel.json`

Production must route app requests through the local compatibility proxy:

```json
{
  "source": "/api/(.*)",
  "destination": "/api/insforge-proxy?path=$1"
}
```

```json
{
  "source": "/functions/(.*)",
  "destination": "/api/insforge-functions?path=$1"
}
```

Do not deploy an older configuration that rewrites `/api/*` directly to InsForge, or hosted auth/session compatibility fallbacks will be bypassed.

### Step 3: Deploy

```bash
# Option A: Automatic (GitHub)
# - Push code to GitHub
# - Vercel auto-deploys on push to main branch

# Option B: Manual
vercel deploy --prod
```

### Step 4: Verify Deployment

```bash
# Check that the site is live
curl https://your-app.vercel.app/

# Check that it connects to InsForge
# Try logging in with a test account
```

---

## Seed Demo Data

### Prerequisite

The seed script (`scripts/seed-demo.mjs`) creates demo users, companies, and sample data for testing.

### Method 1: Via NPM Script

```bash
# Set environment variables
export INSFORGE_BASE_URL=https://your-project.insforge.app
export INSFORGE_ANON_KEY=your-public-anon-key

# Run seed script
node scripts/seed-demo.mjs
```

### Method 2: Manual SQL Seed

```sql
-- Create demo company
INSERT INTO public.companies (
  name, license_type, employee_limit, primary_admin_user_id, metadata
) VALUES (
  'SafeCloud Demo Company',
  'professional_12m',
  100,
  'YOUR_ADMIN_UUID'::uuid,
  '{"industry": "Mining", "location": "South Africa"}'::jsonb
) RETURNING id;

-- Record the returned company ID for next step

-- Create admin membership
INSERT INTO public.company_memberships (
  company_id, user_id, role
) VALUES (
  'COMPANY_ID_FROM_ABOVE'::uuid,
  'YOUR_ADMIN_UUID'::uuid,
  'admin'
);

-- Create sample data for testing
-- (See docs/test-accounts.md for more examples)
```

---

## Post-Deployment Testing

### 1. Authentication Flow

- Sign in through the deployed app with a valid user.
- Confirm the browser network tab does not show `405` for:
  - `POST /api/auth/sessions`
  - `POST /api/auth/refresh`
- Refresh the page and confirm the session restores correctly.
- Leave the app idle long enough to trigger the session manager and confirm silent refresh does not force a false logout.

### 2. API Connectivity

Test that your frontend can reach the backend:

```javascript
// In browser console at https://your-app.vercel.app
const token = localStorage.getItem('insforge-token');
fetch('https://your-project.insforge.app/rest/v1/companies', {
  headers: { Authorization: `Bearer ${token}` }
})
  .then(r => r.json())
  .then(console.log);
```

### 3. Core Features

- [ ] **Login**: Sign in with test account
- [ ] **Dashboard**: View statistics and KPIs
- [ ] **Create Incident**: File new incident report
- [ ] **Create NCR**: Create non-conformance report
- [ ] **Create Risk Assessment**: Document risk
- [ ] **Create Task**: Assign task to team member
- [ ] **View Reports**: Access analytics pages
- [ ] **Profile**: Update user profile
- [ ] **Help & Support**: Submit support ticket

### 4. RLS Verification

Ensure Row-Level Security is working:

```sql
-- Test as Company A admin
-- Should see only Company A's data
SELECT * FROM public.companies;

-- Test as Company B admin
-- Should see only Company B's data
SELECT * FROM public.companies;
```

---

## Monitoring & Maintenance

### Database Health Checks

```sql
-- Check table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Check for locked tables
SELECT 
  l.locktype,
  l.relation::regclass,
  l.mode,
  l.transactionid,
  l.virtualtransaction,
  l.pid,
  l.granted
FROM pg_locks l
LEFT JOIN pg_class c ON c.oid = l.relation
ORDER BY l.locktype;

-- Check active connections
SELECT 
  datname,
  count(*) as connections
FROM pg_stat_activity
GROUP BY datname;
```

### Performance Monitoring

- Monitor Vercel analytics dashboard
- Check InsForge API performance metrics
- Review database query logs for slow queries
- Set up alerts for error rates

### Backup Strategy

InsForge automatically backs up your database. For additional safety:

1. Enable automated backups in InsForge settings
2. Schedule weekly manual exports of critical tables
3. Maintain 7-day backup retention

### Security Best Practices

- [ ] Rotate JWT secrets monthly
- [ ] Review RLS policies for gaps
- [ ] Monitor for unauthorized API access
- [ ] Keep dependencies updated
- [ ] Implement rate limiting on public endpoints
- [ ] Use HTTPS only (Vercel enforces this)
- [ ] Audit user role assignments regularly

---

## Troubleshooting

### "Column does not exist" Error

**Solution**: Ensure `docs/phase2-schema.sql` was fully executed without interruption.

```sql
-- Check if table exists
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables 
  WHERE table_name = 'quality_ncrs'
);

-- If not, re-run: docs/phase2-schema.sql
```

### "Connection refused" to InsForge

**Solution**: Verify `VITE_INSFORGE_BASE_URL` is correct and includes https://.

```bash
# Test connectivity
curl -I https://your-project.insforge.app
```

### Slow Login / Auth Issues

**Solution**: First inspect the deployed browser network tab.

- If `POST /api/auth/sessions` or `POST /api/auth/refresh` returns `405`, production is likely serving an older deploy or bypassing the Vercel auth proxy.
- Confirm the latest deployment uses the proxy-based `vercel.json` routes and redeploy.
- If the latest deployment is already live, check Vercel function logs for `api/insforge-proxy` to confirm the compatibility fallback is running.

### RLS Denying Valid Requests

**Solution**: Verify JWT claims include `tenant.company_id`:

```javascript
// In browser, decode JWT:
const token = localStorage.getItem('insforge-token');
const payload = JSON.parse(atob(token.split('.')[1]));
console.log(payload); // Should include tenant.company_id
```

---

## Support & Documentation

- **API Docs**: https://your-project.insforge.app/docs
- **Schema Reference**: `docs/phase2-schema.sql`
- **Test Accounts**: `docs/test-accounts.md`
- **Phase 2 Features**: `docs/PHASE2-COMPLETION-FINAL.md`

---

## Next Steps (Phase 3)

After Phase 2 deployment, the following features can be added:

- [ ] ISO 45001/14001/9001 clause mapping
- [ ] Compliance scoring engine
- [ ] Automation and escalation workflows
- [ ] Advanced PDF/Excel reporting
- [ ] Mobile app (React Native)
- [ ] Real-time collaboration features

---

**Deployment Date**: _______________  
**Deployed By**: _______________  
**Status**: [ ] Testing [ ] Staging [ ] Production

