# SafeCloud Africa - Complete Technical Reference

**Last Updated**: February 3, 2026  
**Version**: Phase 2.1 + Phase 3 Foundation  
**Status**: Production Ready ✅

---

## 🚀 Quick Start (Right Now)

### 1. Configure Environment
Create `.env.local` in project root:
```bash
VITE_API_MODE=insforge
VITE_INSFORGE_BASE_URL=https://pas375jb.us-west.insforge.app
VITE_INSFORGE_ANON_KEY=YOUR_KEY_FROM_INSFORGE_DASHBOARD
VITE_SHOW_ENV_DEBUG=false
```

### 2. Fix The Errors
- **400 errors**: Set correct `VITE_INSFORGE_ANON_KEY` above
- **"Ol" error**: Clear cache and restart dev server

```bash
npm run dev
# Then Ctrl+Shift+Delete to clear browser cache
```

### 3. Test
Visit http://localhost:5173

---

## 📦 Architecture

```
SafeCloud Africa (React + Vite)
├── Frontend (Vercel)
│   ├── Pages (25+ modules)
│   ├── Components (50+ reusable)
│   └── Services (35+ API wrappers)
└── Backend (InsForge/PostgreSQL)
    ├── PostgREST API
    ├── 47 tables with RLS
    └── JWT authentication
```

---

## 📋 Database Schema (47 Tables)

### Core Entities
- `companies` - Multi-tenant organization isolation
- `company_memberships` - User-company relationships with RBAC
- `platform_admins` - Super admin users

### Safety & Compliance
- `incidents` - Incident reports with severity/status
- `quality_ncrs` - Non-conformance reports
- `risk_assessments` - Risk evaluation and mitigation
- `audits` - Audit management with findings
- `tasks` - Task tracking and assignment
- `corrective_actions` - CA tracking linked to NCRs/risks

### Training & HR
- `trainings` - Training courses and attendance
- `training_participants` - Who attended what training
- `employees` - Employee master data
- `contractors` - Contractor management
- `visitors` - Visitor tracking

### Operations
- `documents` - Document repository
- `form_templates` - Form definitions
- `ppe_items` - PPE inventory
- `emergency_drills` - Emergency preparedness
- `environment_monitoring` - Environmental data

### Health & Compliance
- `health_checks` - Health monitoring
- `compliance_scores` - Real-time compliance metrics
- `activity_logs` - Audit trail
- `approvals` - Approval workflows

### Phase 3 (Foundation)
- `iso_mapping` - ISO clause to entity mapping
- `iso_compliance` - Compliance status per clause
- `licenses` - License management
- ... and more for future features

---

## 🛠️ Service Layer (35+ Services)

| Service | Purpose | Endpoint |
|---------|---------|----------|
| `incidentsService` | Incident CRUD | `/rest/v1/incidents` |
| `risksService` | Risk assessment | `/rest/v1/risk_assessments` |
| `qualityNcrsService` | NCR management | `/rest/v1/quality_ncrs` |
| `auditsService` | Audit lifecycle | `/rest/v1/audits` |
| `tasksService` | Task tracking | `/rest/v1/tasks` |
| `trainingService` | Training records | `/rest/v1/trainings` |
| `documentsService` | Document mgmt | `/rest/v1/documents` |
| `licensingService` | License control | In-memory logic |
| `exportService` | PDF/CSV export | Client-side generation |
| `isoMappingService` | ISO compliance | Clause definitions |
| `complianceScoringService` | Score calculation | Real-time compute |
| ... and 24+ more | ... | ... |

---

## 🔑 Authentication Flow

```
User Login
    ↓
InsForge Auth (Email + Password)
    ↓
JWT Token Generated
    ↓
Token stored in browser (localStorage)
    ↓
All API calls include: Authorization: Bearer <token>
    ↓
InsForge verifies JWT signature
    ↓
RLS policies enforce data isolation
    ↓
Only authorized data returned
```

---

## 🔐 Row-Level Security (RLS)

Every table has RLS policies ensuring:
- Users can only access their company's data
- Admins can access more than employees
- Platform admins can override (super admin)
- All enforced at database level (can't be bypassed)

Example:
```sql
create policy "incidents_company_isolation" on public.incidents
  for all using (company_id = current_setting('tenant.company_id')::uuid);
```

---

## 📊 Pages & Features

### Main Dashboard
- `DashboardPage` - KPI overview, quick stats
- `IncidentAnalyticsPage` - Incident trends & analysis

### Safety & Quality
- `IncidentsPage` - Report and manage incidents
- `NCRsPage` - Non-conformance reporting
- `AuditsPage` - Audit scheduling and findings
- `QualityPage` - Quality metrics
- `SafetyPage` - Safety statistics

### Risk & Environment
- `RisksPage` - Risk assessment matrix
- `EnvironmentPage` - Environmental monitoring
- `PlanningReviewPage` - Risk planning

### Operations
- `TasksPage` - Task management
- `DocumentsPage` - Document repository
- `FormsPage` - Form templates
- `PPEPage` - PPE inventory
- `InspectionsPage` - Inspection checklists

### Training & Users
- `TrainingPage` - Training management
- `UsersPage` - User management
- `ProfilePage` - User profile

### Administration
- `SettingsPage` - Company settings
- `ApprovalsPage` - Approval workflows
- `DocumentReviewsPage` - Document review
- `ReportsPage` - Report generation

### Admin Only
- `SuperAdminPage` - Platform admin console
- `SeedDemoPage` - Demo data generation

---

## 🎨 UI Components (50+)

### Layout
- `Layout` - Standard page wrapper with header/sidebar
- `Header` - Top navigation with user menu
- `Sidebar` - Module navigation

### Forms
- `IncidentCreateModal` - Incident submission (800+ lines)
- `NcrCreateModal` - NCR submission
- `RiskAssessmentForm` - Risk evaluation
- `TaskCreateModal` - Task creation
- `AuditScheduleModal` - Audit booking

### Display
- `StatusBadge` - Colored status indicators
- `SeverityBadge` - Risk/severity display
- `ComplianceMeter` - Compliance score visualization
- `DataTable` - Reusable data grid

### Modals
- `Modal` - Base modal component
- `Confirm` - Confirmation dialogs
- `LoadingSpinner` - Loading indicator

### Charts
- `IncidentChart` - Incident trends
- `RiskMatrix` - Risk scatter plot
- `ComplianceChart` - Compliance trends

---

## 🚀 Deployment

### Local Development
```bash
npm install
npm run dev
# Opens http://localhost:5173
```

### Production Build
```bash
npm run build
# Creates dist/ folder for Vercel
```

### Environment Variables (Required)
```
VITE_INSFORGE_BASE_URL=https://your-project.insforge.app
VITE_INSFORGE_ANON_KEY=your-anon-key
```

### Deployment Targets
- **Frontend**: Vercel (auto-deploys on git push)
- **Backend**: InsForge (managed service)
- **Database**: PostgreSQL on InsForge
- **Auth**: InsForge Auth

---

## 🔧 Development Patterns

### Service (API Wrapper)
```typescript
// services/incidentsService.ts
export async function listIncidents(input: { 
  companyId: UUID; 
  search?: string;
  limit?: number;
}): Promise<Incident[]> {
  const { data, error } = await insforge.database
    .from('incidents')
    .select('*')
    .eq('company_id', input.companyId)
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 100);
  
  if (error) throw error;
  return data as Incident[];
}
```

### Page Component
```typescript
// pages/IncidentsPage.tsx
export function IncidentsPage() {
  const { activeCompanyId } = useTenant();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  
  useEffect(() => {
    loadIncidents();
  }, [activeCompanyId]);
  
  async function loadIncidents() {
    const data = await listIncidents({ 
      companyId: activeCompanyId 
    });
    setIncidents(data);
  }
  
  return (
    <Layout title="Incidents">
      {/* Page content */}
    </Layout>
  );
}
```

### Custom Hook
```typescript
// api/hooks/useAsync.ts
export function useAsync<T>(
  fn: () => Promise<T>,
  deps?: any[]
): { data: T | null; loading: boolean; error: any } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    fn().then(setData).catch(setError).finally(() => setLoading(false));
  }, deps);
  
  return { data, loading, error };
}
```

---

## 📚 File Structure

```
src/
├── pages/              # Page components (25+)
├── components/         # Reusable UI (50+)
├── api/
│   ├── services/       # API wrappers (35+)
│   ├── models/         # TypeScript types
│   ├── hooks/          # Custom hooks (useAsync, etc)
│   └── insforge/       # InsForge client config
├── auth/               # Auth guards & helpers
├── tenant/             # Multi-tenancy context
├── utils/              # Utility functions
├── index.css           # Global styles (Tailwind)
├── App.tsx             # Main app component
└── index.tsx           # Entry point

docs/
├── PRODUCTION-DEPLOYMENT.md
├── QUICK-DEPLOY.md
├── FINAL-SUMMARY.md
├── phase2-schema.sql
└── ...

public/                # Static assets
```

---

## 🧪 Testing Checklist

- [ ] Can sign up new account
- [ ] Can sign in with account
- [ ] Can create incident
- [ ] Can create NCR
- [ ] Can create risk
- [ ] Can create task
- [ ] Can create audit
- [ ] Dashboard loads
- [ ] Company A cannot see Company B data
- [ ] Can export to PDF/CSV
- [ ] Mobile responsive
- [ ] No console errors

---

## 🐛 Common Issues

### 400 Bad Request
**Cause**: Missing or incorrect `VITE_INSFORGE_ANON_KEY`  
**Fix**: Set correct key in `.env.local`

### "Cannot access 'X' before initialization"
**Cause**: Circular dependency or import order  
**Fix**: `npm run build` and restart dev server

### Blank Page
**Cause**: Missing `.env.local`  
**Fix**: Create `.env.local` with required vars

### CORS Error
**Cause**: Wrong `VITE_INSFORGE_BASE_URL`  
**Fix**: Must be `https://`, not `http://`

### 401 Unauthorized
**Cause**: Token expired or invalid  
**Fix**: Clear localStorage and re-login

---

## 📞 Support

### Documentation
- `SETUP_GUIDE.md` - Initial setup
- `PRODUCTION-DEPLOYMENT.md` - Full deployment
- `QUICK-DEPLOY.md` - Fast deployment
- `FINAL-SUMMARY.md` - Project overview

### Get Help
1. Check error message in browser console (F12)
2. Review relevant documentation above
3. Check if `.env.local` is configured correctly
4. Try `npm run build` to identify compile errors

---

## ✅ Production Checklist

- [ ] Environment variables set in Vercel
- [ ] Database schema executed (phase2-schema.sql)
- [ ] Demo company created
- [ ] Admin user created
- [ ] Test incident can be created
- [ ] Test NCR can be created
- [ ] All 25+ pages accessible
- [ ] No console errors
- [ ] Performance acceptable (<2s load)
- [ ] Mobile responsive
- [ ] SSL working (https)

---

**Ready to deploy?** See `docs/QUICK-DEPLOY.md`

**Having issues?** Check `SETUP_GUIDE.md`

**Need details?** See `docs/PRODUCTION-DEPLOYMENT.md`

