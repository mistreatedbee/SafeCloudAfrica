import { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { RequirePlatformAdmin } from './auth/RequirePlatformAdmin';
import { RequireWorkspace } from './auth/RequireWorkspace';
import { RequireSignedIn } from './auth/RequireSignedIn';
import { RequireCompanyRole } from './auth/RequireCompanyRole';
import { RequireSellableFeatureAccess } from './auth/RequireSellableFeatureAccess';
import { RequireActiveSubscription } from './auth/RequireActiveSubscription';
import { RequireModuleEnabled } from './auth/RequireModuleEnabled';
import { RequireHrPersonnelAccess } from './auth/RequireHrPersonnelAccess';
import { RequireHrLeaveHoursAccess } from './auth/RequireHrLeaveHoursAccess';
import { RequireHealthMedicalAccess } from './auth/RequireHealthMedicalAccess';
import { OwnerOnboardingGate } from './auth/OwnerOnboardingGate';
import { AuthSessionListener } from './auth/AuthSessionListener';
import { TenantProvider } from './tenant/TenantContext';
import { AppDashboardRedirect } from './components/AppDashboardRedirect';
import { RouteSuspenseFallback } from './components/ui/RouteSuspenseFallback';
import {
  AccessDeniedPage,
  ActivateLicensePage,
  AdminLicensePage,
  ApprovalsPage,
  AssetManagementPage,
  AuditsPage,
  BBSPage,
  BillingStatusPage,
  CalibrationPage,
  CapaDetailPage,
  ComplianceAnalyticsPage,
  ContractorsVisitorsPage,
  DashboardPage,
  DocumentReviewsPage,
  DocumentsPage,
  EmergencyPreparednessPage,
  EmployeeDashboardPage,
  EnvironmentAirPage,
  EnvironmentDashboardPage,
  EnvironmentEiaPage,
  EnvironmentPage,
  EnvironmentRiskOpportunityPage,
  EnvironmentWastePage,
  EnvironmentWaterPage,
  ExternalDashboardPage,
  ForgotPasswordPage,
  GeneralModulePage,
  HazardousChemicalManagementPage,
  HCSModulePage,
  HealthDashboardPage,
  HealthHygienePage,
  HealthMedicalPage,
  HealthWellnessPage,
  HelpSupportPage,
  HoursWorkedPage,
  HrDashboardPage,
  HrDocumentsPage,
  HrEmployeeProfilePage,
  HrEmployeesPage,
  HrEmployeeWellnessPage,
  HrHoursPage,
  HrLabourPage,
  HrLeavePage,
  HrPerformancePage,
  HrRecruitmentPage,
  HrSettingsPage,
  ImprovementDetailPage,
  ImprovementPage,
  IncidentAnalyticsPage,
  IncidentsPage,
  InspectionDetailPage,
  InspectionRunReportPage,
  InspectionsPage,
  InviteAcceptPage,
  KPIAnalyticsPage,
  KPIAssessmentCreatePage,
  KPIAssessmentDetailPage,
  KPIAssessmentsListPage,
  KPIDashboardPage,
  KPIFindingsListPage,
  KPILibraryPage,
  KPIModuleLayout,
  KPIReportsPage,
  LandingPage,
  LegalModulePage,
  LegalRegisterPage,
  LegalRequirementDetailPage,
  LegalUpdatesPage,
  LoginPage,
  LogoutPage,
  NCRsPage,
  OperationalInputsPage,
  OwnerDashboardPage,
  OwnerOnboardingWizardPage,
  PjoPage,
  PlanningReviewPage,
  PPEPage,
  ProfilePage,
  QualityAnalyticsPage,
  QualityCustomerComplaintsPage,
  QualityInternalExternalIssuesPage,
  QualityPage,
  RegisterPage,
  ReportsPage,
  ResetPasswordPage,
  ReviewMeetingActionsBoardPage,
  ReviewMeetingDetailPage,
  RiskAssessmentCreatePage,
  RiskAssessmentDetailPage,
  RiskAssessmentEditPage,
  RisksPage,
  SafetyManagementPage,
  SafetyPage,
  SafetyStatisticsPage,
  SecurityModulePage,
  SecurityPage,
  SeedDemoPage,
  SettingsPage,
  SuperAdminAuditLogsPage,
  SuperAdminHealthPage,
  SuperAdminLayout,
  SuperAdminLicensesPage,
  SuperAdminModuleControlPage,
  SuperAdminOrganisationsPage,
  SuperAdminOverviewPage,
  SuperAdminSellableFeaturesPage,
  SuperAdminSupportModePage,
  TasksPage,
  TemplateLibraryPage,
  TrainingPage,
  UsersPage,
  WorkspaceOnboardingPage,
} from './app/lazyPages';
import { SELLABLE_FEATURE_ROUTE_PATHS } from './api/services/sellableFeaturesService';
export function App() {
  return (
    <BrowserRouter>
      <TenantProvider>
        <AuthSessionListener />
        <Suspense fallback={<RouteSuspenseFallback />}>
        <Routes>
          {/* Public */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/security" element={<SecurityPage />} />

          {/* Auth */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/logout" element={<LogoutPage />} />
          <Route path="/activate" element={<ActivateLicensePage />} />

          <Route
            path="/billing"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <BillingStatusPage />
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
            path="/access-denied"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <AccessDeniedPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />

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
          <Route path="/invite/accept" element={<InviteAcceptPage />} />
          <Route path="/invite/:inviteId" element={<InviteAcceptPage />} />
          <Route path="/accept-invite" element={<InviteAcceptPage />} />

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
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<SuperAdminOverviewPage />} />
            <Route path="organisations" element={<SuperAdminOrganisationsPage />} />
            <Route path="licenses" element={<SuperAdminLicensesPage />} />
            <Route path="module-control" element={<SuperAdminModuleControlPage />} />
            <Route path="sellable-features" element={<SuperAdminSellableFeaturesPage />} />
            <Route path="audit-logs" element={<SuperAdminAuditLogsPage />} />
            <Route path="platform-health" element={<SuperAdminHealthPage />} />
            <Route path="support-mode" element={<SuperAdminSupportModePage />} />
            <Route path="*" element={<Navigate to="overview" replace />} />
          </Route>

          {/* Protected app */}
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
          <Route
            path="/org/dashboard"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireActiveSubscription>
                    <RequireCompanyRole allowed={['owner']}>
                      <OwnerOnboardingGate>
                        <OwnerDashboardPage />
                      </OwnerOnboardingGate>
                    </RequireCompanyRole>
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
            path="/admin/dashboard"
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
            path="/manager/dashboard"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireActiveSubscription>
                    <RequireCompanyRole allowed={['manager']}>
                      <DashboardPage />
                    </RequireCompanyRole>
                  </RequireActiveSubscription>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/supervisor/dashboard"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireActiveSubscription>
                    <RequireCompanyRole allowed={['supervisor']}>
                      <DashboardPage />
                    </RequireCompanyRole>
                  </RequireActiveSubscription>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/employee/dashboard"
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
            path="/consultant/dashboard"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireActiveSubscription>
                    <RequireCompanyRole allowed={['consultant']}>
                      <ExternalDashboardPage />
                    </RequireCompanyRole>
                  </RequireActiveSubscription>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/auditor/dashboard"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireActiveSubscription>
                    <RequireCompanyRole allowed={['auditor']}>
                      <ExternalDashboardPage />
                    </RequireCompanyRole>
                  </RequireActiveSubscription>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route path="/owner" element={<Navigate to="/org/dashboard" replace />} />
          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/manager" element={<Navigate to="/app" replace />} />
          <Route path="/employee" element={<Navigate to="/employee/dashboard" replace />} />
          <Route path="/external" element={<Navigate to="/app" replace />} />

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
            path="/analytics/safety-statistics"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <SafetyStatisticsPage />
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
                  <QualityAnalyticsPage />
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
            path="/dashboard/environment"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="environment">
                    <EnvironmentDashboardPage />
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/environment/eia"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="environment">
                    <EnvironmentEiaPage />
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/environment/risk-opportunity"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="environment">
                    <EnvironmentRiskOpportunityPage />
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/environment/waste"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="environment">
                    <EnvironmentWastePage />
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/environment/water"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="environment">
                    <EnvironmentWaterPage />
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/environment/air"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="environment">
                    <EnvironmentAirPage />
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
                    <Navigate to="/dashboard/health" replace />
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/health"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="health">
                    <HealthDashboardPage />
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/health/medical"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="health">
                    <RequireHealthMedicalAccess>
                      <HealthMedicalPage />
                    </RequireHealthMedicalAccess>
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/health/hygiene"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="health">
                    <HealthHygienePage />
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/health/wellness"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="health">
                    <HealthWellnessPage />
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/health/wellness/employee-wellness"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="health">
                    <HrEmployeeWellnessPage />
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
                    <RequireHrPersonnelAccess>
                      <Navigate to="/dashboard/hr" replace />
                    </RequireHrPersonnelAccess>
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/hr"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="hr">
                    <RequireHrPersonnelAccess>
                      <HrDashboardPage />
                    </RequireHrPersonnelAccess>
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/hr/employees"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="hr">
                    <RequireHrPersonnelAccess>
                      <HrEmployeesPage />
                    </RequireHrPersonnelAccess>
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/hr/employees/:id"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="hr">
                    <RequireHrPersonnelAccess>
                      <HrEmployeeProfilePage />
                    </RequireHrPersonnelAccess>
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/hr/documents"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="hr">
                    <RequireHrPersonnelAccess>
                      <HrDocumentsPage />
                    </RequireHrPersonnelAccess>
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/hr/recruitment"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="hr">
                    <RequireHrPersonnelAccess>
                      <HrRecruitmentPage />
                    </RequireHrPersonnelAccess>
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/hr/labour"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="hr">
                    <RequireHrPersonnelAccess>
                      <HrLabourPage />
                    </RequireHrPersonnelAccess>
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/hr/performance"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="hr">
                    <RequireHrPersonnelAccess>
                      <HrPerformancePage />
                    </RequireHrPersonnelAccess>
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/hr/hours"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="hr">
                    <RequireHrLeaveHoursAccess>
                      <HrHoursPage />
                    </RequireHrLeaveHoursAccess>
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/hr/leave"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="hr">
                    <RequireHrLeaveHoursAccess>
                      <HrLeavePage />
                    </RequireHrLeaveHoursAccess>
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/hr/wellness"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="hr">
                    <RequireHrPersonnelAccess>
                      <Navigate to="/dashboard/health/wellness/employee-wellness" replace />
                    </RequireHrPersonnelAccess>
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/hr/settings"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="hr">
                    <RequireHrPersonnelAccess>
                      <HrSettingsPage />
                    </RequireHrPersonnelAccess>
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/modules/hr/kpis"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="hr">
                    <RequireHrPersonnelAccess>
                      <KPIModuleLayout />
                    </RequireHrPersonnelAccess>
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          >
            <Route index element={<KPIDashboardPage />} />
            <Route path="assessments" element={<KPIAssessmentsListPage />} />
            <Route path="assessments/new" element={<KPIAssessmentCreatePage />} />
            <Route path="assessments/:assessmentId" element={<KPIAssessmentDetailPage />} />
            <Route path="library" element={<KPILibraryPage />} />
            <Route path="findings" element={<KPIFindingsListPage />} />
            <Route path="reports" element={<KPIReportsPage />} />
            <Route path="trends" element={<KPIAnalyticsPage />} />
            <Route path="*" element={<Navigate to="/modules/hr/kpis" replace />} />
          </Route>
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
                  <Navigate to="/documents" replace />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/forms"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <Navigate to="/documents" replace />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/management/forms"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <Navigate to="/documents" replace />
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
            path="/incidents/analysis"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <IncidentAnalyticsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/ncrs"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <Navigate to="/dashboard/management/ncrs" replace />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/quality/complaints"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="quality">
                    <QualityCustomerComplaintsPage />
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/quality/issues"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="quality">
                    <QualityInternalExternalIssuesPage />
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/quality/calibration"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="quality">
                    <CalibrationPage title="Quality Calibration Register" defaultModuleTag="Quality" />
                  </RequireModuleEnabled>
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
            path="/inspection-runs/:runId/report"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <InspectionRunReportPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/risk-assessments"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RisksPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/risk-assessments/new"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RiskAssessmentCreatePage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/risk-assessments/:id"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RiskAssessmentDetailPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/risk-assessments/:id/edit"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RiskAssessmentEditPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route path="/risks" element={<Navigate to="/risk-assessments" replace />} />
          <Route path="/risks/new" element={<Navigate to="/risk-assessments/new" replace />} />
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
            path="/risks/:id/edit"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RiskAssessmentEditPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route path="/risks/dashboard" element={<Navigate to="/risk-assessments" replace />} />
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
                  <RequireModuleEnabled module="legal">
                    <LegalRegisterPage />
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/legal/register"
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
            path="/dashboard/legal/register/:requirementId"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="legal">
                    <LegalRequirementDetailPage />
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/legal/updates"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="legal">
                    <LegalUpdatesPage />
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
            path="/capa/new"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <CapaDetailPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/capa/:capaId"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <CapaDetailPage />
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

          {/* Canonical dashboard nested aliases */}
          <Route
            path="/dashboard/incidents/management"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <IncidentsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/incidents/management/new"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <IncidentsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/incidents/analysis"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <IncidentAnalyticsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/management/tasks"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <TasksPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/management/tasks/new"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <TasksPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/management/ncrs"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <NCRsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/management/approvals"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <ApprovalsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/management/document-reviews"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <DocumentReviewsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/management/document-reviews/new"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <ReviewMeetingDetailPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/management/document-reviews/actions"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <ReviewMeetingActionsBoardPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/management/document-reviews/:meetingId"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <ReviewMeetingDetailPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/management/improvement"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <ImprovementPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/management/improvement/new"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <ImprovementDetailPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/management/improvement/:improvementId"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <ImprovementDetailPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/management/capa/new"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <CapaDetailPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/management/capa/:capaId"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <CapaDetailPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/management/reports"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <ReportsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/management/planning"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <PlanningReviewPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/management/hours-worked"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <HoursWorkedPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/management/operational-inputs"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <OperationalInputsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/operations/audits"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <AuditsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/operations/audits/new"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <AuditsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/operations/inspections"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <InspectionsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/operations/inspections/new"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <InspectionsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/operations/training"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <TrainingPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/operations/pjo"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <PjoPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/operations/risks"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <Navigate to="/risk-assessments" replace />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/operations/ppe"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <PPEPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />

          {/* Sellable feature modules (Phase 1 placeholders) */}
          <Route
            path={SELLABLE_FEATURE_ROUTE_PATHS.bbs}
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireSellableFeatureAccess featureKey="bbs">
                    <BBSPage />
                  </RequireSellableFeatureAccess>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path={SELLABLE_FEATURE_ROUTE_PATHS.contractorsVisitors}
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireSellableFeatureAccess featureKey="contractorsVisitors">
                    <ContractorsVisitorsPage />
                  </RequireSellableFeatureAccess>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path={SELLABLE_FEATURE_ROUTE_PATHS.emergencyPreparedness}
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireSellableFeatureAccess featureKey="emergencyPreparedness">
                    <EmergencyPreparednessPage />
                  </RequireSellableFeatureAccess>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path={SELLABLE_FEATURE_ROUTE_PATHS.templateLibrary}
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireSellableFeatureAccess featureKey="templateLibrary">
                    <TemplateLibraryPage />
                  </RequireSellableFeatureAccess>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path={SELLABLE_FEATURE_ROUTE_PATHS.assetManagement}
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireSellableFeatureAccess featureKey="assetManagement">
                    <AssetManagementPage />
                  </RequireSellableFeatureAccess>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path={SELLABLE_FEATURE_ROUTE_PATHS.hazardousChemicals}
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireSellableFeatureAccess featureKey="hazardousChemicals">
                    <HazardousChemicalManagementPage />
                  </RequireSellableFeatureAccess>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route path="/bbs" element={<Navigate to={SELLABLE_FEATURE_ROUTE_PATHS.bbs} replace />} />
          <Route path="/contractors" element={<Navigate to={SELLABLE_FEATURE_ROUTE_PATHS.contractorsVisitors} replace />} />
          <Route path="/emergency" element={<Navigate to={SELLABLE_FEATURE_ROUTE_PATHS.emergencyPreparedness} replace />} />
          <Route path="/templates" element={<Navigate to={SELLABLE_FEATURE_ROUTE_PATHS.templateLibrary} replace />} />

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
                  <RequireCompanyRole allowed={['owner', 'admin']}>
                    <AdminLicensePage />
                  </RequireCompanyRole>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </TenantProvider>
    </BrowserRouter>);

}
