import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthSessionListener } from './auth/AuthSessionListener';
import { RequirePlatformAdmin } from './auth/RequirePlatformAdmin';
import { RequireWorkspace } from './auth/RequireWorkspace';
import { RequireSignedIn } from './auth/RequireSignedIn';
import { RequireCompanyRole } from './auth/RequireCompanyRole';
import { RequireActiveSubscription } from './auth/RequireActiveSubscription';
import { RequireModuleEnabled } from './auth/RequireModuleEnabled';
import { OwnerOnboardingGate } from './auth/OwnerOnboardingGate';
import { TenantProvider } from './tenant/TenantContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DashboardPage } from './pages/DashboardPage';
import { SafetyPage } from './pages/SafetyPage';
import { QualityPage } from './pages/QualityPage';
import { EnvironmentPage } from './pages/EnvironmentPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { FormsPage } from './pages/FormsPage';
import { TasksPage } from './pages/TasksPage';
import { TaskDetailPage } from './pages/TaskDetailPage';
import { IncidentsPage } from './pages/IncidentsPage';
import { PjoPage } from './pages/PjoPage';
import { TrainingPage } from './pages/TrainingPage';
import { AuditsPage } from './pages/AuditsPage';
import { AuditDetailPage } from './pages/AuditDetailPage';
import { InspectionsPage } from './pages/InspectionsPage';
import { InspectionDetailPage } from './pages/InspectionDetailPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { BillingPricingPage } from './pages/BillingPricingPage';
import { BillingStatusPage } from './pages/BillingStatusPage';
import { ProfilePage } from './pages/ProfilePage';
import { HelpSupportPage } from './pages/HelpSupportPage';
import NCRsPage from './pages/NCRsPage';
import { RisksPage } from './pages/RisksPage';
import { RiskReviewsPage } from './pages/RiskReviewsPage';
import { RiskAssessmentDashboardPage } from './pages/risks/RiskAssessmentDashboardPage';
import { RiskAssessmentCreatePage } from './pages/risks/RiskAssessmentCreatePage';
import { RiskAssessmentDetailPage } from './pages/risks/RiskAssessmentDetailPage';
import { PreWorkInstancesPage } from './pages/risks/PreWorkInstancesPage';
import { PPEPage } from './pages/PPEPage';
import { LegalRegisterPage } from './pages/LegalRegisterPage';
import { UsersPage } from './pages/UsersPage';
import { AdminLicensePage } from './pages/admin/AdminLicensePage';
import { PlanningReviewPage } from './pages/PlanningReviewPage';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { DocumentReviewsPage } from './pages/DocumentReviewsPage';
import { ImprovementPage } from './pages/ImprovementPage';
import { GeneralModulePage } from './pages/modules/GeneralModulePage';
import { HealthModulePage } from './pages/modules/HealthModulePage';
import { LegalModulePage } from './pages/modules/LegalModulePage';
import { HRModulePage } from './pages/modules/HRModulePage';
import { SecurityModulePage } from './pages/modules/SecurityModulePage';
import { SafetyManagementPage } from './pages/modules/SafetyManagementPage';
import { HoursWorkedPage } from './pages/management/HoursWorkedPage';
import { OperationalInputsPage } from './pages/management/OperationalInputsPage';
import { IncidentAnalyticsPage } from './pages/IncidentAnalyticsPage';
import { SafetyStatisticsPage } from './pages/analytics/SafetyStatisticsPage';
import { ComplianceAnalyticsPage } from './pages/analytics/ComplianceAnalyticsPage';
import { QualityAnalyticsPage } from './pages/analytics/QualityAnalyticsPage';
import { EnvironmentalAnalyticsPage } from './pages/analytics/EnvironmentalAnalyticsPage';
import { InspectionAnalyticsPage } from './pages/InspectionAnalyticsPage';
import { InspectionRunReportPage } from './pages/InspectionRunReportPage';
import { PjoAnalyticsPage } from './pages/PjoAnalyticsPage';
import { HCSModulePage } from './pages/modules/HCSModulePage';
import { BBSPage } from './pages/features/BBSPage';
import { ContractorsVisitorsPage } from './pages/features/ContractorsVisitorsPage';
import { EmergencyPreparednessPage } from './pages/features/EmergencyPreparednessPage';
import { TemplateLibraryPage } from './pages/features/TemplateLibraryPage';
import { LogoutPage } from './pages/auth/LogoutPage';
import { InviteAcceptPage } from './pages/auth/InviteAcceptPage';
import { InviteAcceptByTokenPage } from './pages/auth/InviteAcceptByTokenPage';
import { LoginPage } from './pages/auth/LoginPage';
import { ActivateLicensePage } from './pages/activate/ActivateLicensePage';
import { OwnerOnboardingWizardPage } from './pages/owner/OwnerOnboardingWizardPage';
import { OwnerDashboardPage } from './pages/owner/OwnerDashboardPage';
import { EmployeeDashboardPage } from './pages/employee/EmployeeDashboardPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';
import { LandingPage } from './pages/marketing/LandingPage';
import { SuperAdminLayout } from './components/layout/SuperAdminLayout';
import { SuperAdminOverviewPage } from './pages/admin/superadmin/SuperAdminOverviewPage';
import { SuperAdminOrganisationsPage } from './pages/admin/superadmin/SuperAdminOrganisationsPage';
import { SuperAdminLicensesPage } from './pages/admin/superadmin/SuperAdminLicensesPage';
import { SuperAdminModuleControlPage } from './pages/admin/superadmin/SuperAdminModuleControlPage';
import { SuperAdminUsersPage } from './pages/admin/superadmin/SuperAdminUsersPage';
import { SuperAdminAuditLogsPage } from './pages/admin/superadmin/SuperAdminAuditLogsPage';
import { SuperAdminSupportModePage } from './pages/admin/superadmin/SuperAdminSupportModePage';
import { SeedDemoPage } from './pages/admin/SeedDemoPage';
import { ExternalDashboardPage } from './pages/external/ExternalDashboardPage';
import { AccessDeniedPage } from './pages/AccessDeniedPage';
import { AppDashboardRedirect } from './components/AppDashboardRedirect';
import { WorkspaceOnboardingPage } from './pages/onboarding/WorkspaceOnboardingPage';
import { KPIModuleLayout } from './pages/kpi/KPIModuleLayout';
import { KPIDashboardPage } from './pages/kpi/KPIDashboardPage';
import { KPIAssessmentsListPage } from './pages/kpi/KPIAssessmentsListPage';
import { KPIAssessmentCreatePage } from './pages/kpi/KPIAssessmentCreatePage';
import { KPIAssessmentDetailPage } from './pages/kpi/KPIAssessmentDetailPage';
import { KPIFindingsListPage } from './pages/kpi/KPIFindingsListPage';
import { KPIReportsPage } from './pages/kpi/KPIReportsPage';
import { KPIAnalyticsPage } from './pages/kpi/KPIAnalyticsPage';
import { KPILibraryPage } from './pages/kpi/KPILibraryPage';
export function App() {
  return (
    <BrowserRouter>
      <AuthSessionListener />
      <TenantProvider>
        <ErrorBoundary>
          <Routes>
          {/* Public */}
          <Route path="/" element={<LandingPage />} />

          {/* Auth */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/logout" element={<LogoutPage />} />

          {/* License activation (public) */}
          <Route path="/activate" element={<ActivateLicensePage />} />

          {/* Post-login onboarding (create workspace) */}
          <Route
            path="/onboarding"
            element={
              <RequireSignedIn>
                <WorkspaceOnboardingPage />
              </RequireSignedIn>
            }
          />

          {/* Demo seeding (disabled by default; env-gated) */}
          <Route path="/seed-demo" element={<SeedDemoPage />} />

          {/* Invite acceptance */}
          <Route path="/invite/accept" element={<InviteAcceptByTokenPage />} />
          <Route path="/invite/:inviteId" element={<InviteAcceptPage />} />

          {/* Access denied (role guard redirect) */}
          <Route
            path="/access-denied"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <AccessDeniedPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />

          {/* Super Admin (platform-wide) */}
          <Route
            path="/super-admin"
            element={
              <RequireSignedIn>
                <RequirePlatformAdmin>
                  <SuperAdminLayout />
                </RequirePlatformAdmin>
              </RequireSignedIn>
            }
          >
            <Route index element={<Navigate to="/super-admin/overview" replace />} />
            <Route path="overview" element={<SuperAdminOverviewPage />} />
            <Route path="organisations" element={<SuperAdminOrganisationsPage />} />
            <Route path="licenses" element={<SuperAdminLicensesPage />} />
            <Route path="module-control" element={<SuperAdminModuleControlPage />} />
            <Route path="users" element={<SuperAdminUsersPage />} />
            <Route path="audit-logs" element={<SuperAdminAuditLogsPage />} />
            <Route path="support-mode" element={<SuperAdminSupportModePage />} />
          </Route>

          {/* Protected app: redirect to role-based dashboard */}
          <Route
            path="/app"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireActiveSubscription>
                    <AppDashboardRedirect />
                  </RequireActiveSubscription>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />

          {/* Role-based dashboard aliases (same content as /app) */}
          <Route
            path="/owner"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireActiveSubscription>
                    <OwnerOnboardingGate>
                      <RequireCompanyRole allowed={['owner']}>
                        <OwnerDashboardPage />
                      </RequireCompanyRole>
                    </OwnerOnboardingGate>
                  </RequireActiveSubscription>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/owner/onboarding"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireActiveSubscription>
                    <RequireCompanyRole allowed={['owner']}>
                      <OwnerOnboardingWizardPage />
                    </RequireCompanyRole>
                  </RequireActiveSubscription>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireActiveSubscription>
                    <RequireCompanyRole allowed={['admin']}>
                      <DashboardPage />
                    </RequireCompanyRole>
                  </RequireActiveSubscription>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/manager"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireActiveSubscription>
                    <RequireCompanyRole allowed={['manager', 'supervisor']}>
                      <DashboardPage />
                    </RequireCompanyRole>
                  </RequireActiveSubscription>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/employee"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireActiveSubscription>
                    <RequireCompanyRole allowed={['employee']}>
                      <EmployeeDashboardPage />
                    </RequireCompanyRole>
                  </RequireActiveSubscription>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/consultant"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireActiveSubscription>
                    <Navigate to="/external" replace />
                  </RequireActiveSubscription>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/auditor"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireActiveSubscription>
                    <Navigate to="/external" replace />
                  </RequireActiveSubscription>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/external"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireActiveSubscription>
                    <RequireCompanyRole allowed={['consultant', 'auditor']}>
                      <ExternalDashboardPage />
                    </RequireCompanyRole>
                  </RequireActiveSubscription>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />

          {/* Modules */}
          <Route
            path="/modules/general"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="general">
                    <GeneralModulePage />
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/modules/safety"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="safety">
                    <SafetyPage />
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/modules/safety-management"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="safety">
                    <SafetyManagementPage />
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/management/hours-worked"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <HoursWorkedPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/management/operational-inputs"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <OperationalInputsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/incidents/analytics"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="safety">
                    <IncidentAnalyticsPage />
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/analytics/safety-statistics"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="safety">
                    <SafetyStatisticsPage />
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/analytics/compliance"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <ComplianceAnalyticsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/analytics/quality"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="quality">
                    <QualityAnalyticsPage />
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/analytics/environmental"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="environment">
                    <EnvironmentalAnalyticsPage />
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/inspections/analytics"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <InspectionAnalyticsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/pjo/analytics"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <PjoAnalyticsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/modules/quality"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="quality">
                    <QualityPage />
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/modules/environment"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="environment">
                    <EnvironmentPage />
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/modules/health"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="health">
                    <HealthModulePage />
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/modules/legal"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="legal">
                    <LegalModulePage />
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/modules/hr"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="hr">
                    <HRModulePage />
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/modules/security"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="security">
                    <SecurityModulePage />
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/modules/hcs"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="health">
                    <HCSModulePage />
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />

          {/* Supporting Sections */}
          <Route
            path="/documents"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <DocumentsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/forms"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <FormsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/tasks"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <TasksPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/tasks/new"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <TasksPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/tasks/:taskId"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <TaskDetailPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/incidents"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <IncidentsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/pjo"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <PjoPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/incidents/new"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <IncidentsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/ncrs"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <NCRsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/training"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <TrainingPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route path="/hr/kpis" element={<Navigate to="/modules/hr/kpis" replace />} />
          <Route path="/modules/hr/kpis" element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="hr">
                    <KPIModuleLayout />
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }>
            <Route index element={<KPIDashboardPage />} />
            <Route path="assessments" element={<KPIAssessmentsListPage />} />
            <Route path="assessments/new" element={<KPIAssessmentCreatePage />} />
            <Route path="assessments/:assessmentId" element={<KPIAssessmentDetailPage />} />
            <Route path="library" element={<KPILibraryPage />} />
            <Route path="findings" element={<KPIFindingsListPage />} />
            <Route path="reports" element={<KPIReportsPage />} />
            <Route path="trends" element={<KPIAnalyticsPage />} />
          </Route>
          <Route
            path="/audits"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <AuditsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/audits/new"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <AuditsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/audits/:auditId"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <AuditDetailPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/inspections"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <InspectionsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/inspections/new"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <InspectionsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/inspections/:inspectionId"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <InspectionDetailPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/inspections/runs/:runId/report"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <InspectionRunReportPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/risks/dashboard"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RiskAssessmentDashboardPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/risks/new"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireCompanyRole allowed={['owner', 'admin', 'manager', 'supervisor']}>
                    <RiskAssessmentCreatePage />
                  </RequireCompanyRole>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/risks/prework"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <PreWorkInstancesPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/risks/reviews"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RiskReviewsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/risks/:id"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RiskAssessmentDetailPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/risks"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RisksPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/ppe"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <PPEPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/legal-register"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="legal">
                    <LegalRegisterPage />
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/planning"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <PlanningReviewPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/approvals"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <ApprovalsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/document-reviews"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <DocumentReviewsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/improvement"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <ImprovementPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/reports"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <ReportsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />

          {/* Sellable feature modules (Phase 1 placeholders) */}
          <Route
            path="/bbs"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <BBSPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/contractors"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <ContractorsVisitorsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/emergency"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <EmergencyPreparednessPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/templates"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <TemplateLibraryPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />

          <Route
            path="/settings"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireCompanyRole allowed={['owner', 'admin', 'manager']}>
                    <SettingsPage />
                  </RequireCompanyRole>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/billing"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireCompanyRole allowed={['owner', 'admin', 'manager']}>
                    <BillingPricingPage />
                  </RequireCompanyRole>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/billing/status"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <BillingStatusPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/profile"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <ProfilePage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/help-support"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <HelpSupportPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/users"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireCompanyRole allowed={['owner', 'admin', 'manager']}>
                    <UsersPage />
                  </RequireCompanyRole>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/admin/license"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireActiveSubscription>
                    <RequireCompanyRole allowed={['owner', 'admin']}>
                      <AdminLicensePage />
                    </RequireCompanyRole>
                  </RequireActiveSubscription>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ErrorBoundary>
      </TenantProvider>
    </BrowserRouter>);

}