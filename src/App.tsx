import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { RequirePlatformAdmin } from './auth/RequirePlatformAdmin';
import { RequireWorkspace } from './auth/RequireWorkspace';
import { RequireSignedIn } from './auth/RequireSignedIn';
import { RequireCompanyRole } from './auth/RequireCompanyRole';
import { RequireSellableFeatureAccess } from './auth/RequireSellableFeatureAccess';
import { RequireActiveSubscription } from './auth/RequireActiveSubscription';
import { RequireModuleEnabled } from './auth/RequireModuleEnabled';
import { OwnerOnboardingGate } from './auth/OwnerOnboardingGate';
import { AuthSessionListener } from './auth/AuthSessionListener';
import { TenantProvider } from './tenant/TenantContext';
import { AppDashboardRedirect } from './components/AppDashboardRedirect';
import { SELLABLE_FEATURE_ROUTE_PATHS } from './api/services/sellableFeaturesService';
import { DraftManagerProvider } from './session/DraftManagerProvider';
import { SessionManagerProvider } from './session/SessionManagerProvider';
import * as LazyPages from './app/lazyPages';
export function App() {
  return (
    <BrowserRouter>
      <TenantProvider>
        <DraftManagerProvider>
          <SessionManagerProvider>
            <AuthSessionListener />
            <Suspense fallback={<RouteLoadingFallback />}>
              <Routes>
                {/* Public */}
                <Route path="/" element={<LazyPages.LandingPage />} />

                {/* Auth */}
                <Route path="/login" element={<LazyPages.LoginPage />} />
                <Route path="/register" element={<LazyPages.RegisterPage />} />
                <Route path="/forgot-password" element={<LazyPages.ForgotPasswordPage />} />
                <Route path="/reset-password" element={<LazyPages.ResetPasswordPage />} />
                <Route path="/logout" element={<LazyPages.LogoutPage />} />
                <Route path="/activate" element={<LazyPages.ActivateLicensePage />} />

                <Route
                  path="/billing"
                  element={
                    <RequireSignedIn>
                      <RequireWorkspace>
                        <LazyPages.BillingStatusPage />
                      </RequireWorkspace>
                    </RequireSignedIn>
                  }
                />
                <Route
                  path="/billing/status"
                  element={
                    <RequireSignedIn>
                      <RequireWorkspace>
                        <LazyPages.BillingStatusPage />
                      </RequireWorkspace>
                    </RequireSignedIn>
                  }
                />
                <Route
                  path="/access-denied"
                  element={
                    <RequireSignedIn>
                      <RequireWorkspace>
                        <LazyPages.AccessDeniedPage />
                      </RequireWorkspace>
                    </RequireSignedIn>
                  }
                />

                {/* Post-login onboarding (create workspace) */}
                <Route
                  path="/onboarding"
                  element={
                    <RequireSignedIn>
                      <LazyPages.WorkspaceOnboardingPage />
                    </RequireSignedIn>
                  }
                />

                {/* Demo seeding (disabled by default; env-gated) */}
                <Route path="/seed-demo" element={<LazyPages.SeedDemoPage />} />

                {/* Invite acceptance */}
                <Route path="/invite/accept" element={<LazyPages.InviteAcceptPage />} />
                <Route path="/invite/:inviteId" element={<LazyPages.InviteAcceptPage />} />
                <Route path="/accept-invite" element={<LazyPages.InviteAcceptPage />} />

                {/* Super Admin (platform-wide) */}
                <Route
                  path="/super-admin"
                  element={
                    <RequireSignedIn>
                      <RequirePlatformAdmin>
                        <LazyPages.SuperAdminLayout />
                      </RequirePlatformAdmin>
                    </RequireSignedIn>
                  }
                >
                  <Route index element={<Navigate to="overview" replace />} />
                  <Route path="overview" element={<LazyPages.SuperAdminOverviewPage />} />
                  <Route path="organisations" element={<LazyPages.SuperAdminOrganisationsPage />} />
                  <Route path="licenses" element={<LazyPages.SuperAdminLicensesPage />} />
                  <Route path="module-control" element={<LazyPages.SuperAdminModuleControlPage />} />
                  <Route path="sellable-features" element={<LazyPages.SuperAdminSellableFeaturesPage />} />
                  <Route path="audit-logs" element={<LazyPages.SuperAdminAuditLogsPage />} />
                  <Route path="support-mode" element={<LazyPages.SuperAdminSupportModePage />} />
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
                        <LazyPages.OwnerDashboardPage />
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
                      <LazyPages.OwnerOnboardingWizardPage />
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
                      <LazyPages.DashboardPage />
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
                      <LazyPages.DashboardPage />
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
                      <LazyPages.DashboardPage />
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
                      <LazyPages.EmployeeDashboardPage />
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
                      <LazyPages.ExternalDashboardPage />
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
                      <LazyPages.ExternalDashboardPage />
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
                    <LazyPages.GeneralModulePage />
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
                    <LazyPages.SafetyPage />
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
                  <LazyPages.SafetyManagementPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/incidents/analytics"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.IncidentAnalyticsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/analytics/safety-statistics"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.SafetyStatisticsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/analytics/compliance"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.ComplianceAnalyticsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/analytics/quality"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.QualityAnalyticsPage />
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
                    <LazyPages.QualityPage />
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
                    <LazyPages.EnvironmentPage />
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
                    <LazyPages.EnvironmentDashboardPage />
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
                    <LazyPages.EnvironmentEiaPage />
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
                    <LazyPages.EnvironmentRiskOpportunityPage />
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
                    <LazyPages.EnvironmentWastePage />
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
                    <LazyPages.EnvironmentWaterPage />
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
                    <LazyPages.EnvironmentAirPage />
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
                    <LazyPages.HealthDashboardPage />
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
                    <LazyPages.HealthMedicalPage />
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
                    <LazyPages.HealthHygienePage />
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
                    <LazyPages.HealthWellnessPage />
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
                    <LazyPages.LegalModulePage />
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
                    <Navigate to="/dashboard/hr" replace />
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
                    <LazyPages.HrDashboardPage />
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
                    <LazyPages.HrEmployeesPage />
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
                    <LazyPages.HrEmployeeProfilePage />
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
                    <LazyPages.HrDocumentsPage />
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
                    <LazyPages.HrRecruitmentPage />
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
                    <LazyPages.HrLabourPage />
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
                    <LazyPages.HrPerformancePage />
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
                    <LazyPages.HrHoursPage />
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
                    <LazyPages.HrLeavePage />
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
                    <LazyPages.HrSettingsPage />
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
                    <LazyPages.KPIModuleLayout />
                  </RequireModuleEnabled>
                </RequireWorkspace>
              </RequireSignedIn>
            }
          >
            <Route index element={<LazyPages.KPIDashboardPage />} />
            <Route path="assessments" element={<LazyPages.KPIAssessmentsListPage />} />
            <Route path="assessments/new" element={<LazyPages.KPIAssessmentCreatePage />} />
            <Route path="assessments/:assessmentId" element={<LazyPages.KPIAssessmentDetailPage />} />
            <Route path="library" element={<LazyPages.KPILibraryPage />} />
            <Route path="findings" element={<LazyPages.KPIFindingsListPage />} />
            <Route path="reports" element={<LazyPages.KPIReportsPage />} />
            <Route path="trends" element={<LazyPages.KPIAnalyticsPage />} />
            <Route path="*" element={<Navigate to="/modules/hr/kpis" replace />} />
          </Route>
          <Route
            path="/modules/security"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <RequireModuleEnabled module="security">
                    <LazyPages.SecurityModulePage />
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
                  <LazyPages.HCSModulePage />
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
                  <LazyPages.DocumentsPage />
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
                  <LazyPages.TasksPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/tasks/new"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.TasksPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/incidents"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.IncidentsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/incidents/new"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.IncidentsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/incidents/analysis"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.IncidentAnalyticsPage />
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
                    <LazyPages.QualityCustomerComplaintsPage />
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
                    <LazyPages.QualityInternalExternalIssuesPage />
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
                    <LazyPages.CalibrationPage title="Quality Calibration Register" defaultModuleTag="Quality" />
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
                  <LazyPages.CalibrationPage title="Health Calibration Register" defaultModuleTag="Health" forceReadOnly />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/safety/calibration"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.CalibrationPage title="Safety Calibration Register" defaultModuleTag="Safety" forceReadOnly />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/environment/calibration"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.CalibrationPage title="Environment Calibration Register" defaultModuleTag="Environment" forceReadOnly />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/training"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.TrainingPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/pjo"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.PjoPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/audits"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.AuditsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/audits/new"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.AuditsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/inspections"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.InspectionsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/inspections/new"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.InspectionsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/inspections/:inspectionId"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.InspectionDetailPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/inspection-runs/:runId/report"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.InspectionRunReportPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/risk-assessments"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.RisksPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/risk-assessments/new"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.RiskAssessmentCreatePage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/risk-assessments/:id"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.RiskAssessmentDetailPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/risk-assessments/:id/edit"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.RiskAssessmentEditPage />
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
                  <LazyPages.RiskAssessmentDetailPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/risks/:id/edit"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.RiskAssessmentEditPage />
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
                  <LazyPages.PPEPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/ppe"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.PPEPage />
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
                    <LazyPages.LegalRegisterPage />
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
                    <LazyPages.LegalRegisterPage />
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
                    <LazyPages.LegalRequirementDetailPage />
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
                    <LazyPages.LegalUpdatesPage />
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
                  <LazyPages.PlanningReviewPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/approvals"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.ApprovalsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/document-reviews"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.DocumentReviewsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/document-reviews"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.DocumentReviewsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/document-reviews/new"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.ReviewMeetingDetailPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/document-reviews/new"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.ReviewMeetingDetailPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/document-reviews/actions"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.ReviewMeetingActionsBoardPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/document-reviews/actions"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.ReviewMeetingActionsBoardPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/document-reviews/:meetingId"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.ReviewMeetingDetailPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/document-reviews/:meetingId"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.ReviewMeetingDetailPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/improvement"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.ImprovementPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/improvement/new"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.ImprovementDetailPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/improvement/:improvementId"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.ImprovementDetailPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/capa/new"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.CapaDetailPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/capa/:capaId"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.CapaDetailPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/reports"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.ReportsPage />
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
                  <LazyPages.IncidentsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/incidents/management/new"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.IncidentsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/incidents/analysis"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.IncidentAnalyticsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/management/tasks"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.TasksPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/management/tasks/new"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.TasksPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/management/tasks/:taskId"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.TaskDetailPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/tasks/:taskId"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.TaskDetailPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/tasks/:taskId"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.TaskDetailPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/management/ncrs"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.NCRsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/management/approvals"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.ApprovalsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/management/document-reviews"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.DocumentReviewsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/management/document-reviews/new"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.ReviewMeetingDetailPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/management/document-reviews/actions"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.ReviewMeetingActionsBoardPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/management/document-reviews/:meetingId"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.ReviewMeetingDetailPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/management/improvement"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.ImprovementPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/management/improvement/new"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.ImprovementDetailPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/management/improvement/:improvementId"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.ImprovementDetailPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/management/capa/new"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.CapaDetailPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/management/capa/:capaId"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.CapaDetailPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/management/reports"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.ReportsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/management/planning"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.PlanningReviewPage />
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
                  <LazyPages.AuditsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/operations/audits/new"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.AuditsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/operations/inspections"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.InspectionsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/operations/inspections/new"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.InspectionsPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/operations/training"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.TrainingPage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/dashboard/operations/pjo"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.PjoPage />
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
                  <LazyPages.PPEPage />
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
                    <LazyPages.BBSPage />
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
                    <LazyPages.ContractorsVisitorsPage />
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
                    <LazyPages.EmergencyPreparednessPage />
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
                    <LazyPages.TemplateLibraryPage />
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
                    <LazyPages.AssetManagementPage />
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
                    <LazyPages.HazardousChemicalManagementPage />
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
                    <LazyPages.SettingsPage />
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
                  <LazyPages.ProfilePage />
                </RequireWorkspace>
              </RequireSignedIn>
            }
          />
          <Route
            path="/help-support"
            element={
              <RequireSignedIn>
                <RequireWorkspace>
                  <LazyPages.HelpSupportPage />
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
                    <LazyPages.UsersPage />
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
          </SessionManagerProvider>
        </DraftManagerProvider>
      </TenantProvider>
    </BrowserRouter>
  );
}

/**
 * RouteLoadingFallback: Renders while lazy-loaded routes are loading.
 * This provides visual feedback during code-splitting delays.
 */
function RouteLoadingFallback() {
  return (
    <div className="flex items-center justify-center w-full h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>
  );
}
