# SafeCloud Africa - Phase 2 Deployment Guide

## Quick Start to Production

### Prerequisites

1. **InsForge Account** (Backend)
   - PostgreSQL database ready
   - PostgREST API endpoint
   - JWT secret configured

2. **Vercel Account** (Frontend)
   - GitHub repository connected
   - Environment variables configured

3. **Node.js 18+** (Local development)
   - npm or yarn package manager

## Step 1: Database Setup (Render/InsForge)

### 1.1 Execute Schema

```bash
# Connect to your PostgreSQL instance via insSQL or equivalent
# Copy entire contents of docs/phase2-schema.sql
# Execute in your database
```

Or via psql:
```bash
psql -h your-insforge-host -U postgres -d your_db < docs/phase2-schema.sql
```

### 1.2 Verify Installation

Check that all tables exist:
```sql
SELECT schemaname, tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;

-- Should return 47 tables
```

Verify RLS policies:
```sql
SELECT * FROM pg_policies WHERE schemaname = 'public';

-- Should return 40+ policies
```

### 1.3 Create Initial Data

Create a default company and admin user:

```sql
-- Insert company
INSERT INTO public.companies (name, license_type, employee_limit, primary_admin_user_id)
VALUES ('Demo Company', 'professional_12m', 50, 'ADMIN_USER_ID'::uuid)
RETURNING id;

-- Insert platform admin (replace with your user ID)
INSERT INTO public.platform_admins (user_id)
VALUES ('YOUR_USER_ID'::uuid);

-- Create company membership
INSERT INTO public.company_memberships (company_id, user_id, role, user_profile_name, user_email)
VALUES ('COMPANY_ID'::uuid, 'YOUR_USER_ID'::uuid, 'admin', 'Admin User', 'admin@company.com');
```

## Step 2: Backend Configuration (Render)

### 2.1 Environment Variables

Create `.env.production`:

```bash
# InsForge / PostgreSQL
DATABASE_URL=postgresql://user:password@host:5432/dbname
JWT_SECRET=your-jwt-secret-key
JWT_AUDIENCE=your-jwt-audience

# CORS
FRONTEND_URL=https://your-vercel-domain.vercel.app
ALLOWED_ORIGINS=https://your-vercel-domain.vercel.app

# Email (Optional - Phase 3)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password

# Logging
LOG_LEVEL=info
NODE_ENV=production
```

### 2.2 Deploy to Render

```bash
# Push code to GitHub
git push origin main

# In Render dashboard:
1. Create new Web Service
2. Connect your GitHub repository
3. Set runtime: Node
4. Set build command: npm install && npm run build
5. Set start command: npm start
6. Add environment variables
7. Deploy
```

### 2.3 Verify Backend

```bash
curl https://your-render-domain/health

# Should return: { "status": "ok" }
```

## Step 3: Frontend Deployment (Vercel)

### 3.1 Environment Variables

Create `.env.production`:

```bash
VITE_API_URL=https://your-render-domain
VITE_INSFORGE_URL=https://your-insforge-host
VITE_INSFORGE_API_KEY=your-insforge-api-key
```

### 3.2 Deploy to Vercel

```bash
# Via GitHub integration (recommended)
1. Connect your repo to Vercel
2. Set production environment variables
3. Deploy automatically on push to main

# Or via CLI
npm install -g vercel
vercel --prod
```

### 3.3 Verify Frontend

```bash
# Visit https://your-vercel-domain.vercel.app
# You should see the login page
```

## Step 4: Post-Deployment Testing

### 4.1 Database Connectivity

```bash
curl -X POST https://your-render-domain/api/test-db \
  -H "Content-Type: application/json"

# Should return connection status
```

### 4.2 Authentication Flow

1. Go to https://your-vercel-domain.vercel.app
2. Click "Sign Up"
3. Enter email and password
4. Create company during onboarding
5. Should redirect to dashboard

### 4.3 Feature Testing

**Safety Module**:
- [ ] Navigate to Risks
- [ ] Create Baseline Risk Assessment
- [ ] Add hazard with likelihood/consequence
- [ ] Verify risk level calculation

**Quality Module**:
- [ ] Navigate to Quality NCRs
- [ ] Create new NCR
- [ ] Verify all 40 fields save
- [ ] Test approval workflow

**Audits**:
- [ ] Navigate to Audits
- [ ] Plan new audit
- [ ] Add questions and expected responses
- [ ] Complete audit and verify findings

**Corrective Actions**:
- [ ] Create corrective action from NCR
- [ ] Assign to user
- [ ] Track overdue items
- [ ] Mark completed and verify

**Compliance**:
- [ ] Check Dashboard for compliance score
- [ ] Verify score calculation
- [ ] Review module-specific scores

## Step 5: Monitoring

### 5.1 Set Up Logging

In Render dashboard:
- Enable logs streaming
- Set up error alerts
- Monitor API response times

### 5.2 Database Monitoring

```sql
-- Check activity logs
SELECT * FROM public.activity_logs 
ORDER BY created_at DESC 
LIMIT 20;

-- Check for errors
SELECT * FROM pg_stat_statements 
WHERE query LIKE '%error%' 
ORDER BY mean_exec_time DESC;
```

### 5.3 Frontend Monitoring

In Vercel:
- Enable Analytics
- Set up error reporting
- Monitor build times

## Step 6: Backup & Recovery

### 6.1 Database Backups

Render provides automatic backups. To manually backup:

```bash
pg_dump -h your-host -U postgres dbname > backup.sql
```

### 6.2 Disaster Recovery

To restore:

```bash
psql -h your-host -U postgres dbname < backup.sql
```

## Step 7: Performance Optimization

### 7.1 Database

```sql
-- Analyze table statistics
ANALYZE;

-- Check index usage
SELECT * FROM pg_stat_user_indexes 
ORDER BY idx_blks_read DESC;

-- Vacuum maintenance
VACUUM ANALYZE;
```

### 7.2 Frontend

```bash
# Build optimization
npm run build

# Check bundle size
npm run analyze

# Run Lighthouse
npx lighthouse https://your-domain.vercel.app
```

## Step 8: Security Hardening

### 8.1 Database

```sql
-- Revoke public access
REVOKE ALL ON SCHEMA public FROM PUBLIC;

-- Enable audit logging (already done)
SELECT * FROM public.activity_logs LIMIT 1;

-- Set password policies
ALTER USER postgres WITH PASSWORD 'strong-password';
```

### 8.2 API

- Enable HTTPS (automatic in Vercel/Render)
- Set CORS headers (configured in .env)
- Validate JWT on all endpoints
- Rate limiting on auth endpoints

### 8.3 Frontend

- Enable Content Security Policy
- Set secure headers
- No hardcoded secrets
- Sensitive data only in environment variables

## Troubleshooting

### API Connection Error

```
Problem: Frontend can't connect to backend
Solution:
1. Check VITE_API_URL in .env
2. Verify CORS headers in backend
3. Check network tab in DevTools
4. Verify backend is running: curl https://backend-url/health
```

### Database Error

```
Problem: "Permission denied" on table access
Solution:
1. Check RLS policies: SELECT * FROM pg_policies;
2. Verify company_id in request matches tenant context
3. Check user role in company_memberships
4. Re-run RLS setup from phase2-schema.sql
```

### Authentication Issues

```
Problem: "Invalid JWT" or login fails
Solution:
1. Verify JWT_SECRET matches between backend and @insforge/react config
2. Check token expiration in localStorage
3. Verify user exists in company_memberships
4. Test auth endpoint directly
```

## Support

For issues during deployment:
1. Check error logs in Render dashboard
2. Check browser console for frontend errors
3. Query activity_logs table for backend audit trail
4. Refer to QUICK-REFERENCE.md for API examples

## Next Steps

After successful deployment:

1. **Create Demo Data**
   - Add sample incidents
   - Create test NCRs
   - Plan demonstration audits

2. **User Training**
   - Walk through key workflows
   - Explain dashboard KPIs
   - Cover module navigation

3. **Phase 3 Preparation**
   - Enable compliance scoring
   - Set up email notifications
   - Configure SLA workflows

---

**Deployment Status**: Ready for Production ✅
**Est. Deployment Time**: 30-60 minutes
**Support**: See docs/QUICK-REFERENCE.md
