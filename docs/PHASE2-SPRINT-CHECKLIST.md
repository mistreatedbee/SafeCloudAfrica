# Phase 2 - Sprint Execution Checklist

**Target**: Complete remaining 10% to achieve full Phase 2 readiness for production

## Pre-Sprint Setup

- [ ] Review PHASE2-FINAL-STATUS.md for overview
- [ ] Review PHASE2-QUICKSTART.md for testing patterns
- [ ] Review phase2-integration-guide.md for deployment steps
- [ ] Clone latest main branch with all Phase 2 code
- [ ] Run `npm install` and `npm run build` locally
- [ ] Verify build passes (4700 modules transformed)

---

## Sprint Task 1: Email Service Deployment (2-3 hours)

**Goal**: Enable email notifications to send successfully

### Task 1.1: Create SendGrid Account (30 min)
- [ ] Go to sendgrid.com and create account
- [ ] Verify email address
- [ ] Create API key (Settings > API Keys)
- [ ] Copy API key (will need this)

### Task 1.2: Create InsForge Edge Function (1 hour)
- [ ] Log into InsForge console
- [ ] Go to Functions section
- [ ] Create new function: `/api/send-email`
- [ ] Copy template from `docs/phase2-integration-guide.md` section 1.1
- [ ] Paste code and configure:
  ```
  SENDGRID_API_KEY = your_api_key_here
  EMAIL_FROM = noreply@safecloudafrica.com
  EMAIL_FROM_NAME = SafeCloud Africa
  ```
- [ ] Deploy function
- [ ] Test function with cURL or Postman
  ```bash
  curl -X POST https://your-project.vercel.app/api/send-email \
    -H "Content-Type: application/json" \
    -d '{
      "to": "test@example.com",
      "subject": "Test Email",
      "htmlBody": "<h1>Hello</h1>"
    }'
  ```
- [ ] Verify response is `{"success": true}`

### Task 1.3: Test Email Sending (30 min)
- [ ] In browser console, run:
  ```typescript
  import { emailService } from './src/api/services/emailService';
  await emailService.sendTemplatedEmail('your-email@example.com', 'overdue_task', {
    taskTitle: 'Test Task',
    taskId: '123',
    dueDate: '2024-01-15',
  });
  ```
- [ ] Check email inbox for test message
- [ ] Verify email formatting is correct
- [ ] Verify template variables substituted correctly

### Task 1.4: Documentation (15 min)
- [ ] Add SendGrid account details to team password manager
- [ ] Document edge function URL in README
- [ ] Add troubleshooting section for email failures
- [ ] Update deployment checklist in docs

**Done Criteria**: ✅ Receive test email in inbox successfully

---

## Sprint Task 2: Storage Bucket Setup (1-2 hours)

**Goal**: Create and configure storage buckets for file uploads

### Task 2.1: Create Storage Buckets (30 min)
- [ ] Log into InsForge console
- [ ] Go to Storage section
- [ ] Create 6 new buckets (exactly as named):
  - [ ] `documents` - For general documents
  - [ ] `form_templates` - For form PDFs
  - [ ] `company_logos` - For company logos
  - [ ] `incident_evidence` - For incident evidence
  - [ ] `training_certificates` - For training certificates
  - [ ] `medical_certificates` - For medical records

### Task 2.2: Configure Bucket Policies (30 min)
For each bucket, set these policies:
- [ ] **documents**: Private, versioning enabled, retain lifecycle
- [ ] **form_templates**: Private, versioning enabled, retain lifecycle
- [ ] **company_logos**: Public (allow unauthenticated read), versioning disabled
- [ ] **incident_evidence**: Private, versioning enabled, retain lifecycle
- [ ] **training_certificates**: Private, versioning enabled, retain lifecycle
- [ ] **medical_certificates**: Private, versioning enabled, retain lifecycle

### Task 2.3: Test File Operations (30 min)
- [ ] Create test file (txt, pdf, image)
- [ ] In browser console, run:
  ```typescript
  import { storageService } from './src/api/services/storageService';
  
  // Test upload
  const file = new File(['test content'], 'test.txt');
  const result = await storageService.uploadFile('documents', file);
  console.log('Uploaded:', result.publicUrl);
  
  // Test delete
  await storageService.deleteFile('documents', result.key);
  console.log('Deleted successfully');
  ```
- [ ] Verify file appears in InsForge console
- [ ] Verify public URL is accessible
- [ ] Verify file deletion works

### Task 2.4: Documentation (15 min)
- [ ] Document bucket creation steps in README
- [ ] List bucket names and purposes
- [ ] Add CORS configuration to docs if needed
- [ ] Update deployment checklist

**Done Criteria**: ✅ Can upload and download files from all 6 buckets

---

## Sprint Task 3: Real-Time Component Integration (3-4 hours)

**Goal**: Integrate real-time subscriptions into list pages

### Task 3.1: Integrate into IncidentsPage (1 hour)
- [ ] Open `src/pages/IncidentsPage.tsx`
- [ ] Add imports:
  ```typescript
  import { useRealtimeSubscription } from '../api/hooks/useRealtime';
  import { realtimeService } from '../api/services/realtimeService';
  ```
- [ ] Add subscription in useEffect:
  ```typescript
  useEffect(() => {
    const unsubscribe = realtimeService.subscribeToTable(
      'incidents',
      {
        onInsert: (newIncident) => {
          setIncidents([...incidents, newIncident]);
        },
        onUpdate: (updatedIncident) => {
          setIncidents(incidents.map(i => i.id === updatedIncident.id ? updatedIncident : i));
        },
        onDelete: (id) => {
          setIncidents(incidents.filter(i => i.id !== id));
        },
      },
      { company_id: currentCompanyId }
    );
    return () => unsubscribe();
  }, []);
  ```
- [ ] Add "Live Updates" indicator to page header
- [ ] Test: Create incident in another tab, watch list update instantly

### Task 3.2: Integrate into TasksPage (1 hour)
- [ ] Open `src/pages/TasksPage.tsx`
- [ ] Repeat pattern from Task 3.1 but for 'tasks' table
- [ ] Filter by company_id and user's assigned tasks
- [ ] Test subscription updates

### Task 3.3: Integrate into ApprovalsPage (1 hour)
- [ ] Open `src/pages/ApprovalsPage.tsx` (or create if missing)
- [ ] Add subscription for 'approvals' table
- [ ] Include filter for approvals assigned to current user
- [ ] Test subscription updates

### Task 3.4: Add Notification Subscriptions (30 min)
- [ ] Add to Header component (show notification bell):
  ```typescript
  const unsubscribe = realtimeService.subscribeToUserNotifications(userId, {
    onNewNotification: (notification) => {
      setUnreadCount(unreadCount + 1);
    },
  });
  ```
- [ ] Update unread badge when new notification arrives
- [ ] Play sound effect when notification received (optional)

### Task 3.5: Testing (30 min)
- [ ] Open IncidentsPage in two browser tabs
- [ ] Create incident in Tab 1, watch Tab 2 update
- [ ] Edit incident in Tab 1, watch Tab 2 update
- [ ] Delete incident in Tab 1, watch Tab 2 update
- [ ] Repeat for TasksPage
- [ ] Test notification badge updates

### Task 3.6: Documentation (15 min)
- [ ] Document real-time integration pattern
- [ ] Add troubleshooting for WebSocket issues
- [ ] Document fallback to polling if WebSocket fails

**Done Criteria**: ✅ Two tabs stay in sync when incidents/tasks change

---

## Sprint Task 4: Form Submission Page (1-2 hours)

**Goal**: Create user-facing form submission page

### Task 4.1: Create FormSubmissionPage Component (45 min)
- [ ] Create `src/pages/FormSubmissionPage.tsx`:
  ```typescript
  import { useParams } from 'react-router-dom';
  import { FormSubmissionForm } from '../components/forms/FormSubmissionForm';
  import { formsService } from '../api/services/formsService';
  
  export function FormSubmissionPage() {
    const { templateId } = useParams();
    const [template, setTemplate] = useState(null);
    const [loading, setLoading] = useState(true);
    
    useEffect(() => {
      formsService.getFormTemplate(templateId)
        .then(setTemplate)
        .finally(() => setLoading(false));
    }, [templateId]);
    
    if (loading) return <LoadingSpinner />;
    if (!template) return <div>Form not found</div>;
    
    return (
      <div className="container">
        <FormSubmissionForm
          templateId={templateId}
          template={template}
          onSubmitSuccess={() => {
            // Redirect or show success
          }}
        />
      </div>
    );
  }
  ```
- [ ] Add route to Router:
  ```typescript
  <Route path="/forms/submit/:templateId" element={<FormSubmissionPage />} />
  ```

### Task 4.2: Test Form Submission (30 min)
- [ ] Create form template (go to FormsPage)
- [ ] Get template ID from URL
- [ ] Navigate to `/forms/submit/{templateId}`
- [ ] Fill out all form fields
- [ ] Click Submit
- [ ] Verify submission stored in database:
  ```sql
  SELECT * FROM form_submissions WHERE template_id = '{templateId}';
  ```
- [ ] Test validation (leave required field blank, try submit)
- [ ] Test file upload field
- [ ] Test all field types (text, select, date, etc.)

### Task 4.3: Add Navigation Links (15 min)
- [ ] In FormsPage, add "Fill Form" button for each template
- [ ] Button links to `/forms/submit/{templateId}`
- [ ] Style button to match design
- [ ] Test navigation

### Task 4.4: Add Confirmation Message (15 min)
- [ ] After successful submission, show success message
- [ ] Auto-redirect after 3 seconds or show "Back to Forms" link
- [ ] Clear form fields on success

**Done Criteria**: ✅ Can fill out and submit form, data saved to database

---

## Sprint Task 5: Create Remaining CRUD Modals (2-3 hours)

**Goal**: Copy IncidentEditModal pattern to other entities

### Task 5.1: Create ApprovalEditModal (30 min)
- [ ] Copy `src/components/incidents/IncidentEditModal.tsx` structure
- [ ] Create `src/components/approvals/ApprovalEditModal.tsx`
- [ ] Fields: status (pending/approved/rejected), notes, reviewer_comment
- [ ] Test in ApprovalsPage

### Task 5.2: Create RiskEditModal (30 min)
- [ ] Create `src/components/risks/RiskEditModal.tsx`
- [ ] Fields: title, description, risk_level, likelihood, impact, controls
- [ ] Test in RisksPage

### Task 5.3: Create TrainingEditModal (30 min)
- [ ] Create `src/components/training/TrainingEditModal.tsx`
- [ ] Fields: title, provider, expiry_date, status, certificate_file
- [ ] Test in TrainingPage

### Task 5.4: Create AuditEditModal (30 min)
- [ ] Create `src/components/audits/AuditEditModal.tsx`
- [ ] Fields: checklist_items, findings, status, evidence_files
- [ ] Test in AuditsPage

### Task 5.5: Integration Testing (1 hour)
- [ ] Test create → read → update → delete for each entity
- [ ] Verify modal opens with current data
- [ ] Verify save updates database
- [ ] Verify list refreshes after edit
- [ ] Verify validation errors show correctly

**Done Criteria**: ✅ All CRUD modals created and tested

---

## Sprint Task 6: End-to-End Testing (2-3 hours)

**Goal**: Verify complete user workflows work correctly

### Workflow 1: Company Registration
- [ ] Navigate to registration page
- [ ] Fill company info (name, employee count, license type)
- [ ] Create admin account
- [ ] Verify company created with correct employee limit
- [ ] Verify admin can log in
- [ ] Verify can access dashboard

### Workflow 2: User Invitation
- [ ] As admin, invite employee (invite@example.com)
- [ ] Check email for invite link (if email working)
- [ ] Click invite link (or manually navigate)
- [ ] Accept invite as new user
- [ ] Verify new user can access workspace
- [ ] Verify employee count increased by 1

### Workflow 3: Incident Reporting
- [ ] Create new incident (title, description, location)
- [ ] Verify incident appears in list
- [ ] Click edit, change status to "investigating"
- [ ] Verify status changed
- [ ] Verify incident created notification sent (if email working)
- [ ] Change status to "closed"
- [ ] Verify incident closed

### Workflow 4: Form Submission
- [ ] Go to Forms page
- [ ] Create new form template with 3 fields
- [ ] Get template ID
- [ ] Navigate to `/forms/submit/{templateId}`
- [ ] Fill all fields with valid data
- [ ] Click submit
- [ ] Verify success message
- [ ] Verify form_submissions table has new record

### Workflow 5: Real-Time Collaboration
- [ ] Open IncidentsPage in Tab 1
- [ ] Open same incident detail in Tab 2
- [ ] Create new incident in Tab 1
- [ ] Verify it appears in Tab 2's list instantly
- [ ] Edit incident in Tab 1
- [ ] Verify change appears in Tab 2 instantly

### Workflow 6: Document Upload
- [ ] Go to Documents page
- [ ] Upload test document
- [ ] Verify file appears in incident evidence bucket
- [ ] Get public URL and verify accessible
- [ ] Delete document, verify removal from storage

### Workflow 7: Security Settings
- [ ] Go to Settings > Security
- [ ] Change minimum password length to 12
- [ ] Try creating user with weak password
- [ ] Verify error shows all 4 failures
- [ ] Create user with strong password
- [ ] Verify success

### Testing Documentation
- [ ] Log all test results
- [ ] Document any issues found
- [ ] Create bug tickets for failures
- [ ] Verify all 7 workflows pass

**Done Criteria**: ✅ All 7 workflows complete without errors

---

## Sprint Task 7: Performance Testing (1-2 hours)

**Goal**: Ensure system performs well under load

### Test 1: Large List Performance (30 min)
- [ ] Create 100 incidents
- [ ] Verify IncidentsPage loads in < 2 seconds
- [ ] Verify real-time updates still work smoothly
- [ ] Check browser DevTools performance tab
- [ ] Look for memory leaks (check memory usage over 5 min)

### Test 2: Form Performance (30 min)
- [ ] Create 50-field form
- [ ] Open FormSubmissionForm
- [ ] Verify form loads in < 1 second
- [ ] Fill all fields
- [ ] Verify submit completes in < 2 seconds

### Test 3: Real-Time Scalability (30 min)
- [ ] Open IncidentsPage in 5 browser tabs
- [ ] Create/update incidents in multiple tabs
- [ ] Verify all tabs update in < 500ms
- [ ] Check server CPU/memory usage
- [ ] Verify no connection errors in console

### Documentation
- [ ] Document performance baseline
- [ ] List any slow operations found
- [ ] Create optimization tickets for Phase 3

**Done Criteria**: ✅ All workflows perform acceptably

---

## Sprint Task 8: Deployment Preparation (2-3 hours)

**Goal**: Prepare for production deployment

### Task 8.1: Code Review Checklist (45 min)
- [ ] Review all new Phase 2 code for:
  - [ ] No console.log() statements (use proper logging)
  - [ ] No hardcoded URLs (use environment variables)
  - [ ] No test/debug code (remove before merging)
  - [ ] Proper error handling on all async functions
  - [ ] TypeScript types defined everywhere
  - [ ] Functions documented with JSDoc comments

### Task 8.2: Environment Variables (30 min)
- [ ] Review `.env.local` template
- [ ] Verify all required variables documented
- [ ] Create `.env.production` with production values:
  ```
  REACT_APP_API_URL=https://safecloudafrica-api.vercel.app
  REACT_APP_ANON_KEY=production_key_here
  REACT_APP_EMAIL_FROM=noreply@safecloudafrica.com
  REACT_APP_ENABLE_REAL_TIME=true
  REACT_APP_ENABLE_EMAIL_NOTIFICATIONS=true
  REACT_APP_ENABLE_FORM_SUBMISSIONS=true
  ```
- [ ] Verify sensitive values not in repository
- [ ] Add variables to Vercel environment

### Task 8.3: Database Backup (30 min)
- [ ] Back up production database before deployment
- [ ] Test database restore procedure
- [ ] Verify form_submissions table backed up
- [ ] Document backup location

### Task 8.4: Rollback Plan (30 min)
- [ ] Document rollback steps if deployment fails
- [ ] List all changed database schema
- [ ] Prepare migration rollback scripts
- [ ] Document previous app version tag

### Task 8.5: Deployment Guide (30 min)
- [ ] Create step-by-step deployment guide
- [ ] List all pre-deployment checks
- [ ] Document post-deployment verification steps
- [ ] Create monitoring/alerting setup

**Done Criteria**: ✅ Deployment guide complete and reviewed

---

## Daily Standup Template

```
Yesterday:
- [ ] Task X - % complete
- [ ] Task Y - % complete

Today:
- [ ] Task Z - plan
- [ ] Code review

Blockers:
- [ ] None / List any blockers
```

---

## Acceptance Criteria - Full Phase 2 Complete

All of the following must be true:

- [ ] All 8 sprint tasks marked complete
- [ ] All code builds without errors (`npm run build`)
- [ ] All 7 end-to-end workflows pass
- [ ] Email service sends successfully
- [ ] Real-time updates work in all components
- [ ] Form submissions save to database
- [ ] All CRUD modals working (create, read, update, delete)
- [ ] Performance acceptable (loads < 2 seconds)
- [ ] Security policies enforced
- [ ] No critical bugs remaining
- [ ] Documentation updated
- [ ] Team approval for production deployment

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Email service fails | Implement fallback notification (in-app only) |
| Real-time subscriptions fail | Auto-fallback to polling every 10 seconds |
| Storage bucket missing | Graceful error message, can re-upload |
| Database schema issue | Rollback script prepared, team notified |
| Performance degradation | Monitor during deployment, rollback if needed |

---

## Success Metrics

- ✅ All tests passing
- ✅ Build time < 15 seconds
- ✅ Page load time < 2 seconds
- ✅ No critical bugs
- ✅ Email delivery > 95%
- ✅ Real-time latency < 500ms
- ✅ Zero data loss incidents
- ✅ 100% uptime after deployment

---

## Post-Deployment (Week 2)

- [ ] Monitor error logs for 7 days
- [ ] Monitor performance metrics
- [ ] Gather user feedback
- [ ] Fix any bugs found in production
- [ ] Plan Phase 3 features
- [ ] Schedule retrospective meeting

---

**Sprint Goal**: Complete remaining 10% and prepare Phase 2 for production deployment.

**Target Completion**: End of sprint (1 week)

**Success Criteria**: All tasks complete, all workflows tested, ready for production deployment
