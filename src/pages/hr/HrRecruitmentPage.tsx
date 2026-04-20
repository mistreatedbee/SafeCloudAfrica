import { useMemo, useState } from 'react';
import { useUser } from '@insforge/react';
import { Layout } from '../../components/layout/Layout';
import { HrSectionNav } from './HrSectionNav';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { createHrRecord, deleteHrRecord, listHrRecords, updateHrRecord, upsertHrEmployee } from '../../api/services/hrService';
import { SelectOrType } from '../../components/ui/SelectOrType';
import type { UUID } from '../../api/models/core';
import { toUserFacingError } from '../../utils/userFacingMessage';

const COMPETENCY_OPTIONS = ['Communication', 'Safety compliance', 'Technical', 'Leadership', 'Administration'].map((value) => ({ id: value, value, label: value }));
const EXPERIENCE_OPTIONS = ['0-1 years', '2-3 years', '4-5 years', '6+ years'].map((value) => ({ id: value, value, label: value }));

export function HrRecruitmentPage() {
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const canHrManagerApprove = ['owner', 'admin'].includes(activeRole ?? '');
  const canDepartmentManagerApprove = ['owner', 'admin', 'manager', 'supervisor'].includes(activeRole ?? '');
  const canWrite = canDepartmentManagerApprove;

  const [vacancyTitle, setVacancyTitle] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [competencyRequired, setCompetencyRequired] = useState('');
  const [experienceRequired, setExperienceRequired] = useState('');
  const [referenceChecksDone, setReferenceChecksDone] = useState(false);
  const [vacancyIdForApplicant, setVacancyIdForApplicant] = useState('');

  const [applicantName, setApplicantName] = useState('');
  const [applicantEmail, setApplicantEmail] = useState('');
  const [interviewedMetRequirements, setInterviewedMetRequirements] = useState<boolean | null>(null);
  const [offerAccepted, setOfferAccepted] = useState<boolean | null>(null);
  const [leavingReason, setLeavingReason] = useState('');
  const [criminalRecord, setCriminalRecord] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { data: vacancies, refetch: refetchVacancies } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listHrRecords(activeCompanyId, 'hr_vacancies');
  }, [activeCompanyId]);

  const { data: applicants, refetch: refetchApplicants } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listHrRecords(activeCompanyId, 'hr_applicants');
  }, [activeCompanyId]);

  const vacancyMap = useMemo(() => new Map((vacancies ?? []).map((row) => [row.id as UUID, String(row.title ?? '')])), [vacancies]);

  async function onCreateVacancy() {
    if (!activeCompanyId || !user?.id || !vacancyTitle.trim()) return;
    setError(null);
    setSuccess(null);
    try {
      await createHrRecord('hr_vacancies', {
        company_id: activeCompanyId,
        title: vacancyTitle.trim(),
        status: 'OPEN',
        job_description: jobDescription.trim() || null,
        competency_required: competencyRequired.trim() || null,
        experience_required: experienceRequired.trim() || null,
        reference_checks_done: referenceChecksDone,
        department_manager_approved: false,
        created_by_user_id: user.id
      });
      setVacancyTitle('');
      setJobDescription('');
      setCompetencyRequired('');
      setExperienceRequired('');
      setReferenceChecksDone(false);
      await refetchVacancies();
      setSuccess('Saved successfully.');
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to create vacancy right now. Please try again.'));
    }
  }

  async function onCreateApplicant() {
    if (!activeCompanyId || !user?.id || !applicantName.trim()) return;
    setError(null);
    setSuccess(null);
    try {
      await createHrRecord('hr_applicants', {
        company_id: activeCompanyId,
        vacancy_id: vacancyIdForApplicant || null,
        full_name: applicantName.trim(),
        email: applicantEmail.trim() || null,
        status: 'NEW',
        cv_file_ids: [],
        interviewed_met_requirements: interviewedMetRequirements,
        offer_accepted: offerAccepted,
        previous_employer_leaving_reason: leavingReason.trim() || null,
        criminal_record: criminalRecord,
        hr_manager_approved: false,
        department_manager_approved: false,
        created_by_user_id: user.id
      });
      setApplicantName('');
      setApplicantEmail('');
      setInterviewedMetRequirements(null);
      setOfferAccepted(null);
      setLeavingReason('');
      setCriminalRecord(null);
      await refetchApplicants();
      setSuccess('Saved successfully.');
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to create applicant right now. Please try again.'));
    }
  }

  async function approveVacancyAsDepartmentManager(rowId: UUID) {
    if (!activeCompanyId || !user?.id || !canDepartmentManagerApprove) return;
    setError(null);
    setSuccess(null);
    try {
      await updateHrRecord('hr_vacancies', {
        companyId: activeCompanyId,
        rowId,
        actorUserId: user.id as UUID,
        patch: {
          department_manager_approved: true,
          department_manager_approved_by: user.id,
          department_manager_approved_at: new Date().toISOString()
        }
      });
      await refetchVacancies();
      setSuccess('Saved successfully.');
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to approve this vacancy right now.'));
    }
  }

  async function setReferenceChecked(rowId: UUID, value: boolean) {
    if (!activeCompanyId || !user?.id || !canWrite) return;
    setError(null);
    setSuccess(null);
    try {
      await updateHrRecord('hr_vacancies', {
        companyId: activeCompanyId,
        rowId,
        actorUserId: user.id as UUID,
        patch: { reference_checks_done: value }
      });
      await refetchVacancies();
      setSuccess('Saved successfully.');
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to update reference checks right now.'));
    }
  }

  async function approveApplicant(rowId: UUID, actor: 'hr' | 'dept') {
    if (!activeCompanyId || !user?.id) return;
    setError(null);
    setSuccess(null);
    const patch =
      actor === 'hr'
        ? { hr_manager_approved: true, hr_manager_approved_by: user.id, hr_manager_approved_at: new Date().toISOString() }
        : { department_manager_approved: true, department_manager_approved_by: user.id, department_manager_approved_at: new Date().toISOString() };
    try {
      await updateHrRecord('hr_applicants', {
        companyId: activeCompanyId,
        rowId,
        actorUserId: user.id as UUID,
        patch
      });
      await refetchApplicants();
      setSuccess('Saved successfully.');
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to approve this applicant right now.'));
    }
  }

  async function convertApplicantToEmployee(row: Record<string, unknown>) {
    if (!activeCompanyId || !user?.id) return;
    setSuccess(null);
    const hrApproved = Boolean(row.hr_manager_approved);
    const deptApproved = Boolean(row.department_manager_approved);
    if (!hrApproved || !deptApproved) {
      setError('Applicant requires both HR Manager and Department Manager approval before conversion.');
      return;
    }
    const vacancyId = row.vacancy_id as UUID | null;
    if (vacancyId) {
      const vacancy = (vacancies ?? []).find((v) => v.id === vacancyId);
      if (!vacancy || !vacancy.department_manager_approved || !vacancy.reference_checks_done) {
        setError('Vacancy must be department-approved and reference checks completed before conversion.');
        return;
      }
    }
    const fullName = String(row.full_name ?? '').trim();
    const [firstName, ...rest] = fullName.split(' ').filter(Boolean);
    const lastName = rest.join(' ') || 'Unknown';
    const employeeNo = `EMP-${Date.now().toString().slice(-6)}`;
    try {
      const employee = await upsertHrEmployee({
        company_id: activeCompanyId,
        created_by_user_id: user.id as UUID,
        employee_no: employeeNo,
        first_name: firstName || 'Unknown',
        last_name: lastName,
        email: String(row.email ?? `${employeeNo.toLowerCase()}@pending.local`),
        employment_type: 'Permanent',
        start_date: new Date().toISOString().slice(0, 10),
        employment_status: 'ONBOARDING'
      });
      await updateHrRecord('hr_applicants', {
        companyId: activeCompanyId,
        rowId: row.id as UUID,
        actorUserId: user.id as UUID,
        patch: {
          converted_employee_id: employee.id,
          status: 'HIRED'
        }
      });
      await refetchApplicants();
      setSuccess('Employee saved successfully.');
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to convert applicant to employee right now.'));
    }
  }

  async function onDeleteRecord(table: 'hr_vacancies' | 'hr_applicants', rowId: UUID) {
    if (!activeCompanyId || !user?.id) return;
    const confirmed = window.confirm('Are you sure you want to delete this record?');
    if (!confirmed) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteHrRecord(table, {
        companyId: activeCompanyId,
        rowId,
        actorUserId: user.id as UUID
      });
      if (table === 'hr_vacancies') {
        await refetchVacancies();
        if (vacancyIdForApplicant === String(rowId)) setVacancyIdForApplicant('');
      } else {
        await refetchApplicants();
      }
      setSuccess('Saved successfully.');
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to delete this record right now.'));
    }
  }

  return (
    <Layout title="Recruitment & Selection">
      <div className="space-y-4">
        <HrSectionNav />
        {error && <div className="bg-critical/10 border border-critical/30 rounded-xl p-3 text-sm text-critical">{error}</div>}
        {success && <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700">{success}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
            <h3 className="font-semibold">Vacancy Management</h3>
            <div className="space-y-3">
              <input className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm" value={vacancyTitle} onChange={(e) => setVacancyTitle(e.target.value)} placeholder="Open vacancy title" />
              <textarea className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm min-h-[100px]" value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} placeholder="Job description (rich text supported as plain text input)" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <SelectOrType
                  label="Competency required"
                  value={competencyRequired}
                  options={COMPETENCY_OPTIONS}
                  onChange={(value) => setCompetencyRequired(value)}
                  companyId={activeCompanyId ?? undefined}
                  moduleKey="hr"
                  fieldKey="vacancy_competency_required"
                  createdByUserId={user?.id as UUID | undefined}
                  allowCreate={!!activeCompanyId}
                />
                <SelectOrType
                  label="Experience required"
                  value={experienceRequired}
                  options={EXPERIENCE_OPTIONS}
                  onChange={(value) => setExperienceRequired(value)}
                  companyId={activeCompanyId ?? undefined}
                  moduleKey="hr"
                  fieldKey="vacancy_experience_required"
                  createdByUserId={user?.id as UUID | undefined}
                  allowCreate={!!activeCompanyId}
                />
              </div>
              <label className="text-sm flex items-center gap-2">
                <input type="checkbox" checked={referenceChecksDone} onChange={(e) => setReferenceChecksDone(e.target.checked)} />
                Reference checks done
              </label>
              <button className="px-4 py-2 rounded-lg bg-teal text-white text-sm" onClick={() => void onCreateVacancy()} disabled={!canWrite}>
                Create Vacancy
              </button>
            </div>
            <div className="space-y-2 text-sm">
              {(vacancies ?? []).map((row) => (
                <div key={String(row.id)} className="border border-surface-200 rounded-lg p-3">
                  <p className="font-medium">{String(row.title ?? '')}</p>
                  <p className="text-charcoal-500">{String(row.competency_required ?? '-')} | {String(row.experience_required ?? '-')}</p>
                  <p className="text-charcoal-500">Dept approval: {String(!!row.department_manager_approved)} | Ref checks: {String(!!row.reference_checks_done)}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {canDepartmentManagerApprove && !row.department_manager_approved && (
                      <button className="text-xs px-2 py-1 rounded border border-surface-300" onClick={() => void approveVacancyAsDepartmentManager(row.id as UUID)}>Approve (Department Manager)</button>
                    )}
                    {canWrite && (
                      <button className="text-xs px-2 py-1 rounded border border-surface-300" onClick={() => void setReferenceChecked(row.id as UUID, !row.reference_checks_done)}>
                        Reference checks: {row.reference_checks_done ? 'Yes' : 'No'}
                      </button>
                    )}
                    {canWrite && (
                      <button className="text-xs px-2 py-1 rounded border border-critical/40 text-critical" onClick={() => void onDeleteRecord('hr_vacancies', row.id as UUID)}>Delete</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
            <h3 className="font-semibold">Applicant Management</h3>
            <div className="space-y-3">
              <select className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm" value={vacancyIdForApplicant} onChange={(e) => setVacancyIdForApplicant(e.target.value)}>
                <option value="">Select vacancy (optional)</option>
                {(vacancies ?? []).map((row) => <option key={String(row.id)} value={String(row.id)}>{String(row.title ?? '')}</option>)}
              </select>
              <input className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm" value={applicantName} onChange={(e) => setApplicantName(e.target.value)} placeholder="Applicant name" />
              <input className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm" value={applicantEmail} onChange={(e) => setApplicantEmail(e.target.value)} placeholder="Applicant email" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-sm">Interviewed & met requirements?
                  <select className="w-full mt-1 border border-surface-300 rounded-lg px-3 py-2" value={interviewedMetRequirements === null ? '' : interviewedMetRequirements ? 'yes' : 'no'} onChange={(e) => setInterviewedMetRequirements(e.target.value === '' ? null : e.target.value === 'yes')}>
                    <option value="">Select</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </label>
                <label className="text-sm">Offer accepted?
                  <select className="w-full mt-1 border border-surface-300 rounded-lg px-3 py-2" value={offerAccepted === null ? '' : offerAccepted ? 'yes' : 'no'} onChange={(e) => setOfferAccepted(e.target.value === '' ? null : e.target.value === 'yes')}>
                    <option value="">Select</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </label>
              </div>
              <input className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm" value={leavingReason} onChange={(e) => setLeavingReason(e.target.value)} placeholder="Reason for leaving previous employer" />
              <label className="text-sm">Criminal record?
                <select className="w-full mt-1 border border-surface-300 rounded-lg px-3 py-2" value={criminalRecord === null ? '' : criminalRecord ? 'yes' : 'no'} onChange={(e) => setCriminalRecord(e.target.value === '' ? null : e.target.value === 'yes')}>
                  <option value="">Select</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
              <button className="px-4 py-2 rounded-lg bg-teal text-white text-sm" onClick={() => void onCreateApplicant()} disabled={!canWrite}>
                Add Applicant
              </button>
            </div>

            <div className="space-y-2 text-sm">
              {(applicants ?? []).map((row) => (
                <div key={String(row.id)} className="border border-surface-200 rounded-lg p-3">
                  <p className="font-medium">{String(row.full_name ?? '')}</p>
                  <p className="text-charcoal-500">Vacancy: {row.vacancy_id ? String(vacancyMap.get(row.vacancy_id as UUID) ?? row.vacancy_id) : '-'}</p>
                  <p className="text-charcoal-500">Interviewed+Met: {String(row.interviewed_met_requirements ?? '-')} | Offer accepted: {String(row.offer_accepted ?? '-')}</p>
                  <p className="text-charcoal-500">HR approval: {String(Boolean(row.hr_manager_approved))} | Department approval: {String(Boolean(row.department_manager_approved))}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {canHrManagerApprove && !row.hr_manager_approved && (
                      <button className="text-xs px-2 py-1 rounded border border-surface-300" onClick={() => void approveApplicant(row.id as UUID, 'hr')}>Approve (HR Manager)</button>
                    )}
                    {canDepartmentManagerApprove && !row.department_manager_approved && (
                      <button className="text-xs px-2 py-1 rounded border border-surface-300" onClick={() => void approveApplicant(row.id as UUID, 'dept')}>Approve (Department Manager)</button>
                    )}
                    <button className="text-xs px-2 py-1 rounded border border-surface-300" onClick={() => void convertApplicantToEmployee(row)}>
                      Convert to Employee
                    </button>
                    {canWrite && (
                      <button className="text-xs px-2 py-1 rounded border border-critical/40 text-critical" onClick={() => void onDeleteRecord('hr_applicants', row.id as UUID)}>Delete</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

