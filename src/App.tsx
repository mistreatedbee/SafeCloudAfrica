import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { RequirePlatformAdmin } from './auth/RequirePlatformAdmin';
import { RequireWorkspace } from './auth/RequireWorkspace';
import { RequireSignedIn } from './auth/RequireSignedIn';
import { RequireCompanyRole } from './auth/RequireCompanyRole';
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
import { IncidentAnalyticsPage } from './pages/IncidentAnalyticsPage';
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
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';
import { LandingPage } from './pages/marketing/LandingPage';
import { SuperAdminPage } from './pages/admin/SuperAdminPage';
import { SeedDemoPage } from './pages/admin/SeedDemoPage';
import { WorkspaceOnboardingPage } from './pages/onboarding/WorkspaceOnboardingPage';
import { HrKpisPage } from './pages/HrKpisPage';
export function App() {
  return (
    <BrowserRouter>
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
          <Route path="/invite/:inviteId" element={<InviteAcceptPage />} />

          {/* Super Admin (platform-wide) */}
          <Route
            path="/super-admin"
            element={
              <RequireSignedIn>
                <RequirePlatformAdmin>
                  <SuperAdminPage />
                </RequirePlatformAdmin>
              </RequireSignedIn>
            }
          />

          {/* Protected app */}
          <Route
            path="/app"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <DashboardPage />
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
                  <GeneralModulePage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/modules/safety"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <SafetyPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/modules/safety-management"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <SafetyManagementPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/incidents/analytics"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <IncidentAnalyticsPage />
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
                  <QualityPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/modules/environment"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <EnvironmentPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/modules/health"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <HealthModulePage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/modules/legal"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LegalModulePage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/modules/hr"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <HRModulePage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/modules/security"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <SecurityModulePage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/modules/hcs"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <HCSModulePage />
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
          <Route
            path="/hr/kpis"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <HrKpisPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
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
                  <RequireCompanyRole allowed={['admin', 'manager', 'supervisor']}>
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
                  <LegalRegisterPage />
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
                  <RequireCompanyRole allowed={['admin', 'manager']}>
                    <SettingsPage />
                  </RequireCompanyRole>
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
                  <RequireCompanyRole allowed={['admin', 'manager']}>
                    <UsersPage />
                  </RequireCompanyRole>
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