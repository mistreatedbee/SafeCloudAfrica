import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, 'src/App.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// List of page components to replace with LazyPages namespace
const components = [
  'DashboardPage',
  'SafetyPage',
  'QualityPage',
  'EnvironmentPage',
  'EnvironmentDashboardPage',
  'EnvironmentEiaPage',
  'EnvironmentRiskOpportunityPage',
  'EnvironmentWastePage',
  'EnvironmentWaterPage',
  'EnvironmentAirPage',
  'DocumentsPage',
  'TasksPage',
  'TaskDetailPage',
  'IncidentsPage',
  'TrainingPage',
  'AuditsPage',
  'InspectionsPage',
  'InspectionDetailPage',
  'InspectionRunReportPage',
  'ReportsPage',
  'SettingsPage',
  'ProfilePage',
  'HelpSupportPage',
  'NCRsPage',
  'QualityCustomerComplaintsPage',
  'QualityInternalExternalIssuesPage',
  'CalibrationPage',
  'RisksPage',
  'RiskAssessmentCreatePage',
  'RiskAssessmentDetailPage',
  'RiskAssessmentEditPage',
  'PPEPage',
  'LegalRegisterPage',
  'LegalRequirementDetailPage',
  'LegalUpdatesPage',
  'UsersPage',
  'PlanningReviewPage',
  'ApprovalsPage',
  'DocumentReviewsPage',
  'ReviewMeetingDetailPage',
  'ReviewMeetingActionsBoardPage',
  'ImprovementPage',
  'ImprovementDetailPage',
  'CapaDetailPage',
  'GeneralModulePage',
  'HealthDashboardPage',
  'HealthMedicalPage',
  'HealthHygienePage',
  'HealthWellnessPage',
  'LegalModulePage',
  'HrDashboardPage',
  'HrEmployeesPage',
  'HrEmployeeProfilePage',
  'HrDocumentsPage',
  'HrRecruitmentPage',
  'HrLabourPage',
  'HrPerformancePage',
  'HrHoursPage',
  'HrLeavePage',
  'HrSettingsPage',
  'KPIModuleLayout',
  'KPIDashboardPage',
  'KPIAssessmentsListPage',
  'KPIAssessmentCreatePage',
  'KPIAssessmentDetailPage',
  'KPILibraryPage',
  'KPIFindingsListPage',
  'KPIReportsPage',
  'KPIAnalyticsPage',
  'SecurityModulePage',
  'SafetyManagementPage',
  'IncidentAnalyticsPage',
  'SafetyStatisticsPage',
  'ComplianceAnalyticsPage',
  'QualityAnalyticsPage',
  'HCSModulePage',
  'PjoPage',
  'BBSPage',
  'ContractorsVisitorsPage',
  'EmergencyPreparednessPage',
  'TemplateLibraryPage',
  'AssetManagementPage',
  'HazardousChemicalManagementPage',
  'OwnerDashboardPage',
  'OwnerOnboardingWizardPage',
  'EmployeeDashboardPage',
  'ExternalDashboardPage',
];

// Replace each component with LazyPages.Component (but not LazyPages.Component)
components.forEach(comp => {
  // Match the component when not already prefixed with LazyPages.
  const regex = new RegExp(`(?<!LazyPages\\.)\\b${comp}\\b`, 'g');
  content = content.replace(regex, `LazyPages.${comp}`);
});

fs.writeFileSync(filePath, content, 'utf-8');
console.log('✓ Updated src/App.tsx with LazyPages namespace');
