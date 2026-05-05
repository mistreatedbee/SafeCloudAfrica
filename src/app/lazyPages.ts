import { lazy } from 'react';

export const DashboardPage = lazy(() =>
  import('../pages/DashboardPage').then((m) => ({ default: m.DashboardPage }))
);
export const SafetyPage = lazy(() => import('../pages/SafetyPage').then((m) => ({ default: m.SafetyPage })));
export const QualityPage = lazy(() => import('../pages/QualityPage').then((m) => ({ default: m.QualityPage })));
export const EnvironmentPage = lazy(() =>
  import('../pages/EnvironmentPage').then((m) => ({ default: m.EnvironmentPage }))
);
export const EnvironmentDashboardPage = lazy(() =>
  import('../pages/environment/EnvironmentDashboardPage').then((m) => ({ default: m.EnvironmentDashboardPage }))
);
export const EnvironmentEiaPage = lazy(() =>
  import('../pages/environment/EnvironmentEiaPage').then((m) => ({ default: m.EnvironmentEiaPage }))
);
export const EnvironmentRiskOpportunityPage = lazy(() =>
  import('../pages/environment/EnvironmentRiskOpportunityPage').then((m) => ({
    default: m.EnvironmentRiskOpportunityPage,
  }))
);
export const EnvironmentWastePage = lazy(() =>
  import('../pages/environment/EnvironmentWastePage').then((m) => ({ default: m.EnvironmentWastePage }))
);
export const EnvironmentWaterPage = lazy(() =>
  import('../pages/environment/EnvironmentWaterPage').then((m) => ({ default: m.EnvironmentWaterPage }))
);
export const EnvironmentAirPage = lazy(() =>
  import('../pages/environment/EnvironmentAirPage').then((m) => ({ default: m.EnvironmentAirPage }))
);
export const DocumentsPage = lazy(() =>
  import('../pages/DocumentsPage').then((m) => ({ default: m.DocumentsPage }))
);
export const TasksPage = lazy(() => import('../pages/TasksPage').then((m) => ({ default: m.TasksPage })));
export const IncidentsPage = lazy(() =>
  import('../pages/IncidentsPage').then((m) => ({ default: m.IncidentsPage }))
);
export const TrainingPage = lazy(() =>
  import('../pages/TrainingPage').then((m) => ({ default: m.TrainingPage }))
);
export const AuditsPage = lazy(() => import('../pages/AuditsPage').then((m) => ({ default: m.AuditsPage })));
export const InspectionsPage = lazy(() =>
  import('../pages/InspectionsPage').then((m) => ({ default: m.InspectionsPage }))
);
export const InspectionDetailPage = lazy(() =>
  import('../pages/InspectionDetailPage').then((m) => ({ default: m.InspectionDetailPage }))
);
export const InspectionRunReportPage = lazy(() =>
  import('../pages/InspectionRunReportPage').then((m) => ({ default: m.InspectionRunReportPage }))
);
export const ReportsPage = lazy(() =>
  import('../pages/ReportsPage').then((m) => ({ default: m.ReportsPage }))
);
export const SettingsPage = lazy(() =>
  import('../pages/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);
export const ProfilePage = lazy(() =>
  import('../pages/ProfilePage').then((m) => ({ default: m.ProfilePage }))
);
export const HelpSupportPage = lazy(() =>
  import('../pages/HelpSupportPage').then((m) => ({ default: m.HelpSupportPage }))
);
export const SupportTicketDetailPage = lazy(() =>
  import('../pages/SupportTicketDetailPage').then((m) => ({ default: m.SupportTicketDetailPage }))
);
export const NCRsPage = lazy(() => import('../pages/NCRsPage'));
export const QualityCustomerComplaintsPage = lazy(() => import('../pages/QualityCustomerComplaintsPage'));
export const QualityInternalExternalIssuesPage = lazy(() =>
  import('../pages/QualityInternalExternalIssuesPage')
);
export const CalibrationPage = lazy(() => import('../pages/CalibrationPage'));
export const RisksPage = lazy(() => import('../pages/RisksPage').then((m) => ({ default: m.RisksPage })));
export const RiskAssessmentCreatePage = lazy(() =>
  import('../pages/risks/RiskAssessmentCreatePage').then((m) => ({ default: m.RiskAssessmentCreatePage }))
);
export const RiskAssessmentDetailPage = lazy(() =>
  import('../pages/risks/RiskAssessmentDetailPage').then((m) => ({ default: m.RiskAssessmentDetailPage }))
);
export const RiskAssessmentEditPage = lazy(() =>
  import('../pages/risks/RiskAssessmentEditPage').then((m) => ({ default: m.RiskAssessmentEditPage }))
);
export const PPEPage = lazy(() => import('../pages/PPEPage').then((m) => ({ default: m.PPEPage })));
export const LegalRegisterPage = lazy(() =>
  import('../pages/LegalRegisterPage').then((m) => ({ default: m.LegalRegisterPage }))
);
export const LegalRequirementDetailPage = lazy(() =>
  import('../pages/LegalRequirementDetailPage').then((m) => ({ default: m.LegalRequirementDetailPage }))
);
export const LegalUpdatesPage = lazy(() =>
  import('../pages/LegalUpdatesPage').then((m) => ({ default: m.LegalUpdatesPage }))
);
export const UsersPage = lazy(() => import('../pages/UsersPage').then((m) => ({ default: m.UsersPage })));
export const PlanningReviewPage = lazy(() =>
  import('../pages/PlanningReviewPage').then((m) => ({ default: m.PlanningReviewPage }))
);
export const ObjectivesTargetsPage = lazy(() =>
  import('../pages/ObjectivesTargetsPage').then((m) => ({ default: m.ObjectivesTargetsPage }))
);
export const ApprovalsPage = lazy(() =>
  import('../pages/ApprovalsPage').then((m) => ({ default: m.ApprovalsPage }))
);
export const DocumentReviewsPage = lazy(() =>
  import('../pages/DocumentReviewsPage').then((m) => ({ default: m.DocumentReviewsPage }))
);
export const ReviewMeetingDetailPage = lazy(() =>
  import('../pages/ReviewMeetingDetailPage').then((m) => ({ default: m.ReviewMeetingDetailPage }))
);
export const ReviewMeetingActionsBoardPage = lazy(() =>
  import('../pages/ReviewMeetingActionsBoardPage').then((m) => ({ default: m.ReviewMeetingActionsBoardPage }))
);
export const ImprovementPage = lazy(() =>
  import('../pages/ImprovementPage').then((m) => ({ default: m.ImprovementPage }))
);
export const ImprovementDetailPage = lazy(() =>
  import('../pages/ImprovementDetailPage').then((m) => ({ default: m.ImprovementDetailPage }))
);
export const CapaDetailPage = lazy(() =>
  import('../pages/CapaDetailPage').then((m) => ({ default: m.CapaDetailPage }))
);
export const GeneralModulePage = lazy(() =>
  import('../pages/modules/GeneralModulePage').then((m) => ({ default: m.GeneralModulePage }))
);
export const HealthDashboardPage = lazy(() =>
  import('../pages/health/HealthDashboardPage').then((m) => ({ default: m.HealthDashboardPage }))
);
export const HealthMedicalPage = lazy(() =>
  import('../pages/health/HealthMedicalPage').then((m) => ({ default: m.HealthMedicalPage }))
);
export const HealthHygienePage = lazy(() =>
  import('../pages/health/HealthHygienePage').then((m) => ({ default: m.HealthHygienePage }))
);
export const HealthWellnessPage = lazy(() =>
  import('../pages/health/HealthWellnessPage').then((m) => ({ default: m.HealthWellnessPage }))
);
export const LegalModulePage = lazy(() =>
  import('../pages/modules/LegalModulePage').then((m) => ({ default: m.LegalModulePage }))
);
export const HrDashboardPage = lazy(() =>
  import('../pages/hr/HrDashboardPage').then((m) => ({ default: m.HrDashboardPage }))
);
export const HrEmployeesPage = lazy(() =>
  import('../pages/hr/HrEmployeesPage').then((m) => ({ default: m.HrEmployeesPage }))
);
export const HrEmployeeProfilePage = lazy(() =>
  import('../pages/hr/HrEmployeeProfilePage').then((m) => ({ default: m.HrEmployeeProfilePage }))
);
export const HrDocumentsPage = lazy(() =>
  import('../pages/hr/HrDocumentsPage').then((m) => ({ default: m.HrDocumentsPage }))
);
export const HrRecruitmentPage = lazy(() =>
  import('../pages/hr/HrRecruitmentPage').then((m) => ({ default: m.HrRecruitmentPage }))
);
export const HrLabourPage = lazy(() =>
  import('../pages/hr/HrLabourPage').then((m) => ({ default: m.HrLabourPage }))
);
export const HrPerformancePage = lazy(() =>
  import('../pages/hr/HrPerformancePage').then((m) => ({ default: m.HrPerformancePage }))
);
export const HrHoursPage = lazy(() =>
  import('../pages/hr/HrHoursPage').then((m) => ({ default: m.HrHoursPage }))
);
export const HrLeavePage = lazy(() =>
  import('../pages/hr/HrLeavePage').then((m) => ({ default: m.HrLeavePage }))
);
export const HrSettingsPage = lazy(() =>
  import('../pages/hr/HrSettingsPage').then((m) => ({ default: m.HrSettingsPage }))
);
export const HrEmployeeWellnessPage = lazy(() =>
  import('../pages/hr/HrEmployeeWellnessPage').then((m) => ({ default: m.HrEmployeeWellnessPage }))
);
export const KPIModuleLayout = lazy(() =>
  import('../pages/kpi/KPIModuleLayout').then((m) => ({ default: m.KPIModuleLayout }))
);
export const KPIDashboardPage = lazy(() =>
  import('../pages/kpi/KPIDashboardPage').then((m) => ({ default: m.KPIDashboardPage }))
);
export const KPIAssessmentsListPage = lazy(() =>
  import('../pages/kpi/KPIAssessmentsListPage').then((m) => ({ default: m.KPIAssessmentsListPage }))
);
export const KPIAssessmentCreatePage = lazy(() =>
  import('../pages/kpi/KPIAssessmentCreatePage').then((m) => ({ default: m.KPIAssessmentCreatePage }))
);
export const KPIAssessmentDetailPage = lazy(() =>
  import('../pages/kpi/KPIAssessmentDetailPage').then((m) => ({ default: m.KPIAssessmentDetailPage }))
);
export const KPILibraryPage = lazy(() =>
  import('../pages/kpi/KPILibraryPage').then((m) => ({ default: m.KPILibraryPage }))
);
export const KPIFindingsListPage = lazy(() =>
  import('../pages/kpi/KPIFindingsListPage').then((m) => ({ default: m.KPIFindingsListPage }))
);
export const KPIReportsPage = lazy(() =>
  import('../pages/kpi/KPIReportsPage').then((m) => ({ default: m.KPIReportsPage }))
);
export const KPIAnalyticsPage = lazy(() =>
  import('../pages/kpi/KPIAnalyticsPage').then((m) => ({ default: m.KPIAnalyticsPage }))
);
export const SecurityModulePage = lazy(() =>
  import('../pages/modules/SecurityModulePage').then((m) => ({ default: m.SecurityModulePage }))
);
export const SafetyManagementPage = lazy(() =>
  import('../pages/modules/SafetyManagementPage').then((m) => ({ default: m.SafetyManagementPage }))
);
export const IncidentAnalyticsPage = lazy(() =>
  import('../pages/IncidentAnalyticsPage').then((m) => ({ default: m.IncidentAnalyticsPage }))
);
export const SafetyStatisticsPage = lazy(() =>
  import('../pages/analytics/SafetyStatisticsPage').then((m) => ({ default: m.SafetyStatisticsPage }))
);
export const ComplianceAnalyticsPage = lazy(() =>
  import('../pages/analytics/ComplianceAnalyticsPage').then((m) => ({ default: m.ComplianceAnalyticsPage }))
);
export const QualityAnalyticsPage = lazy(() =>
  import('../pages/analytics/QualityAnalyticsPage').then((m) => ({ default: m.QualityAnalyticsPage }))
);
export const HCSModulePage = lazy(() =>
  import('../pages/modules/HCSModulePage').then((m) => ({ default: m.HCSModulePage }))
);
export const PjoPage = lazy(() => import('../pages/PjoPage').then((m) => ({ default: m.PjoPage })));
export const BBSPage = lazy(() => import('../pages/features/BBSPage').then((m) => ({ default: m.BBSPage })));
export const ContractorsVisitorsPage = lazy(() =>
  import('../pages/features/ContractorsVisitorsPage').then((m) => ({ default: m.ContractorsVisitorsPage }))
);
export const EmergencyPreparednessPage = lazy(() =>
  import('../pages/features/EmergencyPreparednessPage').then((m) => ({ default: m.EmergencyPreparednessPage }))
);
export const TemplateLibraryPage = lazy(() =>
  import('../pages/features/TemplateLibraryPage').then((m) => ({ default: m.TemplateLibraryPage }))
);
export const AssetManagementPage = lazy(() =>
  import('../pages/features/AssetManagementPage').then((m) => ({ default: m.AssetManagementPage }))
);
export const HazardousChemicalManagementPage = lazy(() =>
  import('../pages/features/HazardousChemicalManagementPage').then((m) => ({
    default: m.HazardousChemicalManagementPage,
  }))
);
export const LogoutPage = lazy(() =>
  import('../pages/auth/LogoutPage').then((m) => ({ default: m.LogoutPage }))
);
export const InviteAcceptPage = lazy(() =>
  import('../pages/auth/InviteAcceptPage').then((m) => ({ default: m.InviteAcceptPage }))
);
export const LoginPage = lazy(() =>
  import('../pages/auth/LoginPage').then((m) => ({ default: m.LoginPage }))
);
export const RegisterPage = lazy(() =>
  import('../pages/auth/RegisterPage').then((m) => ({ default: m.RegisterPage }))
);
export const ForgotPasswordPage = lazy(() =>
  import('../pages/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage }))
);
export const ResetPasswordPage = lazy(() =>
  import('../pages/auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage }))
);
export const LandingPage = lazy(() =>
  import('../pages/marketing/LandingPage').then((m) => ({ default: m.LandingPage }))
);
export const SecurityPage = lazy(() =>
  import('../pages/marketing/SecurityPage').then((m) => ({ default: m.SecurityPage }))
);
export const SeedDemoPage = lazy(() =>
  import('../pages/admin/SeedDemoPage').then((m) => ({ default: m.SeedDemoPage }))
);
export const AdminLicensePage = lazy(() =>
  import('../pages/admin/AdminLicensePage').then((m) => ({ default: m.AdminLicensePage }))
);
export const SuperAdminLayout = lazy(() =>
  import('../components/layout/SuperAdminLayout').then((m) => ({ default: m.SuperAdminLayout }))
);
export const SuperAdminOverviewPage = lazy(() =>
  import('../pages/admin/superadmin/SuperAdminOverviewPage').then((m) => ({ default: m.SuperAdminOverviewPage }))
);
export const SuperAdminOrganisationsPage = lazy(() =>
  import('../pages/admin/superadmin/SuperAdminOrganisationsPage').then((m) => ({
    default: m.SuperAdminOrganisationsPage,
  }))
);
export const SuperAdminLicensesPage = lazy(() =>
  import('../pages/admin/superadmin/SuperAdminLicensesPage').then((m) => ({ default: m.SuperAdminLicensesPage }))
);
export const SuperAdminModuleControlPage = lazy(() =>
  import('../pages/admin/superadmin/SuperAdminModuleControlPage').then((m) => ({
    default: m.SuperAdminModuleControlPage,
  }))
);
export const SuperAdminSellableFeaturesPage = lazy(() =>
  import('../pages/admin/superadmin/SuperAdminSellableFeaturesPage').then((m) => ({
    default: m.SuperAdminSellableFeaturesPage,
  }))
);
export const SuperAdminAuditLogsPage = lazy(() =>
  import('../pages/admin/superadmin/SuperAdminAuditLogsPage').then((m) => ({ default: m.SuperAdminAuditLogsPage }))
);
export const SuperAdminSupportModePage = lazy(() =>
  import('../pages/admin/superadmin/SuperAdminSupportModePage').then((m) => ({ default: m.SuperAdminSupportModePage }))
);
export const SuperAdminSupportTicketsPage = lazy(() =>
  import('../pages/admin/superadmin/SuperAdminSupportTicketsPage').then((m) => ({
    default: m.SuperAdminSupportTicketsPage,
  }))
);
export const SuperAdminHealthPage = lazy(() =>
  import('../pages/admin/superadmin/SuperAdminHealthPage').then((m) => ({ default: m.SuperAdminHealthPage }))
);
export const OwnerDashboardPage = lazy(() =>
  import('../pages/owner/OwnerDashboardPage').then((m) => ({ default: m.OwnerDashboardPage }))
);
export const OwnerOnboardingWizardPage = lazy(() =>
  import('../pages/owner/OwnerOnboardingWizardPage').then((m) => ({ default: m.OwnerOnboardingWizardPage }))
);
export const EmployeeDashboardPage = lazy(() =>
  import('../pages/employee/EmployeeDashboardPage').then((m) => ({ default: m.EmployeeDashboardPage }))
);
export const ExternalDashboardPage = lazy(() =>
  import('../pages/external/ExternalDashboardPage').then((m) => ({ default: m.ExternalDashboardPage }))
);
export const ActivateLicensePage = lazy(() =>
  import('../pages/activate/ActivateLicensePage').then((m) => ({ default: m.ActivateLicensePage }))
);
export const BillingStatusPage = lazy(() =>
  import('../pages/BillingStatusPage').then((m) => ({ default: m.BillingStatusPage }))
);
export const AccessDeniedPage = lazy(() =>
  import('../pages/AccessDeniedPage').then((m) => ({ default: m.AccessDeniedPage }))
);
export const WorkspaceOnboardingPage = lazy(() =>
  import('../pages/onboarding/WorkspaceOnboardingPage').then((m) => ({ default: m.WorkspaceOnboardingPage }))
);
export const HoursWorkedPage = lazy(() =>
  import('../pages/management/HoursWorkedPage').then((m) => ({ default: m.HoursWorkedPage }))
);
export const OperationalInputsPage = lazy(() =>
  import('../pages/management/OperationalInputsPage').then((m) => ({ default: m.OperationalInputsPage }))
);
