import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { RequirePlatformAdmin } from './auth/RequirePlatformAdmin';
import { RequireWorkspace } from './auth/RequireWorkspace';
import { RequireSignedIn } from './auth/RequireSignedIn';
import { RequireCompanyRole } from './auth/RequireCompanyRole';
import { RequireModuleEnabled } from './auth/RequireModuleEnabled';
import { TenantProvider } from './tenant/TenantContext';
import { DashboardPage } from './pages/DashboardPage';
import { SafetyPage } from './pages/SafetyPage';
import { QualityPage } from './pages/QualityPage';
import { EnvironmentPage } from './pages/EnvironmentPage';
import { EnvironmentDashboardPage } from './pages/environment/EnvironmentDashboardPage';
import { EnvironmentEiaPage } from './pages/environment/EnvironmentEiaPage';
import { EnvironmentRiskOpportunityPage } from './pages/environment/EnvironmentRiskOpportunityPage';
import { EnvironmentWastePage } from './pages/environment/EnvironmentWastePage';
import { EnvironmentWaterPage } from './pages/environment/EnvironmentWaterPage';
import { EnvironmentAirPage } from './pages/environment/EnvironmentAirPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { FormsPage } from './pages/FormsPage';
import { TasksPage } from './pages/TasksPage';
import { IncidentsPage } from './pages/IncidentsPage';
import { TrainingPage } from './pages/TrainingPage';
import { AuditsPage } from './pages/AuditsPage';
import { InspectionsPage } from './pages/InspectionsPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ProfilePage } from './pages/ProfilePage';
import { HelpSupportPage } from './pages/HelpSupportPage';
import NCRsPage from './pages/NCRsPage';
import QualityCustomerComplaintsPage from './pages/QualityCustomerComplaintsPage';
import QualityInternalExternalIssuesPage from './pages/QualityInternalExternalIssuesPage';
import CalibrationPage from './pages/CalibrationPage';
import { RisksPage } from './pages/RisksPage';
import { PPEPage } from './pages/PPEPage';
import { LegalRegisterPage } from './pages/LegalRegisterPage';
import { LegalRequirementDetailPage } from './pages/LegalRequirementDetailPage';
import { LegalUpdatesPage } from './pages/LegalUpdatesPage';
import { UsersPage } from './pages/UsersPage';
import { PlanningReviewPage } from './pages/PlanningReviewPage';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { DocumentReviewsPage } from './pages/DocumentReviewsPage';
import { ReviewMeetingDetailPage } from './pages/ReviewMeetingDetailPage';
import { ReviewMeetingActionsBoardPage } from './pages/ReviewMeetingActionsBoardPage';
import { ImprovementPage } from './pages/ImprovementPage';
import { ImprovementDetailPage } from './pages/ImprovementDetailPage';
import { GeneralModulePage } from './pages/modules/GeneralModulePage';
import { HealthDashboardPage } from './pages/health/HealthDashboardPage';
import { HealthMedicalPage } from './pages/health/HealthMedicalPage';
import { HealthHygienePage } from './pages/health/HealthHygienePage';
import { HealthWellnessPage } from './pages/health/HealthWellnessPage';
import { LegalModulePage } from './pages/modules/LegalModulePage';
import { HRModulePage } from './pages/modules/HRModulePage';
import { SecurityModulePage } from './pages/modules/SecurityModulePage';
import { SafetyManagementPage } from './pages/modules/SafetyManagementPage';
import { IncidentAnalyticsPage } from './pages/IncidentAnalyticsPage';
import { HCSModulePage } from './pages/modules/HCSModulePage';
import { BBSPage } from './pages/features/BBSPage';
import { ContractorsVisitorsPage } from './pages/features/ContractorsVisitorsPage';
import { EmergencyPreparednessPage } from './pages/features/EmergencyPreparednessPage';
import { TemplateLibraryPage } from './pages/features/TemplateLibraryPage';
import { AssetManagementPage } from './pages/features/AssetManagementPage';
import { HazardousChemicalManagementPage } from './pages/features/HazardousChemicalManagementPage';
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
export function App() {
  return (
    <BrowserRouter>
      <TenantProvider>
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
            path="/dashboard/environment"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <EnvironmentDashboardPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/environment/eia"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <EnvironmentEiaPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/environment/risk-opportunity"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <EnvironmentRiskOpportunityPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/environment/waste"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <EnvironmentWastePage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/environment/water"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <EnvironmentWaterPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/environment/air"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <EnvironmentAirPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/modules/health"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <Navigate to="/dashboard/health" replace />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/health"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <HealthDashboardPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/health/medical"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <HealthMedicalPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/health/hygiene"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <HealthHygienePage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/health/wellness"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <HealthWellnessPage />
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
            path="/dashboard/quality/complaints"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <QualityCustomerComplaintsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/quality/issues"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <QualityInternalExternalIssuesPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/quality/calibration"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <CalibrationPage title="Quality Calibration Register" defaultModuleTag="Quality" />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/health/calibration"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <CalibrationPage title="Health Calibration Register" defaultModuleTag="Health" forceReadOnly />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/safety/calibration"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <CalibrationPage title="Safety Calibration Register" defaultModuleTag="Safety" forceReadOnly />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/environment/calibration"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <CalibrationPage title="Environment Calibration Register" defaultModuleTag="Environment" forceReadOnly />
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
            path="/dashboard/ppe"
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
            path="/dashboard/legal/register"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LegalRegisterPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/legal/register/:requirementId"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LegalRequirementDetailPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/legal/updates"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LegalUpdatesPage />
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
            path="/dashboard/document-reviews"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <DocumentReviewsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/document-reviews/new"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <ReviewMeetingDetailPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/document-reviews/new"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <ReviewMeetingDetailPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/document-reviews/actions"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <ReviewMeetingActionsBoardPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/document-reviews/actions"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <ReviewMeetingActionsBoardPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/document-reviews/:meetingId"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <ReviewMeetingDetailPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/document-reviews/:meetingId"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <ReviewMeetingDetailPage />
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
            path="/improvement/new"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <ImprovementDetailPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/improvement/:improvementId"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <ImprovementDetailPage />
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
            path="/dashboard/sellable/asset-management"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="asset_management">
                    <AssetManagementPage />
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/sellable/hazardous-chemicals"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="hazardous_chemical_management">
                    <HazardousChemicalManagementPage />
                  </RequireModuleEnabled>
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
      </TenantProvider>
    </BrowserRouter>);

}
